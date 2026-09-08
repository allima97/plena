// Cálculos portados do Rumo Financeiro (nextgoals) -- mesmas fórmulas,
// adaptadas para receber os dados por parâmetro em vez de ler um `S` global.

export function num(v, d = 0) {
	const n = parseFloat(v);
	return isFinite(n) ? n : d;
}

export function clamp01(v) {
	return Math.max(0, Math.min(1, v));
}

export function monthsBetween(from, to) {
	let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
	if (to.getDate() < from.getDate()) months -= 1;
	return months;
}

/** Diferença fracionária em meses (to - from), usada para extrapolar um ritmo através de meses parciais. */
export function monthsBetweenF(from, to) {
	return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.4368);
}

export function addMonthsF(date, n) {
	const whole = Math.floor(n);
	const frac = n - whole;
	const d = new Date(date);
	d.setMonth(d.getMonth() + whole);
	d.setDate(d.getDate() + Math.round(frac * 30));
	return d;
}

// Interpolação vermelho -> amarelo -> verde em HSL (não em RGB, que cruzaria
// por um marrom sujo no meio do caminho), usando os tons já usados no
// design do Plena para despesa/alerta/receita.
function hexToHsl(hex) {
	const h = (hex || '').trim().replace('#', '');
	const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
	const int = parseInt(n, 16) || 0;
	const r = ((int >> 16) & 255) / 255;
	const g = ((int >> 8) & 255) / 255;
	const b = (int & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let hh = 0;
	let s = 0;
	const l = (max + min) / 2;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				hh = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				hh = (b - r) / d + 2;
				break;
			default:
				hh = (r - g) / d + 4;
		}
		hh *= 60;
	}
	return { h: hh, s, l };
}
function mixHsl(a, b, t) {
	let dh = b.h - a.h;
	if (dh > 180) dh -= 360;
	if (dh < -180) dh += 360;
	let h = a.h + dh * t;
	if (h < 0) h += 360;
	if (h >= 360) h -= 360;
	return { h, s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
}
const DANGER = hexToHsl('#e06b5f');
const WARN = hexToHsl('#c38b35');
const GOOD = hexToHsl('#23a768');
export function progressColor(percent) {
	const p = clamp01(percent);
	const mix = p <= 0.5 ? mixHsl(DANGER, WARN, p / 0.5) : mixHsl(WARN, GOOD, (p - 0.5) / 0.5);
	return `hsl(${mix.h.toFixed(1)},${(mix.s * 100).toFixed(1)}%,${(mix.l * 100).toFixed(1)}%)`;
}

export function resourceBalance(moves, resourceId) {
	return moves.filter((m) => m.resourceId === resourceId).reduce((s, m) => s + (m.amount || 0), 0);
}

/** Prestações anotadas com o abatimento (amortização - correção monetária + amortizações extras do mês). */
export function installmentsWithDelta(installments, amortizations) {
	// Protege contra prestações duplicadas com o mesmo número (ex.: um envio duplicado no
	// formulário, ou uma importação que rodou mais de uma vez) -- mantém só a última gravada
	// para cada número, do contrário os totais de Encargos e Abatimentos saem inflados.
	const byNumber = new Map();
	for (const it of installments) byNumber.set(it.number, it);
	const list = [...byNumber.values()].sort((a, b) => a.number - b.number);
	let prevSaldo = null;
	return list.map((it) => {
		const month = (it.date || '').slice(0, 7);
		const extraList = amortizations.filter((a) => (a.date || '').slice(0, 7) === month);
		const extra = extraList.reduce((s, a) => s + (a.amount || 0), 0);
		const delta = (it.amortizacao || 0) - (it.correcaoMonetaria || 0) + extra;
		const deltaPct = prevSaldo ? (delta / prevSaldo) * 100 : null;
		const row = { ...it, delta, deltaPct, extraAmortizacao: extra, extraAmortizacoes: extraList };
		prevSaldo = it.saldoDevedor;
		return row;
	});
}

/**
 * Média Geral = soma de todos os lançamentos cuja categoria conta no ritmo,
 * desde o início do objetivo até hoje, dividida pelos meses de calendário
 * percorridos -- usada para projetar a data de conclusão.
 */
export function computeGeneralAveragePace(goal, resourceMoves, goalCategories) {
	const paceMoves = resourceMoves
		.filter((m) => m.goalId === goal.id && m.categoryId)
		.filter((m) => {
			const cat = goalCategories.find((c) => c.id === m.categoryId);
			return !!(cat && cat.countsInPace);
		});
	const total = paceMoves.reduce((s, m) => s + m.amount, 0);
	const earliestMoveDate = paceMoves.reduce((min, m) => (!min || m.date < min ? m.date : min), null);
	const createdDateOnly = (goal.createdAt || '').slice(0, 10);
	const startDateOnly = earliestMoveDate && earliestMoveDate < createdDateOnly ? earliestMoveDate : createdDateOnly;
	const start = new Date(startDateOnly + 'T12:00:00');
	const today = new Date();
	const monthsElapsed = Math.max((today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1, 1);
	return total / monthsElapsed;
}

/** Data em que o objetivo bateu a meta pela primeira vez, olhando o histórico de todos os recursos. */
export function computeGoalAchievedDate(resources, resourceMoves, target) {
	if (!(target > 0)) return null;
	const resourceIds = resources.map((r) => r.id);
	const moves = resourceMoves
		.filter((m) => resourceIds.includes(m.resourceId))
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	let running = 0;
	for (const mv of moves) {
		running += mv.amount || 0;
		if (running >= target - 0.005) return mv.date;
	}
	return null;
}

/**
 * Resumo de encargos (juros + correção monetária + seguros + taxas) e do
 * abatimento total de um subconjunto de prestações (installmentRows, já
 * com delta/extraAmortizacao calculados por installmentsWithDelta) --
 * portado 1:1 do nextgoals. period: 'currentYear' | 'last12' | 'year' | 'all'.
 */
export function encargosAbatimentoSummary(all, period, year) {
	let subset;
	if (period === 'last12') {
		subset = all.slice(-12);
	} else if (period === 'currentYear') {
		const cy = new Date().getFullYear();
		subset = all.filter((it) => new Date(it.date + 'T12:00:00').getFullYear() === cy);
	} else if (period === 'year') {
		subset = all.filter((it) => new Date(it.date + 'T12:00:00').getFullYear() === year);
	} else {
		subset = all;
	}
	const totalJuros = subset.reduce((s, it) => s + (it.juros || 0), 0);
	const totalCorrecao = subset.reduce((s, it) => s + (it.correcaoMonetaria || 0), 0);
	const totalSeguros = subset.reduce((s, it) => s + (it.seguros || 0), 0);
	const totalTaxas = subset.reduce((s, it) => s + (it.taxas || 0), 0);
	const totalEncargos = totalJuros + totalCorrecao + totalSeguros + totalTaxas;
	const totalAmortizacaoParcela = subset.reduce((s, it) => s + (it.amortizacao || 0), 0);
	const totalExtra = subset.reduce((s, it) => s + (it.extraAmortizacao || 0), 0);
	const totalAbatimento = subset.reduce((s, it) => s + (it.delta || 0), 0);
	const totalValorPrestacao = subset.reduce((s, it) => s + (it.valorPrestacao || 0), 0);
	const totalPago = totalValorPrestacao + totalExtra;
	return { subset, totalJuros, totalCorrecao, totalSeguros, totalTaxas, totalEncargos, totalAmortizacaoParcela, totalExtra, totalAbatimento, totalValorPrestacao, totalPago };
}

/** Anos (mais recentes primeiro, limitado a 5) presentes numa lista de prestações. */
export function installmentYearsOf(installments) {
	const years = Array.from(new Set(installments.map((i) => new Date(i.date + 'T12:00:00').getFullYear())));
	years.sort((a, b) => b - a);
	return years.slice(0, 5);
}

/**
 * Métricas completas de um objetivo: acumulado, meta efetiva, ritmo médio,
 * previsão de conclusão e status (adiantado/no ritmo/atrasado/concluído).
 */
export function computeMetrics(goal, { resources, resourceMoves, goalCategories, installments, amortizations }) {
	const goalResources = resources.filter((r) => r.goalId === goal.id);
	const totalAccumulated = goalResources.reduce((s, r) => s + resourceBalance(resourceMoves, r.id), 0);
	const isFinanciamento = goal.type === 'financiamento';
	const goalInstallments = isFinanciamento ? installments.filter((i) => i.goalId === goal.id).sort((a, b) => a.number - b.number) : [];
	const goalAmortizations = isFinanciamento ? amortizations.filter((a) => a.goalId === goal.id) : [];
	const instRows = isFinanciamento ? installmentsWithDelta(goalInstallments, goalAmortizations) : [];
	const latest = goalInstallments.length ? goalInstallments[goalInstallments.length - 1] : null;
	const lastRow = instRows.length ? instRows[instRows.length - 1] : null;

	const effectiveTarget = isFinanciamento && goal.linkToBalance && latest ? latest.saldoDevedor : num(goal.targetAmount);
	const remaining = Math.max(effectiveTarget - totalAccumulated, 0);
	const today = new Date();
	const targetDate = goal.targetDate ? new Date(goal.targetDate + 'T12:00:00') : null;
	const monthsLeft = targetDate ? Math.max(monthsBetween(today, targetDate), 0) : null;
	const recommendedMonthly = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : remaining;
	const generalAveragePace = computeGeneralAveragePace(goal, resourceMoves, goalCategories);

	const lastAbatimento = isFinanciamento && goal.linkToBalance && lastRow && lastRow.delta > 0 ? lastRow.delta : 0;
	const monthsSinceLastInstallment = lastAbatimento > 0 && latest ? Math.max(monthsBetweenF(new Date(latest.date + 'T12:00:00'), today), 0) : 0;
	const projectedPaydown = lastAbatimento * monthsSinceLastInstallment;
	const remainingForProjection = Math.max(remaining - projectedPaydown, 0);
	const combinedPace = generalAveragePace + lastAbatimento;
	const usesAbatimentoProjection = lastAbatimento > 0;

	let projectedDate = null;
	let projectedMonths = null;
	if (combinedPace > 0 && remainingForProjection > 0) {
		projectedMonths = remainingForProjection / combinedPace;
		projectedDate = addMonthsF(today, projectedMonths);
	} else if (combinedPace > 0 && remaining > 0.005 && remainingForProjection <= 0) {
		projectedMonths = 0;
		projectedDate = today;
	}

	let status = 'sem-ritmo';
	let statusLabel = 'Defina um ritmo';
	let statusTone = 'warn';
	let achievedDate = null;
	let achievedMonthsDiff = null;
	if (remaining <= 0.005) {
		status = 'concluido';
		statusLabel = 'Concluído';
		statusTone = 'good';
		achievedDate = computeGoalAchievedDate(goalResources, resourceMoves, effectiveTarget);
		if (achievedDate && targetDate) achievedMonthsDiff = monthsBetween(new Date(achievedDate + 'T12:00:00'), targetDate);
	} else if (combinedPace <= 0) {
		status = 'sem-ritmo';
		statusLabel = 'Sem ritmo definido';
		statusTone = 'warn';
	} else if (targetDate) {
		const aheadMonths = monthsLeft - projectedMonths;
		if (aheadMonths >= 1) {
			status = 'adiantado';
			statusLabel = 'Adiantado';
			statusTone = 'good';
		} else if (aheadMonths >= -0.5) {
			status = 'no-ritmo';
			statusLabel = 'No ritmo';
			statusTone = 'good';
		} else {
			status = 'atrasado';
			statusLabel = 'Abaixo do ritmo';
			statusTone = 'danger';
		}
	} else {
		statusLabel = 'Em andamento';
		statusTone = 'neutral';
	}

	const percent = effectiveTarget > 0 ? clamp01(totalAccumulated / effectiveTarget) : 0;

	return {
		resources: goalResources,
		installments: goalInstallments,
		installmentRows: instRows,
		amortizations: goalAmortizations,
		totalAccumulated,
		effectiveTarget,
		remaining,
		monthsLeft,
		recommendedMonthly,
		generalAveragePace,
		lastAbatimento,
		combinedPace,
		usesAbatimentoProjection,
		projectedDate,
		projectedMonths,
		status,
		statusLabel,
		statusTone,
		percent,
		targetDate,
		latestInstallment: latest,
		achievedDate,
		achievedMonthsDiff
	};
}

/**
 * Estima a taxa de juros mensal (Tabela Price) de um financiamento a partir das duas últimas
 * prestações já lançadas: taxa = juros da última prestação / saldo devedor anterior a ela.
 * Retorna null quando não há prestações suficientes ou o resultado não é uma taxa plausível.
 */
export function estimateMonthlyRate(installmentRows) {
	if (!installmentRows || installmentRows.length < 2) return null;
	const last = installmentRows[installmentRows.length - 1];
	const prev = installmentRows[installmentRows.length - 2];
	if (!prev.saldoDevedor || prev.saldoDevedor <= 0) return null;
	const rate = (last.juros || 0) / prev.saldoDevedor;
	if (!Number.isFinite(rate) || rate <= 0 || rate > 0.2) return null;
	return rate;
}

/** Meses para quitar `saldo` pagando `parcela` por mês a uma taxa mensal `taxaMensal` (Tabela Price). */
function mesesParaQuitar(saldo, taxaMensal, parcela) {
	if (saldo <= 0) return 0;
	if (!(parcela > 0)) return Infinity;
	if (taxaMensal <= 0) return saldo / parcela;
	const jurosMensal = saldo * taxaMensal;
	if (parcela <= jurosMensal) return Infinity; // parcela não cobre nem os juros -- nunca quita
	return Math.log(parcela / (parcela - jurosMensal)) / Math.log(1 + taxaMensal);
}

/** Parcela necessária para quitar `saldo` em `meses` parcelas a uma taxa mensal `taxaMensal` (Tabela Price). */
function parcelaParaPrazo(saldo, taxaMensal, meses) {
	if (saldo <= 0 || meses <= 0) return 0;
	if (taxaMensal <= 0) return saldo / meses;
	const fator = Math.pow(1 + taxaMensal, -meses);
	return (saldo * taxaMensal) / (1 - fator);
}

/**
 * Simulador de amortização extra (Fase 5): "se eu aportar R$X agora, o que muda?" -- projeta os
 * dois cenários clássicos de amortização extraordinária (reduzir prazo mantendo a parcela, ou
 * reduzir a parcela mantendo o prazo), reaproveitando apenas dados já rastreados nas prestações
 * (saldo devedor, parcela e taxa implícita), sem inventar novo cadastro. Cálculo aproximado via
 * Tabela Price -- não substitui a simulação oficial do banco/financeira.
 */
export function simulateAmortizationScenario({ saldo, taxaMensal, parcela, aporte }) {
	if (!(saldo > 0) || !(taxaMensal > 0) || !(parcela > 0)) {
		return { valido: false };
	}
	const mesesAtual = mesesParaQuitar(saldo, taxaMensal, parcela);
	if (!Number.isFinite(mesesAtual)) return { valido: false };
	const jurosAtual = mesesAtual * parcela - saldo;

	const aporteValido = Math.max(0, Math.min(Number(aporte) || 0, saldo - 0.01));
	const novoSaldo = Math.max(saldo - aporteValido, 0);

	// Cenário 1: reduz o prazo, mantendo a parcela atual.
	const mesesComPrazoReduzido = mesesParaQuitar(novoSaldo, taxaMensal, parcela);
	const jurosComPrazoReduzido = Number.isFinite(mesesComPrazoReduzido) ? mesesComPrazoReduzido * parcela - novoSaldo : 0;

	// Cenário 2: reduz a parcela, mantendo o prazo atual (arredondado pra cima).
	const prazoOriginal = Math.ceil(mesesAtual);
	const novaParcela = parcelaParaPrazo(novoSaldo, taxaMensal, prazoOriginal);
	const jurosComParcelaReduzida = novaParcela * prazoOriginal - novoSaldo;

	return {
		valido: true,
		saldo,
		novoSaldo,
		aporte: aporteValido,
		mesesAtual,
		jurosAtual,
		prazoReduzido: {
			meses: mesesComPrazoReduzido,
			mesesEconomizados: Math.max(mesesAtual - mesesComPrazoReduzido, 0),
			juros: jurosComPrazoReduzido,
			jurosEconomizados: Math.max(jurosAtual - jurosComPrazoReduzido, 0)
		},
		parcelaReduzida: {
			parcela: novaParcela,
			economiaParcela: Math.max(parcela - novaParcela, 0),
			juros: jurosComParcelaReduzida,
			jurosEconomizados: Math.max(jurosAtual - jurosComParcelaReduzida, 0)
		}
	};
}
