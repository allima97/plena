import { upcomingDue, pausedSeries, currentMonthKey, faturaDoCartao, saldoContaAte } from './derived.js';
import { computeMetrics } from '../goals/metrics.js';

function shiftMonthKey(mKey, delta) {
	const [y, m] = mKey.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Lista unificada de itens que merecem atenção do usuário (vencimentos próximos,
 * cartão com uso alto, metas fora do ritmo, séries pausadas), ordenada por
 * severidade (mais urgente primeiro). Usada no Dashboard (recorte top N) e na
 * central de notificações (lista completa) — fonte única para as duas telas.
 */
export function buildAttentionItems(
	{ transactions, accounts, goals, resources, resourceMoves, goalCategories, installments, amortizations, alertThresholds },
	limit = Infinity
) {
	const list = [];
	const mKey = currentMonthKey();
	const alertas = upcomingDue(transactions, alertThresholds);
	const pausadas = pausedSeries(transactions);

	// Vencimento com um único lançamento pendente vira ação direta ("Pagar agora");
	// com vários, mantém a navegação para a lista (não há um único alvo para agir).
	function vencimentoItem(grupo, tone, dias, weight) {
		const um = grupo.length === 1;
		return {
			tone,
			text: `${grupo.length} vencimento${grupo.length > 1 ? 's' : ''} em até ${dias} dia(s)${um && grupo[0]?.descricao ? ' — ' + grupo[0].descricao : ''}`,
			actionLabel: um ? 'Pagar agora' : 'Ver lançamentos',
			href: '/movimentacoes',
			action: um ? { kind: 'pay', transactionId: grupo[0].id } : null,
			weight
		};
	}

	if (alertas.um.length) {
		list.push(vencimentoItem(alertas.um, 'red', alertThresholds.um, 100));
	} else if (alertas.tres.length) {
		list.push(vencimentoItem(alertas.tres, 'orange', alertThresholds.tres, 80));
	} else if (alertas.sete.length) {
		list.push(vencimentoItem(alertas.sete, 'yellow', alertThresholds.sete, 50));
	}

	for (const acc of accounts.filter((a) => a.tipo === 'cartao')) {
		const fatura = faturaDoCartao(transactions, acc, mKey);
		const pct = acc.limite ? (fatura / acc.limite) * 100 : 0;
		if (pct >= 70) {
			list.push({
				tone: pct >= 90 ? 'red' : 'orange',
				text: `Cartão ${acc.nome} chega a ${Math.round(pct)}% do limite`,
				actionLabel: 'Ver fatura',
				href: '/contas',
				weight: pct
			});
		}
	}

	for (const g of goals.filter((gl) => !gl.archived)) {
		const m = computeMetrics(g, { resources, resourceMoves, goalCategories, installments, amortizations });
		if (m.statusTone === 'danger') {
			const resource = resources.find((r) => r.goalId === g.id);
			list.push({
				tone: 'orange',
				text: `Meta "${g.name}" está abaixo do ritmo`,
				actionLabel: resource && m.recommendedMonthly > 0 ? 'Ajustar aporte' : 'Ver objetivo',
				href: '/objetivos',
				action: resource && m.recommendedMonthly > 0 ? { kind: 'aporte', goalId: g.id, resourceId: resource.id, valor: m.recommendedMonthly } : null,
				weight: 60
			});
		} else if (m.statusTone === 'good' && m.percent < 1) {
			list.push({ tone: 'green', text: `Meta "${g.name}" está acima do ritmo`, actionLabel: 'Ver objetivo', href: '/objetivos', weight: 5 });
		}
	}

	// Alerta futuro (Fase 3): projeta o saldo em contas líquidas dia a dia pelos próximos 30 dias
	// (mesmo cálculo de saldoContaAte usado no Dashboard) e avisa assim que ele cruzar pra negativo
	// -- diferente do alerta de vencimento, que olha só o lançamento em si, não o caixa acumulado.
	const contasLiquidas = accounts.filter((a) => a.tipo !== 'cartao');
	if (contasLiquidas.length) {
		for (let dias = 1; dias <= 30; dias++) {
			const d = new Date();
			d.setDate(d.getDate() + dias);
			const pad = (n) => String(n).padStart(2, '0');
			const dataISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
			const saldoProjetado = contasLiquidas.reduce((s, acc) => s + saldoContaAte(transactions, acc, dataISO), 0);
			if (saldoProjetado < 0) {
				list.push({
					tone: 'red',
					text: `Seu saldo pode ficar negativo em ${dias} dia${dias > 1 ? 's' : ''}`,
					actionLabel: 'Ver projeção',
					href: '/',
					weight: 95
				});
				break;
			}
		}
	}

	// Fatura bem acima da média dos últimos 3 meses -- sinal de comportamento de gasto, diferente
	// do alerta de "perto do limite" acima (que é sobre risco de estourar o cartão).
	for (const acc of accounts.filter((a) => a.tipo === 'cartao')) {
		const faturaAtual = faturaDoCartao(transactions, acc, mKey);
		const mediaAnterior = [1, 2, 3].reduce((s, i) => s + faturaDoCartao(transactions, acc, shiftMonthKey(mKey, -i)), 0) / 3;
		if (mediaAnterior >= 50 && faturaAtual > mediaAnterior * 1.25) {
			list.push({
				tone: 'orange',
				text: `Fatura do cartão ${acc.nome} está ${Math.round((faturaAtual / mediaAnterior - 1) * 100)}% acima da média`,
				actionLabel: 'Ver fatura',
				href: '/contas',
				weight: 55
			});
		}
	}

	if (pausadas.length) {
		list.push({
			tone: 'gray',
			text: `${pausadas.length} série${pausadas.length > 1 ? 's' : ''} pausada${pausadas.length > 1 ? 's' : ''}`,
			actionLabel: 'Ver movimentações',
			href: '/movimentacoes',
			weight: 30
		});
	}

	list.sort((a, b) => b.weight - a.weight);
	return Number.isFinite(limit) ? list.slice(0, limit) : list;
}
