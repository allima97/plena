import { monthKey, todayISO } from '../format.js';

export function currentMonthKey() {
	return monthKey(todayISO());
}

export function monthTransactions(transactions, mKey = currentMonthKey()) {
	return transactions.filter((t) => monthKey(t.data) === mKey);
}

export function totals(transactions) {
	let receitas = 0;
	let despesas = 0;
	for (const t of transactions) {
		if (t.isTransferencia) continue; // transferência entre contas não é receita nem despesa real
		if (t.tipo === 'receita') receitas += Number(t.valor) || 0;
		else despesas += Number(t.valor) || 0;
	}
	return { receitas, despesas, saldo: receitas - despesas };
}

/**
 * Saldo real de uma conta até uma data-limite (por padrão, hoje) -- inclui transferências (elas
 * de fato movem dinheiro entre contas) mas NUNCA lançamentos com data futura, que já podem estar
 * pré-gerados no sistema (parcelas e recorrências futuras) sem que o dinheiro tenha saído/entrado
 * de verdade ainda. Use esta função em vez de somar `transactions` direto sempre que o objetivo
 * for "quanto eu tenho HOJE nesta conta", para não misturar saldo real com saldo comprometido.
 */
export function saldoContaAte(transactions, acc, dataLimite = todayISO()) {
	let saldo = acc.saldoInicial || 0;
	for (const t of transactions) {
		if (t.contaId !== acc.id) continue;
		if (t.data > dataLimite) continue;
		if (t.tipo === 'receita') saldo += Number(t.valor) || 0;
		else saldo -= Number(t.valor) || 0;
	}
	return saldo;
}

/** Soma de parcelas/recorrências ativas com vencimento no mês informado. */
export function committedThisMonth(transactions, mKey = currentMonthKey()) {
	return monthTransactions(transactions, mKey)
		.filter((t) => t.seriesId && t.seriesStatus === 'ativa' && !t.isTransferencia)
		.reduce((sum, t) => sum + (Number(t.valor) || 0), 0);
}

export function daysUntil(iso, today = new Date(todayISO())) {
	const target = new Date(iso + 'T00:00:00');
	return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Lançamentos de série ativa, ainda não pagos, vencendo dentro de `thresholds.sete` dias. */
export function upcomingDue(transactions, thresholds) {
	const today = new Date(todayISO());
	const upcoming = transactions
		.filter((t) => t.seriesId && t.seriesStatus === 'ativa' && t.statusPagamento !== 'pago')
		.map((t) => ({ ...t, dias: daysUntil(t.data, today) }))
		.filter((t) => t.dias >= 0 && t.dias <= thresholds.sete)
		.sort((a, b) => a.dias - b.dias);

	return {
		um: upcoming.filter((t) => t.dias <= thresholds.um),
		tres: upcoming.filter((t) => t.dias > thresholds.um && t.dias <= thresholds.tres),
		sete: upcoming.filter((t) => t.dias > thresholds.tres),
		total: upcoming.length
	};
}

/** Uma linha por série pausada (para exibir na dashboard). */
export function pausedSeries(transactions) {
	const seen = new Set();
	const out = [];
	for (const t of transactions) {
		if (t.seriesId && t.seriesStatus === 'pausada' && !seen.has(t.seriesId)) {
			seen.add(t.seriesId);
			out.push(t);
		}
	}
	return out;
}

export function nextScheduleDate(schedule) {
	const today = new Date();
	let next = new Date(today.getFullYear(), today.getMonth(), schedule.dia);
	if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, schedule.dia);
	return next.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/**
 * Mês de fatura (YYYY-MM) de uma compra de cartão, considerando o dia de
 * fechamento: compra até o fechamento cai na fatura do mês corrente, depois
 * do fechamento cai na fatura do mês seguinte. Sem fechamento configurado
 * (cartões antigos, ainda sem esse campo), mantém o comportamento anterior
 * de agrupar pelo mês civil da compra.
 */
export function faturaMonthOf(dataISO, diaFechamento) {
	if (!diaFechamento) return dataISO.slice(0, 7);
	const [y, m, d] = dataISO.split('-').map(Number);
	if (d <= diaFechamento) return `${y}-${String(m).padStart(2, '0')}`;
	const next = new Date(y, m, 1);
	return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

/** Soma das despesas de um cartão que caem na fatura de um mês (default: mês atual). */
export function faturaDoCartao(transactions, acc, mKey = currentMonthKey()) {
	return transactions
		.filter((t) => t.contaId === acc.id && t.tipo === 'despesa' && !t.isTransferencia)
		.filter((t) => faturaMonthOf(t.data, acc.fechamento) === mKey)
		.reduce((s, t) => s + (Number(t.valor) || 0), 0);
}

/** Mês (YYYY-MM) seguinte ao informado. */
export function nextMonthKey(mKey) {
	const [y, m] = mKey.split('-').map(Number);
	const d = new Date(y, m, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Totais por categoria (para gráfico/relatório), só de um tipo. */
export function byCategory(transactions, categories, tipo) {
	const map = new Map();
	for (const t of transactions) {
		if (t.tipo !== tipo || t.isTransferencia) continue;
		const cat = categories.find((c) => c.id === t.categoriaId);
		const nome = cat ? cat.nome : 'Sem categoria';
		map.set(nome, (map.get(nome) || 0) + (Number(t.valor) || 0));
	}
	return [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
}
