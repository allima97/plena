import { totals, monthTransactions, committedThisMonth, currentMonthKey, faturaDoCartao } from './derived.js';
import { computeMetrics, resourceBalance } from '../goals/metrics.js';
import { fmtMoney } from '../format.js';

function clamp(n, min = 0, max = 100) {
	return Math.max(min, Math.min(max, n));
}

function shiftMonthKey(mKey, delta) {
	const [y, m] = mKey.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function mediaUltimosMeses(transactions, mKey, n, campo, startDay = 1) {
	let soma = 0;
	for (let i = 1; i <= n; i++) soma += totals(monthTransactions(transactions, shiftMonthKey(mKey, -i), startDay))[campo];
	return soma / n;
}

/**
 * Score financeiro (0-100) e seu detalhamento por componente, todo baseado em
 * regras simples sobre dados que o app já calcula (sem IA, sem infraestrutura
 * nova): fluxo de caixa, comprometimento, uso de cartão, reserva de
 * emergência, ritmo dos objetivos e previsibilidade dos gastos.
 */
export function computeFinancialScore({ transactions, accounts, goals, resources, resourceMoves, goalCategories, installments, amortizations, startDay = 1 }) {
	const mKey = currentMonthKey(startDay);
	const mesTx = monthTransactions(transactions, mKey, startDay);
	const t = totals(mesTx);

	const fluxoCaixa = t.receitas > 0 ? clamp(50 + (t.saldo / t.receitas) * 50) : t.despesas === 0 ? 100 : 30;

	const comprometidoMes = committedThisMonth(transactions, mKey, startDay);
	const comprometimento = t.receitas > 0 ? clamp(100 - (comprometidoMes / t.receitas) * 100) : 60;

	const cartoesComLimite = accounts.filter((a) => a.tipo === 'cartao' && a.limite);
	const cartoesScore = cartoesComLimite.length
		? clamp(100 - cartoesComLimite.reduce((s, acc) => s + (faturaDoCartao(transactions, acc, mKey, startDay) / acc.limite) * 100, 0) / cartoesComLimite.length)
		: 100;

	const mediaDespesas3Meses = mediaUltimosMeses(transactions, mKey, 3, 'despesas', startDay);
	const reservaTotal = resources.filter((r) => r.group === 'reserva').reduce((s, r) => s + resourceBalance(resourceMoves, r.id), 0);
	const mesesCobertos = mediaDespesas3Meses > 0 ? reservaTotal / mediaDespesas3Meses : reservaTotal > 0 ? 6 : 0;
	const reservaScore = clamp((mesesCobertos / 6) * 100, reservaTotal > 0 ? 15 : 0, 100);

	const ativos = goals.filter((g) => !g.archived);
	const TONE_SCORE = { good: 100, neutral: 70, warn: 45, danger: 20 };
	const objetivosScore = ativos.length
		? ativos.reduce((s, g) => {
				const m = computeMetrics(g, { resources, resourceMoves, goalCategories, installments, amortizations });
				return s + (TONE_SCORE[m.statusTone] ?? 60);
			}, 0) / ativos.length
		: 70;

	const despesasUltimos3 = [1, 2, 3].map((i) => totals(monthTransactions(transactions, shiftMonthKey(mKey, -i), startDay)).despesas);
	const previsibilidadeScore = (() => {
		const media = despesasUltimos3.reduce((s, v) => s + v, 0) / 3;
		if (media <= 0) return 70;
		const variancia = despesasUltimos3.reduce((s, v) => s + (v - media) ** 2, 0) / 3;
		const cv = Math.sqrt(variancia) / media;
		return clamp(100 - cv * 140);
	})();

	const components = [
		{ key: 'fluxoCaixa', label: 'Fluxo de caixa', value: Math.round(fluxoCaixa) },
		{ key: 'comprometimento', label: 'Comprometimento', value: Math.round(comprometimento) },
		{ key: 'cartoes', label: 'Cartões', value: Math.round(cartoesScore) },
		{ key: 'reserva', label: 'Reserva', value: Math.round(reservaScore) },
		{ key: 'objetivos', label: 'Objetivos', value: Math.round(objetivosScore) },
		{ key: 'previsibilidade', label: 'Previsibilidade', value: Math.round(previsibilidadeScore) }
	];
	const overall = Math.round(components.reduce((s, c) => s + c.value, 0) / components.length);
	const tone = overall >= 75 ? 'good' : overall >= 55 ? 'neutral' : overall >= 35 ? 'warn' : 'danger';
	const label = overall >= 75 ? 'Boa' : overall >= 55 ? 'Razoável' : overall >= 35 ? 'Atenção' : 'Crítica';

	return { overall, tone, label, components };
}

/**
 * Motor de insights: várias leituras curtas e tipadas (comportamento,
 * oportunidade, risco, objetivo, cartão), em vez de um único texto genérico.
 * Também funciona como detecção simples de anomalia (categoria com gasto bem
 * acima da própria média).
 */
export function buildInsights({ transactions, accounts, goals, resources, resourceMoves, goalCategories, installments, amortizations, categories, startDay = 1 }, limit = 3) {
	const mKey = currentMonthKey(startDay);
	const mesTx = monthTransactions(transactions, mKey, startDay);
	const t = totals(mesTx);
	const insights = [];

	function totalPorCategoria(txs, categoriaId) {
		return txs
			.filter((tr) => tr.tipo === 'despesa' && !tr.isTransferencia && tr.categoriaId === categoriaId)
			.reduce((s, tr) => s + (Number(tr.valor) || 0), 0);
	}
	const mesesAnteriores = [1, 2, 3].map((i) => monthTransactions(transactions, shiftMonthKey(mKey, -i), startDay));

	// Comportamento / anomalia: categoria com maior alta vs média dos últimos 3 meses.
	let maiorAlta = null;
	for (const cat of categories.filter((c) => c.tipo === 'despesa')) {
		const atual = totalPorCategoria(mesTx, cat.id);
		const mediaAnterior = mesesAnteriores.reduce((s, txs) => s + totalPorCategoria(txs, cat.id), 0) / 3;
		if (mediaAnterior >= 50 && atual > mediaAnterior * 1.25) {
			const pct = Math.round((atual / mediaAnterior - 1) * 100);
			if (!maiorAlta || pct > maiorAlta.pct) maiorAlta = { cat, pct };
		}
	}
	if (maiorAlta) {
		insights.push({
			tipo: 'comportamento',
			title: `Gasto em alta: ${maiorAlta.cat.nome}`,
			body: `Seus gastos com ${maiorAlta.cat.nome} aumentaram ${maiorAlta.pct}% em relação à média dos últimos 3 meses.`
		});
	}

	// Risco: compromissos do mês pesando muito na receita média.
	const receitaMedia3 = mediaUltimosMeses(transactions, mKey, 3, 'receitas', startDay) || t.receitas;
	const comprometidoMes = committedThisMonth(transactions, mKey, startDay);
	if (receitaMedia3 > 0 && comprometidoMes / receitaMedia3 > 0.7) {
		insights.push({
			tipo: 'risco',
			title: 'Compromissos pesando no orçamento',
			body: `Seus compromissos deste mês representam ${Math.round((comprometidoMes / receitaMedia3) * 100)}% da sua receita média.`
		});
	}

	// Oportunidade: gastou visivelmente menos que o habitual.
	const mediaDespesas3 = mediaUltimosMeses(transactions, mKey, 3, 'despesas', startDay);
	if (mediaDespesas3 > 0 && t.despesas < mediaDespesas3 * 0.9) {
		const economia = mediaDespesas3 - t.despesas;
		insights.push({
			tipo: 'oportunidade',
			title: 'Você gastou menos que o habitual',
			body: `Você gastou ${fmtMoney(economia)} a menos que a média dos últimos meses. Esse valor poderia acelerar um dos seus objetivos.`
		});
	}

	// Cartão: fatura subindo forte vs mês anterior.
	for (const acc of accounts.filter((a) => a.tipo === 'cartao' && a.limite)) {
		const faturaAtualAcc = faturaDoCartao(transactions, acc, mKey, startDay);
		const faturaAnteriorAcc = faturaDoCartao(transactions, acc, shiftMonthKey(mKey, -1), startDay);
		if (faturaAnteriorAcc > 0 && faturaAtualAcc > faturaAnteriorAcc * 1.2) {
			insights.push({
				tipo: 'cartao',
				title: `Cartão ${acc.nome} em alta`,
				body: `A fatura está ${Math.round((faturaAtualAcc / faturaAnteriorAcc - 1) * 100)}% maior que a do mês passado.`
			});
		}
	}

	// Objetivo: alguma meta ativa adiantada.
	for (const g of goals.filter((gl) => !gl.archived)) {
		const m = computeMetrics(g, { resources, resourceMoves, goalCategories, installments, amortizations });
		if (m.statusTone === 'good' && m.percent < 1) {
			insights.push({
				tipo: 'objetivo',
				title: `Meta "${g.name}" adiantada`,
				body: 'Mantendo o ritmo atual, essa meta deve ser concluída antes do previsto.'
			});
			break;
		}
	}

	if (!insights.length) {
		if (t.saldo >= 0) {
			insights.push({ tipo: 'comportamento', title: 'Mês positivo até aqui.', body: 'As entradas superam as saídas neste mês. Continue de olho nos vencimentos próximos.' });
		} else {
			insights.push({ tipo: 'risco', title: 'Fique de olho nos gastos.', body: 'As saídas superaram as entradas neste mês. Vale revisar as categorias com maior peso em Relatórios.' });
		}
	}

	return insights.slice(0, limit);
}
