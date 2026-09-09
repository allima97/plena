import { upcomingDue, pausedSeries, currentMonthKey, faturaDoCartao } from './derived.js';
import { computeMetrics } from '../goals/metrics.js';

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
