<script>
	import { appState, setAlertThresholds, setPaymentStatus, upsertScoreSnapshot } from '$lib/fin/store.svelte.js';
	import { totals, monthTransactions, committedThisMonth, nextScheduleDate, currentMonthKey, daysUntil, faturaDoCartao, saldoContaAte } from '$lib/fin/derived.js';
	import { computeMetrics } from '$lib/goals/metrics.js';
	import { buildAttentionItems } from '$lib/fin/attention.js';
	import { computeFinancialScore, buildInsights } from '$lib/fin/intelligence.js';
	import { fmtMoney, fmtDate, monthLabel, financialMonthKey, todayISO } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import MoveFormModal from '$lib/goals/MoveFormModal.svelte';
	import { showToast } from '$lib/toast.svelte.js';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import Sparkline from '$lib/components/charts/Sparkline.svelte';
	import { Bell, CalendarDays, CalendarRange, Plus, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Sparkles, ChevronDown, Wand2 } from 'lucide-svelte';
	import FinancialCalendarModal from '$lib/components/FinancialCalendarModal.svelte';
	import MonthMovementsModal from '$lib/components/MonthMovementsModal.svelte';
	import { page } from '$app/state';

	const MES_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
	const DOT_PALETTE = ['#e06b5f', '#e0a23f', '#8b78db', '#4a78db', '#23a768', '#2fb7c4', '#c4519a'];

	let showNew = $state(false);
	let showCalendar = $state(false);
	let monthDetailTipo = $state(null); // null | 'receita' | 'despesa' -- controla o modal de detalhes de Entradas/Saídas do mês
	let aporteModal = $state({ open: false, resourceId: null, goalId: null, prefill: null });
	let contaFiltro = $state('all');
	let tipoFiltro = $state('all');

	function shiftMonthKey(mKey, delta) {
		const [y, m] = mKey.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	const eyebrowDate = $derived.by(() => {
		const d = new Date();
		return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(', ', ' · ');
	});

	const startDay = $derived(appState.settings.monthStartDay || 1);
	const mKey = $derived(currentMonthKey(startDay));
	const prevMKey = $derived(shiftMonthKey(mKey, -1));
	const moedaPadrao = $derived(appState.settings.moedaPadrao || 'BRL');

	const contaTx = $derived(appState.transactions.filter((t) => contaFiltro === 'all' || t.contaId === contaFiltro));
	const baseTx = $derived(contaTx.filter((t) => tipoFiltro === 'all' || t.tipo === tipoFiltro));

	const mesTx = $derived(monthTransactions(baseTx, mKey, startDay));
	const prevMesTx = $derived(monthTransactions(baseTx, prevMKey, startDay));
	const t = $derived(totals(mesTx));
	const prevT = $derived(totals(prevMesTx));

	// Mesma base de mesTx usada no total de Entradas/Saídas do mês -- alimenta o modal de
	// detalhes aberto ao clicar nesses cards em "Seu mês".
	const entradasMes = $derived(mesTx.filter((tr) => tr.tipo === 'receita' && !tr.isTransferencia));
	const saidasMes = $derived(mesTx.filter((tr) => tr.tipo === 'despesa' && !tr.isTransferencia));

	// Saldo real (nunca inclui lançamento com data futura, mesmo que já esteja pré-gerado como
	// parcela/recorrência futura) -- ver saldoContaAte em derived.js. Soma só contas líquidas
	// (sem cartão, que é linha de crédito, não dinheiro guardado).
	function saldoAte(dataLimite) {
		return contasLiquidas.reduce((s, acc) => s + saldoContaAte(appState.transactions, acc, dataLimite), 0);
	}
	const saldoAtualGeral = $derived(saldoAte(todayISO()));

	const sparkValues = $derived.by(() => {
		const out = [];
		for (let i = 5; i >= 0; i--) {
			const k = shiftMonthKey(mKey, -i);
			const tt = totals(monthTransactions(appState.transactions, k, startDay));
			out.push(Math.max(1, tt.receitas + tt.despesas));
		}
		return out;
	});

	const comprometido = $derived(committedThisMonth(baseTx, mKey, startDay));
	const comprometidoPct = $derived(t.despesas > 0 ? Math.min(100, Math.round((comprometido / t.despesas) * 100)) : 0);
	const entradasDeltaPct = $derived(prevT.receitas > 0 ? ((t.receitas - prevT.receitas) / prevT.receitas) * 100 : null);
	const saidasDeltaPct = $derived(prevT.despesas > 0 ? ((t.despesas - prevT.despesas) / prevT.despesas) * 100 : null);

	const template = $derived(appState.reportTemplates.find((tp) => tp.id === appState.reportSchedule.templateId));

	// fluxo de caixa: últimos 6 meses, respeitando apenas o filtro de conta
	const fluxoData = $derived.by(() => {
		const out = [];
		for (let i = 5; i >= 0; i--) {
			const k = shiftMonthKey(mKey, -i);
			const tt = totals(monthTransactions(contaTx, k, startDay));
			const [, mm] = k.split('-').map(Number);
			out.push({ label: MES_ABBR[mm - 1], a: tt.receitas, b: tt.despesas, current: k === mKey });
		}
		return out;
	});

	// distribuição: despesas do mês por categoria (respeitando conta), top 4 + outros
	const distribuicao = $derived.by(() => {
		const despesasMes = monthTransactions(contaTx, mKey, startDay).filter((tr) => tr.tipo === 'despesa' && !tr.isTransferencia);
		const map = new Map();
		for (const tr of despesasMes) {
			const cat = appState.categories.find((c) => c.id === tr.categoriaId);
			const nome = cat ? cat.nome : 'Sem categoria';
			map.set(nome, (map.get(nome) || 0) + (Number(tr.valor) || 0));
		}
		const arr = [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
		const top = arr.slice(0, 4);
		const outros = arr.slice(4).reduce((s, c) => s + c.total, 0);
		if (outros > 0) top.push({ nome: 'Outros', total: outros });
		return top;
	});
	const distribuicaoTotal = $derived(distribuicao.reduce((s, c) => s + c.total, 0));

	const recentes = $derived([...baseTx].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5));

	const intelligenceInput = $derived.by(() => ({
		transactions: appState.transactions,
		accounts: appState.accounts,
		goals: appState.goals,
		resources: appState.resources,
		resourceMoves: appState.resourceMoves,
		goalCategories: appState.goalCategories,
		installments: appState.installments,
		amortizations: appState.amortizations,
		categories: appState.categories,
		startDay
	}));
	const financialScore = $derived(computeFinancialScore(intelligenceInput));
	let scoreExpanded = $state(false);
	const SCORE_TIPS = {
		fluxoCaixa: 'Suas saídas estão perto de superar as entradas este mês — reduzir um gasto não essencial ou adiar uma compra já ajuda a subir esse ponto.',
		comprometimento: 'Uma fatia grande da sua renda já está comprometida com despesas fixas. Revisar assinaturas e parcelas recorrentes libera folga e sobe esse indicador.',
		cartoes: 'O uso do limite dos seus cartões está alto. Antecipar parte da fatura ou reduzir o uso no cartão mais próximo do limite melhora esse ponto.',
		reserva: 'Sua reserva cobre poucos meses de despesas. Qualquer aporte extra nela eleva esse indicador rapidamente.',
		objetivos: 'Um ou mais objetivos estão abaixo do ritmo planejado. Um aporte extra ou um ajuste no prazo recupera o ritmo.',
		previsibilidade: 'Suas despesas têm variado bastante mês a mês. Deixar mais gastos fixos e recorrentes estáveis melhora a previsibilidade.'
	};
	const scoreWeakest = $derived([...financialScore.components].sort((a, b) => a.value - b.value)[0]);
	const scoreTip = $derived(scoreWeakest ? SCORE_TIPS[scoreWeakest.key] : '');
	// "Para chegar a X" (Fase 3): em vez de só o ponto mais fraco, lista os 2 componentes com
	// mais espaço pra melhorar -- cada um já tem uma dica concreta em SCORE_TIPS.
	const scoreWeakestTwo = $derived([...financialScore.components].sort((a, b) => a.value - b.value).slice(0, 2).filter((c) => c.value < 90));
	const scoreTarget = $derived(Math.min(100, financialScore.overall + 8));
	const SCORE_DESC = {
		fluxoCaixa: 'Compara quanto entrou com quanto saiu este mês.',
		comprometimento: 'Quanto da sua renda já está tomado por despesas fixas, parcelas e recorrências.',
		cartoes: 'Quão perto do limite estão seus cartões neste mês.',
		reserva: 'Quantos meses de despesas sua reserva de emergência cobriria hoje.',
		objetivos: 'Se seus objetivos ativos estão no ritmo planejado.',
		previsibilidade: 'O quanto suas despesas variam de mês a mês.'
	};

	// Histórico mensal do score: registra o retrato do mês corrente conforme o usuário usa
	// o app (mesmo padrão de upsertPatrimonySnapshot em Patrimony.svelte) e mostra
	// variação + mini histórico no card.
	$effect(() => {
		if (!appState.ready) return;
		upsertScoreSnapshot(currentMonthKey(startDay), { overall: financialScore.overall });
	});
	const scoreHistory = $derived([...appState.scoreSnapshots].sort((a, b) => a.mKey.localeCompare(b.mKey)).slice(-12));
	const scorePrevMonth = $derived.by(() => {
		const prior = scoreHistory.filter((s) => s.mKey !== mKey);
		return prior.length ? prior[prior.length - 1] : null;
	});
	const scoreDelta = $derived(scorePrevMonth ? financialScore.overall - scorePrevMonth.overall : null);

	// Orçamento por categoria (P2.3): categorias de despesa com orçamento mensal definido,
	// gasto do mês corrente e % de uso -- mesma fonte de dados de Categories.svelte.
	const categoriasComOrcamento = $derived.by(() => {
		const mesTx = monthTransactions(appState.transactions, mKey, startDay);
		return appState.categories
			.filter((c) => c.tipo === 'despesa' && c.orcamentoMensal)
			.map((c) => {
				const gasto = mesTx.filter((t) => t.categoriaId === c.id).reduce((s, t) => s + (Number(t.valor) || 0), 0);
				const pct = Math.min(100, Math.round((gasto / c.orcamentoMensal) * 100));
				return { cat: c, gasto, pct };
			})
			.sort((a, b) => b.pct - a.pct);
	});
	function corOrcamento(pct) {
		if (pct >= 100) return 'var(--expense)';
		if (pct >= 80) return 'var(--kpi-amber, #a67c1e)';
		return 'var(--income)';
	}
	const gastoTotalMes = $derived(monthTransactions(appState.transactions, mKey, startDay).filter((t) => t.tipo === 'despesa' && !t.isTransferencia).reduce((s, t) => s + (Number(t.valor) || 0), 0));
	const pctOrcamentoGlobal = $derived(appState.budgetGlobal ? Math.min(100, Math.round((gastoTotalMes / appState.budgetGlobal) * 100)) : null);
	const insights = $derived(buildInsights(intelligenceInput, 3));
	const INSIGHT_LABELS = { comportamento: 'Comportamento', oportunidade: 'Oportunidade', risco: 'Risco', objetivo: 'Objetivo', cartao: 'Cartão' };
	function scoreColor(v) {
		if (v >= 75) return 'var(--income)';
		if (v >= 55) return 'var(--accent-fg)';
		if (v >= 35) return 'var(--kpi-amber, #a67c1e)';
		return 'var(--expense)';
	}

	// ---- centro de controle: saldo real, projecao, prioridades, proximo passo ----

	const saudacao = $derived.by(() => {
		const h = new Date().getHours();
		if (h < 12) return 'Bom dia';
		if (h < 18) return 'Boa tarde';
		return 'Boa noite';
	});
	const primeiroNome = $derived(appState.user?.name ? appState.user.name.split(' ')[0] : '');

	const contasLiquidas = $derived(appState.accounts.filter((a) => a.tipo !== 'cartao'));
	const cartoesConta = $derived(appState.accounts.filter((a) => a.tipo === 'cartao'));

	function saldoConta(acc) {
		return saldoContaAte(appState.transactions, acc, todayISO());
	}
	function faturaConta(acc) {
		return faturaDoCartao(appState.transactions, acc, mKey, startDay);
	}

	const saldoContasReal = $derived(contasLiquidas.reduce((s, acc) => s + saldoConta(acc), 0));
	const faturaCartoesTotal = $derived(cartoesConta.reduce((s, acc) => s + faturaConta(acc), 0));

	// Só despesas pendentes em contas líquidas (não-cartão): compras no cartão já entram na
	// fatura via faturaCartoesTotal -- somar aqui de novo contaria o mesmo gasto duas vezes.
	const cartaoIds = $derived(new Set(cartoesConta.map((a) => a.id)));
	const committedNext30Value = $derived.by(() => {
		return appState.transactions
			.filter((tr) => tr.tipo === 'despesa' && tr.statusPagamento !== 'pago' && !cartaoIds.has(tr.contaId))
			.reduce((s, tr) => {
				const dias = daysUntil(tr.data);
				return dias >= 0 && dias <= 30 ? s + (Number(tr.valor) || 0) : s;
			}, 0);
	});

	const activeGoalsWithMetrics = $derived(
		appState.goals
			.filter((g) => !g.archived && !g.paused)
			.map((g) => ({
				goal: g,
				m: computeMetrics(g, {
					resources: appState.resources,
					resourceMoves: appState.resourceMoves,
					goalCategories: appState.goalCategories,
					installments: appState.installments,
					amortizations: appState.amortizations
				})
			}))
	);
	// Objetivos numa moeda diferente da padrão do sistema (ex.: EUR) entram aqui convertidos pelo
	// câmbio de referência cadastrado no objetivo (ver GoalFormModal) -- sem isso, R$/EUR/USD
	// somados direto dariam um total sem sentido. Sem câmbio de referência cadastrado, o objetivo
	// fica de fora da soma (metasSemCambio) em vez de entrar errado.
	const metasPlanejadasAtivas = $derived(activeGoalsWithMetrics.filter(({ m }) => m.percent < 1 && m.recommendedMonthly > 0));
	const metasSemCambio = $derived(metasPlanejadasAtivas.filter(({ goal }) => goal.currency && goal.currency !== moedaPadrao && !goal.referenceRate));
	const metasPlanejadasMes = $derived(
		metasPlanejadasAtivas.reduce((s, { goal, m }) => {
			const estrangeira = goal.currency && goal.currency !== moedaPadrao;
			if (estrangeira && !goal.referenceRate) return s; // sem câmbio de referência -- fica de fora, não soma errado
			const valor = estrangeira ? m.recommendedMonthly * Number(goal.referenceRate) : m.recommendedMonthly;
			return s + valor;
		}, 0)
	);

	const margemSeguranca = $derived(Math.max(0, Math.round((saldoContasReal * 0.05) / 10) * 10));

	const saldoDisponivel = $derived(saldoContasReal - committedNext30Value - faturaCartoesTotal - metasPlanejadasMes - margemSeguranca);

	const diasRestantesMes = $derived.by(() => {
		const now = new Date();
		const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
		return Math.max(1, lastDay - now.getDate() + 1);
	});
	const gastoDiario = $derived(saldoDisponivel > 0 ? saldoDisponivel / diasRestantesMes : 0);

	// Resumo semanal (P3.3): compara o gasto da semana corrente (até hoje) com a janela
	// equivalente da semana anterior (mesmo número de dias), para não distorcer com semana
	// parcial vs. semana cheia.
	function isoAddDays(iso, days) {
		const d = new Date(iso + 'T12:00:00');
		d.setDate(d.getDate() + days);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	function mondayOf(iso) {
		const d = new Date(iso + 'T12:00:00');
		const dow = d.getDay(); // 0=domingo
		const diff = dow === 0 ? -6 : 1 - dow;
		return isoAddDays(iso, diff);
	}
	const resumoSemanal = $derived.by(() => {
		const hoje = todayISO();
		const inicioSemana = mondayOf(hoje);
		const diasDecorridos = Math.round((new Date(hoje) - new Date(inicioSemana)) / 86400000) + 1;
		const inicioSemanaAnterior = isoAddDays(inicioSemana, -7);
		const fimSemanaAnterior = isoAddDays(inicioSemanaAnterior, diasDecorridos - 1);

		const despesasSemana = appState.transactions.filter((t) => t.tipo === 'despesa' && !t.isTransferencia && t.data >= inicioSemana && t.data <= hoje);
		const despesasSemanaAnterior = appState.transactions.filter((t) => t.tipo === 'despesa' && !t.isTransferencia && t.data >= inicioSemanaAnterior && t.data <= fimSemanaAnterior);
		const receitasSemana = appState.transactions.filter((t) => t.tipo === 'receita' && !t.isTransferencia && t.data >= inicioSemana && t.data <= hoje);

		const gastoSemana = despesasSemana.reduce((s, t) => s + (Number(t.valor) || 0), 0);
		const gastoSemanaAnterior = despesasSemanaAnterior.reduce((s, t) => s + (Number(t.valor) || 0), 0);
		const receitaSemana = receitasSemana.reduce((s, t) => s + (Number(t.valor) || 0), 0);
		const variacaoPct = gastoSemanaAnterior > 0 ? Math.round(((gastoSemana - gastoSemanaAnterior) / gastoSemanaAnterior) * 100) : null;

		const porCategoria = new Map();
		for (const t of despesasSemana) {
			const cat = appState.categories.find((c) => c.id === t.categoriaId);
			const nome = cat ? cat.nome : 'Sem categoria';
			porCategoria.set(nome, (porCategoria.get(nome) || 0) + (Number(t.valor) || 0));
		}
		const maiorGasto = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0] || null;

		const aportesSemana = appState.resourceMoves.filter((m) => m.amount > 0 && m.date >= inicioSemana && m.date <= hoje).reduce((s, m) => s + m.amount, 0);
		const guardado = Math.max(0, receitaSemana - gastoSemana);

		return { gastoSemana, variacaoPct, maiorGasto, guardado, aportesSemana };
	});

	// Fechamento mensal automático (P3.4): retrato fechado do mês anterior, sempre disponível
	// (não só no dia 1) para o usuário conferir quando quiser.
	let fechamentoAberto = $state(false);
	const fechamentoMensal = $derived.by(() => {
		const mesAnteriorKey = shiftMonthKey(mKey, -1);
		const txMesAnterior = monthTransactions(appState.transactions, mesAnteriorKey, startDay);
		const tot = totals(txMesAnterior);
		const taxaPoupanca = tot.receitas > 0 ? Math.round((tot.saldo / tot.receitas) * 1000) / 10 : null;

		const porCategoria = new Map();
		for (const t of txMesAnterior) {
			if (t.tipo !== 'despesa' || t.isTransferencia) continue;
			const cat = appState.categories.find((c) => c.id === t.categoriaId);
			const nome = cat ? cat.nome : 'Sem categoria';
			porCategoria.set(nome, (porCategoria.get(nome) || 0) + (Number(t.valor) || 0));
		}
		const maiorGasto = [...porCategoria.entries()].sort((a, b) => b[1] - a[1])[0] || null;

		const aportesPorRecurso = new Map();
		for (const m of appState.resourceMoves) {
			if (financialMonthKey(m.date, startDay) !== mesAnteriorKey) continue;
			aportesPorRecurso.set(m.resourceId, (aportesPorRecurso.get(m.resourceId) || 0) + m.amount);
		}
		let melhorResultado = null;
		for (const [resId, valor] of aportesPorRecurso) {
			if (valor <= 0) continue;
			const res = appState.resources.find((r) => r.id === resId);
			if (!res) continue;
			if (!melhorResultado || valor > melhorResultado.valor) melhorResultado = { nome: res.nome, valor };
		}

		const snapAnterior = appState.scoreSnapshots.find((s) => s.mKey === mesAnteriorKey);

		return {
			mesAnteriorKey,
			receitas: tot.receitas,
			despesas: tot.despesas,
			guardado: tot.saldo,
			taxaPoupanca,
			maiorGasto,
			melhorResultado,
			scoreAnterior: snapAnterior ? snapAnterior.overall : null
		};
	});

	// Timeline financeira (P3.5): próximos lançamentos pendentes em contas correntes (exclui
	// cartão, que só afeta o saldo via fatura), em ordem cronológica, com saldo acumulado --
	// complementa os pontos de "saldo projetado" mostrando os eventos que os formam.
	const timelineFinanceira = $derived.by(() => {
		const hoje = todayISO();
		const contaIds = new Set(contasLiquidas.map((a) => a.id));
		const futuros = appState.transactions
			.filter((t) => !t.isTransferencia && t.statusPagamento !== 'pago' && t.data >= hoje && contaIds.has(t.contaId))
			.sort((a, b) => (a.data === b.data ? 0 : a.data < b.data ? -1 : 1))
			.slice(0, 12);
		let saldo = saldoAtualGeral;
		return futuros.map((t) => {
			saldo += t.tipo === 'receita' ? Number(t.valor) || 0 : -(Number(t.valor) || 0);
			return { id: t.id, data: t.data, descricao: t.descricao, tipo: t.tipo, valor: Number(t.valor) || 0, saldoAcumulado: saldo };
		});
	});

	const prioridades = $derived(
		buildAttentionItems(
			{
				transactions: appState.transactions,
				accounts: appState.accounts,
				goals: appState.goals,
				resources: appState.resources,
				resourceMoves: appState.resourceMoves,
				goalCategories: appState.goalCategories,
				installments: appState.installments,
				amortizations: appState.amortizations,
				alertThresholds: appState.alertThresholds,
				categories: appState.categories,
				startDay
			},
			3
		)
	);

	const proximoPasso = $derived.by(() => {
		if (saldoDisponivel > 0) {
			// Só considera aqui objetivos na moeda padrão do sistema -- comparar/misturar
			// saldoDisponivel (moeda padrão) com a meta mensal de um objetivo em moeda
			// estrangeira (ex.: EUR) direto, sem câmbio, daria uma sugestão sem sentido.
			const candidatos = activeGoalsWithMetrics
				.filter(({ goal, m }) => (!goal.currency || goal.currency === moedaPadrao) && m.percent < 1 && m.recommendedMonthly > 0)
				.sort((a, b) => (a.m.statusTone === 'danger' ? 0 : 1) - (b.m.statusTone === 'danger' ? 0 : 1));
			const candidato = candidatos[0];
			if (candidato) {
				const valor = Math.min(saldoDisponivel, candidato.m.recommendedMonthly);
				const resource = appState.resources.find((r) => r.goalId === candidato.goal.id);
				return {
					text: `Você pode aportar ${fmtMoney(valor, moedaPadrao)} na meta "${candidato.goal.name}" este mês sem comprometer seu caixa.`,
					actionLabel: 'Fazer aporte',
					href: '/objetivos',
					goalId: candidato.goal.id,
					resourceId: resource?.id || null,
					valor
				};
			}
			return { text: `Seu caixa está tranquilo este mês: ${fmtMoney(saldoDisponivel, moedaPadrao)} disponíveis além dos compromissos e metas.`, actionLabel: 'Ver objetivos', href: '/objetivos' };
		}
		return { text: 'Seus compromissos e metas deste mês superam o saldo disponível em contas. Vale revisar despesas em Relatórios.', actionLabel: 'Ver relatório', href: '/relatorios' };
	});
	function openAporte() {
		aporteModal = {
			open: true,
			resourceId: proximoPasso.resourceId,
			goalId: proximoPasso.goalId,
			prefill: { description: 'Aporte', amount: Math.round(proximoPasso.valor * 100) / 100 }
		};
	}
	function handleAttentionAction(p) {
		if (p.action?.kind === 'pay') {
			const id = p.action.transactionId;
			setPaymentStatus(id, 'pago');
			showToast({
				message: 'Lançamento marcado como pago.',
				actionLabel: 'DESFAZER',
				onAction: () => setPaymentStatus(id, 'pendente')
			});
			return;
		}
		if (p.action?.kind === 'aporte') {
			const { goalId, resourceId, valor } = p.action;
			aporteModal = { open: true, resourceId, goalId, prefill: { description: 'Aporte', amount: Math.round(valor * 100) / 100 } };
		}
	}

	// Selo de status do centro de controle: vermelho quando o caixa já está negativo,
	// amarelo quando ainda há folga mas alguma prioridade urgente (vencimento, cartão
	// alto, meta atrasada), verde quando está tudo tranquilo.
	const statusTone = $derived.by(() => {
		if (saldoDisponivel <= 0) return 'red';
		if (prioridades.some((p) => p.tone === 'red')) return 'amber';
		return 'green';
	});
	const statusLabel = $derived.by(() => {
		if (statusTone === 'red') return 'Aperto no caixa';
		if (statusTone === 'amber') return 'Atenção';
		return 'Caixa saudável';
	});

	// Painel "Ver mais detalhes": agrupa fluxo de caixa, distribuição, score, resumo
	// semanal/fechamento e orçamento -- fica recolhido por padrão pra não sobrecarregar
	// a primeira leitura da tela (o essencial já está no centro de controle acima).
	let detalhesAbertos = $state(false);

	// Vindo de um alerta que aponta para a camada de detalhes (ex.: projeção de saldo negativo,
	// ?detalhes=1) -- expande automaticamente em vez de deixar o usuário procurar o toggle.
	$effect(() => {
		if (page.url.searchParams.get('detalhes') === '1') detalhesAbertos = true;
	});

	function futureDateISO(days) {
		const d = new Date();
		d.setDate(d.getDate() + days);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	const projecao = $derived.by(() => [
		{ label: 'Hoje', valor: saldoAtualGeral },
		{ label: 'Em 30 dias', valor: saldoAte(futureDateISO(30)) },
		{ label: 'Em 60 dias', valor: saldoAte(futureDateISO(60)) },
		{ label: 'Em 90 dias', valor: saldoAte(futureDateISO(90)) }
	]);
	const projecaoAlerta = $derived(projecao.find((p) => p.label !== 'Hoje' && p.valor < 0));

	function updateThreshold(key, value) {
		setAlertThresholds({ [key]: Math.max(1, Number(value) || 1) });
	}
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">{eyebrowDate}</p>
		<h1 class="font-display page-title">Seu dinheiro, em perspectiva.</h1>
		<p class="page-sub">Uma leitura simples do que entrou, do que saiu e do que está por vir neste mês.</p>
	</div>
	<div class="actions-row">
		<a class="btn" href="/simulador"><Wand2 size={16} /> Simular</a>
		<button class="btn" onclick={() => (showCalendar = true)}><CalendarRange size={16} /> Calendário</button>
		<button class="btn btn-primary" onclick={() => (showNew = true)}><Plus size={16} /> Novo lançamento</button>
	</div>
</div>

<div class="dash-filters">
	<select class="field-input" style="height:40px;width:auto" bind:value={contaFiltro}>
		<option value="all">Todas as contas</option>
		{#each appState.accounts as acc (acc.id)}
			<option value={acc.id}>{acc.nome}</option>
		{/each}
	</select>
	<select class="field-input" style="height:40px;width:auto" bind:value={tipoFiltro}>
		<option value="all">Receitas e despesas</option>
		<option value="receita">Só receitas</option>
		<option value="despesa">Só despesas</option>
	</select>
</div>

<div class="control-center">
	<div class="control-top">
		<div>
			<p class="control-greeting">{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}.</p>
			<span class="status-pill" class:red={statusTone === 'red'} class:amber={statusTone === 'amber'} class:green={statusTone === 'green'}>
				<span class="status-dot"></span>{statusLabel}
			</span>
		</div>
		<Sparkline values={sparkValues} />
	</div>

	<div class="control-balance">
		<p class="hero-balance-label">Quanto posso gastar?</p>
		<p class="hero-balance-value privacy-value">{fmtMoney(saldoDisponivel)}</p>
		<p class="hero-balance-sub">Depois das contas, cartões, metas e reserva de segurança.</p>
		<p class="hero-balance-sub">
			{saldoDisponivel > 0 ? `≈ ${fmtMoney(gastoDiario)}/dia até o fim do mês` : 'Compromissos e metas superam o saldo em contas.'}
		</p>
		<details class="hero-breakdown">
			<summary>Como calculamos?</summary>
			<div class="hero-breakdown-row"><span><span class="money-tag real">💰 Real</span> Saldo em contas</span><span class="privacy-value">{fmtMoney(saldoContasReal)}</span></div>
			<div class="hero-breakdown-row"><span>− Contas a vencer (30 dias)</span><span class="privacy-value">{fmtMoney(committedNext30Value)}</span></div>
			<div class="hero-breakdown-row"><span>− Fatura de cartão</span><span class="privacy-value">{fmtMoney(faturaCartoesTotal)}</span></div>
			<div class="hero-breakdown-row"><span>− Metas planejadas do mês</span><span class="privacy-value">{fmtMoney(metasPlanejadasMes, moedaPadrao)}</span></div>
			{#if metasSemCambio.length}
				<p class="field-hint" style="margin:-4px 0 6px">
					{metasSemCambio.map(({ goal }) => goal.name).join(', ')} {metasSemCambio.length > 1 ? 'estão' : 'está'} numa moeda diferente e {metasSemCambio.length > 1 ? 'não entram' : 'não entra'} nessa soma até você
					cadastrar um câmbio de referência (editar objetivo, em Objetivos).
				</p>
			{/if}
			<div class="hero-breakdown-row"><span>− Margem de segurança (5%)</span><span class="privacy-value">{fmtMoney(margemSeguranca)}</span></div>
			<div class="hero-breakdown-row subtotal"><span><span class="money-tag comprometido">📌 Comprometido</span> Total comprometido</span><span class="privacy-value">{fmtMoney(committedNext30Value + faturaCartoesTotal + metasPlanejadasMes + margemSeguranca)}</span></div>
			<div class="hero-breakdown-row total"><span>Disponível</span><span class="privacy-value">{fmtMoney(saldoDisponivel)}</span></div>
		</details>
	</div>

	<div class="control-divider"></div>

	<div class="control-next-step">
		<p class="insight-eyebrow"><Sparkles size={13} style="vertical-align:-2px;margin-right:5px" />O que eu faria agora</p>
		<p class="control-next-text">{proximoPasso.text}</p>
		{#if proximoPasso.resourceId}
			<button class="btn btn-primary sm" onclick={openAporte}>{proximoPasso.actionLabel}</button>
		{:else}
			<a class="btn btn-primary sm" href={proximoPasso.href}>{proximoPasso.actionLabel}</a>
		{/if}
	</div>

	<div class="control-divider"></div>

	<div class="control-attention">
		<div class="attention-head">
			<span class="alerts-icon" class:red={prioridades.some((p) => p.tone === 'red')}><Bell size={16} /></span>
			<p class="stat-label" style="margin:0">
				{prioridades.length ? `${prioridades.length} coisa${prioridades.length > 1 ? 's' : ''} merece${prioridades.length > 1 ? 'm' : ''} atenção` : 'Tudo em dia'}
			</p>
		</div>
		{#if prioridades.length}
			{#each prioridades as p, i (i)}
				<div class="attention-item {p.tone}">
					<span class="attention-dot"></span>
					<p class="attention-text">{p.text}</p>
					{#if p.action}
						<button class="link-more" onclick={() => handleAttentionAction(p)}>{p.actionLabel} ↗</button>
					{:else}
						<a class="link-more" href={p.href}>{p.actionLabel} ↗</a>
					{/if}
				</div>
			{/each}
		{:else}
			<p class="empty">Tudo em dia — nenhum vencimento, fatura alta ou meta atrasada por agora.</p>
		{/if}
		<div class="alerts-thresholds">
			<span>Alertar com antecedência:</span>
			{#each [['um', appState.alertThresholds.um], ['tres', appState.alertThresholds.tres], ['sete', appState.alertThresholds.sete]] as [key, value] (key)}
				<label class="threshold-pill">
					<input type="number" min="1" max="30" {value} oninput={(e) => updateThreshold(key, e.target.value)} />d
				</label>
			{/each}
		</div>
	</div>
</div>

<div class="month-summary">
	<p class="stat-label" style="margin:0 0 10px">Seu mês</p>
	<div class="hero-side">
		<div
			class="mini-stat mini-stat-clickable"
			role="button"
			tabindex="0"
			onclick={() => (monthDetailTipo = 'receita')}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					monthDetailTipo = 'receita';
				}
			}}
		>
			<div class="mini-stat-top"><span class="stat-label">Entradas no mês</span><span class="mini-stat-dot" style="background:var(--income)"></span></div>
			<p class="mini-stat-value money-in font-display privacy-value">{fmtMoney(t.receitas)}</p>
			{#if entradasDeltaPct !== null}<p class="mini-stat-delta">{entradasDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(entradasDeltaPct).toFixed(1)}% vs. {monthLabel(prevMKey)}</p>{/if}
		</div>
		<div
			class="mini-stat mini-stat-clickable"
			role="button"
			tabindex="0"
			onclick={() => (monthDetailTipo = 'despesa')}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					monthDetailTipo = 'despesa';
				}
			}}
		>
			<div class="mini-stat-top"><span class="stat-label">Saídas no mês</span><span class="mini-stat-dot" style="background:var(--expense)"></span></div>
			<p class="mini-stat-value money-out font-display privacy-value">{fmtMoney(t.despesas)}</p>
			{#if saidasDeltaPct !== null}<p class="mini-stat-delta">{saidasDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(saidasDeltaPct).toFixed(1)}% vs. {monthLabel(prevMKey)}</p>{/if}
		</div>
		<div class="mini-stat">
			<div class="mini-stat-top"><span class="stat-label">Saldo do mês</span><span class="mini-stat-dot" style="background:{t.saldo >= 0 ? 'var(--income)' : 'var(--expense)'}"></span></div>
			<p class="mini-stat-value font-display privacy-value" class:money-in={t.saldo > 0} class:money-out={t.saldo < 0}>{fmtMoney(t.saldo)}</p>
			<p class="mini-stat-delta">{t.receitas > 0 ? Math.round((t.saldo / t.receitas) * 100) : 0}% da renda do mês</p>
		</div>
	</div>
</div>

<button type="button" class="details-toggle" onclick={() => (detalhesAbertos = !detalhesAbertos)}>
	{detalhesAbertos ? 'Ocultar detalhes' : 'Ver mais detalhes'}
	<span class="details-toggle-icon" style={detalhesAbertos ? 'transform:rotate(180deg)' : ''}><ChevronDown size={14} /></span>
</button>

{#if detalhesAbertos}
<div class="card timeline-card">
	<div class="feed-list-head">
		<p class="stat-label" style="margin:0">Hoje · Próximos 30 dias</p>
		<a class="link-more" href="/movimentacoes">Ver todas ↗</a>
	</div>
	<div class="timeline-row timeline-row--hoje">
		<span class="timeline-date">Hoje</span>
		<span class="timeline-desc">Saldo atual</span>
		<span class="timeline-valor"></span>
		<span class="timeline-saldo privacy-value" class:down={saldoAtualGeral < 0}>{fmtMoney(saldoAtualGeral)}</span>
	</div>
	{#if timelineFinanceira.length}
		{#each timelineFinanceira as ev (ev.id)}
			<div class="timeline-row">
				<span class="timeline-date">{fmtDate(ev.data)}</span>
				<span class="timeline-desc">{ev.descricao || 'Lançamento'}</span>
				<span class="timeline-valor privacy-value" class:money-in={ev.tipo === 'receita'} class:money-out={ev.tipo === 'despesa'}>
					{ev.tipo === 'receita' ? '+' : '−'} {fmtMoney(ev.valor)}
				</span>
				<span class="timeline-saldo privacy-value" class:down={ev.saldoAcumulado < 0}>{fmtMoney(ev.saldoAcumulado)}</span>
			</div>
		{/each}
	{:else}
		<p class="empty">Nenhum lançamento pendente nos próximos dias.</p>
	{/if}
</div>

<div class="score-row">
	<div class="card score-card">
		<div class="score-card-head">
			<div>
				<p class="stat-label" style="margin:0">Sua saúde financeira</p>
				<p class="score-tone" style={`color:${scoreColor(financialScore.overall)}`}>{financialScore.label}</p>
				{#if scoreDelta !== null && scoreDelta !== 0}
					<p class="score-delta" class:up={scoreDelta > 0} class:down={scoreDelta < 0}>
						{scoreDelta > 0 ? '▲' : '▼'} {Math.abs(scoreDelta)} vs mês passado
					</p>
				{/if}
			</div>
			<div class="score-value-wrap-col">
				<div class="score-value-wrap">
					<span class="score-value" style={`color:${scoreColor(financialScore.overall)}`}>{financialScore.overall}</span>
					<span class="score-max">/100</span>
				</div>
				{#if scoreHistory.length > 1}
					<Sparkline values={scoreHistory.map((s) => s.overall)} width={90} height={26} color={scoreColor(financialScore.overall)} />
				{/if}
			</div>
		</div>
		<div class="score-components">
			{#each financialScore.components as comp (comp.key)}
				<div class="score-component-row">
					<span class="score-component-label">{comp.label}</span>
					<div class="score-component-track">
						<div class="score-component-fill" style={`width:${comp.value}%; background:${scoreColor(comp.value)}`}></div>
					</div>
					<span class="score-component-value">{comp.value}</span>
				</div>
			{/each}
		</div>
		{#if financialScore.overall < 100 && scoreWeakestTwo.length}
			<button class="score-tip-toggle" onclick={() => (scoreExpanded = !scoreExpanded)}>
				{scoreExpanded ? 'Ocultar' : `Para chegar a ${scoreTarget}`}
			</button>
			{#if scoreExpanded}
				<div class="score-tip">
					<p class="score-tip-head">Para chegar a {scoreTarget}:</p>
					<ol class="score-tip-list">
						{#each scoreWeakestTwo as comp (comp.key)}
							<li><b>{comp.label}</b> ({comp.value}/100) — {SCORE_TIPS[comp.key]}</li>
						{/each}
					</ol>
				</div>
			{/if}
		{/if}
		<details class="hero-breakdown score-explain">
			<summary>Como calculamos esse número?</summary>
			{#each financialScore.components as comp (comp.key)}
				<div class="score-explain-row"><span class="score-explain-label">{comp.label}</span><span class="score-explain-desc">{SCORE_DESC[comp.key]}</span></div>
			{/each}
			<p class="score-disclaimer">Esse indicador é uma leitura do seu comportamento financeiro com base nos dados cadastrados no Plena — não é um score de crédito oficial.</p>
		</details>
	</div>
</div>

<div class="mini-stat" style="margin-bottom:20px">
	<div class="mini-stat-top"><span class="stat-label"><span class="money-tag comprometido">📌 Comprometido</span> no mês</span><span class="mini-stat-dot" style="background:var(--kpi-amber)"></span></div>
	<p class="mini-stat-value font-display privacy-value">{fmtMoney(comprometido)}</p>
	<p class="mini-stat-delta">{comprometidoPct}% das despesas do mês</p>
	<div class="mini-progress-track"><div class="mini-progress-fill" style="width:{comprometidoPct}%;background:var(--kpi-amber)"></div></div>
</div>

<div class="card projection-card">
	<div class="chart-card-head">
		<p class="stat-label" style="margin:0"><span class="money-tag projetado">🔮 Projetado</span> Saldo projetado</p>
		{#if projecaoAlerta}<span class="badge badge-red">⚠ fica negativo em {projecaoAlerta.label.toLowerCase()}</span>{/if}
	</div>
	<div class="projection-row">
		{#each projecao as p (p.label)}
			<div class="projection-point">
				<p class="projection-label">{p.label}</p>
				<p class="projection-value privacy-value" class:down={p.valor < 0}>{fmtMoney(p.valor)}</p>
			</div>
		{/each}
	</div>
</div>

<div class="charts-row">
	<div class="card">
		<div class="chart-card-head">
			<div>
				<p class="stat-label" style="margin:0">Fluxo de caixa</p>
				<p class="font-display privacy-value" style="margin:6px 0 0;font-size:20px">{fmtMoney(t.receitas)}</p>
			</div>
			<div class="chart-legend">
				<span><span class="legend-dot" style="background:#4dcc8c"></span>Entradas</span>
				<span><span class="legend-dot" style="background:#f18c7e"></span>Saídas</span>
			</div>
		</div>
		<BarChart data={fluxoData} />
	</div>
	<div class="card">
		<div class="chart-card-head">
			<p class="stat-label" style="margin:0">Distribuição</p>
			<span class="page-sub" style="margin:0">Para onde vai?</span>
		</div>
		{#if distribuicao.length}
			<div class="donut-wrap">
				<DonutChart
					slices={distribuicao.map((c, i) => ({ label: c.nome, value: c.total, color: DOT_PALETTE[i % DOT_PALETTE.length] }))}
					centerLabel="Total"
					centerValue={fmtMoney(distribuicaoTotal)}
				/>
				<div class="donut-legend">
					{#each distribuicao as c, i (c.nome)}
						<div class="donut-legend-row">
							<span class="donut-legend-name"><span class="legend-dot" style="background:{DOT_PALETTE[i % DOT_PALETTE.length]}"></span>{c.nome}</span>
							<span class="donut-legend-pct">{distribuicaoTotal ? Math.round((c.total / distribuicaoTotal) * 100) : 0}%</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="empty">Sem despesas neste mês — assim que você registrar uma, ela aparece aqui.</p>
		{/if}
	</div>
</div>

<div class="card schedule-card" class:on={appState.reportSchedule.ativo && template}>
	<span class="alerts-icon" class:green={appState.reportSchedule.ativo && template}><CalendarDays size={18} /></span>
	<div>
		<div class="schedule-head">
			<p class="stat-label">Próxima exportação automática</p>
			<span class="badge" class:badge-green={appState.reportSchedule.ativo && template} class:badge-gray={!(appState.reportSchedule.ativo && template)}>
				{appState.reportSchedule.ativo && template ? 'Agendada' : 'Não configurada'}
			</span>
		</div>
		{#if appState.reportSchedule.ativo && template}
			<p class="alerts-summary">{nextScheduleDate(appState.reportSchedule)} às {appState.reportSchedule.hora}</p>
			<p class="paused-list">Modelo: {template.nome} · filtros salvos serão usados na exportação.</p>
		{:else}
			<p class="alerts-summary">Configure um modelo mensal no centro de relatórios, em Movimentações.</p>
		{/if}
	</div>
</div>

<div class="score-row">
	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0">Seu resumo da semana</p>
		</div>
		<div class="week-summary-grid">
			<div class="week-summary-item">
				<p class="week-summary-label">Você gastou</p>
				<p class="week-summary-value privacy-value">{fmtMoney(resumoSemanal.gastoSemana)}</p>
				{#if resumoSemanal.variacaoPct !== null}
					<p class="week-summary-delta" class:down={resumoSemanal.variacaoPct < 0} class:up={resumoSemanal.variacaoPct > 0}>
						{resumoSemanal.variacaoPct > 0 ? '↑' : '↓'} {Math.abs(resumoSemanal.variacaoPct)}% vs. semana anterior
					</p>
				{/if}
			</div>
			{#if resumoSemanal.maiorGasto}
				<div class="week-summary-item">
					<p class="week-summary-label">Maior gasto</p>
					<p class="week-summary-value">{resumoSemanal.maiorGasto[0]}</p>
					<p class="week-summary-delta privacy-value">{fmtMoney(resumoSemanal.maiorGasto[1])}</p>
				</div>
			{/if}
			<div class="week-summary-item">
				<p class="week-summary-label">Você guardou</p>
				<p class="week-summary-value privacy-value">{fmtMoney(resumoSemanal.guardado)}</p>
			</div>
			{#if resumoSemanal.aportesSemana > 0}
				<div class="week-summary-item">
					<p class="week-summary-label">Aportes em metas</p>
					<p class="week-summary-value privacy-value">+{fmtMoney(resumoSemanal.aportesSemana)}</p>
				</div>
			{/if}
			<div class="week-summary-item">
				<p class="week-summary-label">Score atual</p>
				<p class="week-summary-value" style={`color:${scoreColor(financialScore.overall)}`}>{financialScore.overall}</p>
			</div>
		</div>
		<button class="score-tip-toggle" style="margin-top:14px" onclick={() => (fechamentoAberto = !fechamentoAberto)}>
			{fechamentoAberto ? 'Ocultar' : `Ver fechamento de ${monthLabel(fechamentoMensal.mesAnteriorKey)}`}
		</button>
		{#if fechamentoAberto}
			<div class="score-tip" style="margin-top:10px">
				<p class="score-tip-head">{monthLabel(fechamentoMensal.mesAnteriorKey).toUpperCase()} FOI ASSIM</p>
				<div class="week-summary-grid" style="margin-top:10px">
					<div class="week-summary-item">
						<p class="week-summary-label">Receitas</p>
						<p class="week-summary-value privacy-value">{fmtMoney(fechamentoMensal.receitas)}</p>
					</div>
					<div class="week-summary-item">
						<p class="week-summary-label">Despesas</p>
						<p class="week-summary-value privacy-value">{fmtMoney(fechamentoMensal.despesas)}</p>
					</div>
					<div class="week-summary-item">
						<p class="week-summary-label">Você guardou</p>
						<p class="week-summary-value privacy-value">{fmtMoney(fechamentoMensal.guardado)}</p>
						{#if fechamentoMensal.taxaPoupanca !== null}
							<p class="week-summary-delta">Taxa de poupança: {fechamentoMensal.taxaPoupanca}%</p>
						{/if}
					</div>
					{#if fechamentoMensal.maiorGasto}
						<div class="week-summary-item">
							<p class="week-summary-label">Seu maior gasto</p>
							<p class="week-summary-value">{fechamentoMensal.maiorGasto[0]}</p>
							<p class="week-summary-delta privacy-value">{fmtMoney(fechamentoMensal.maiorGasto[1])}</p>
						</div>
					{/if}
					{#if fechamentoMensal.melhorResultado}
						<div class="week-summary-item">
							<p class="week-summary-label">Seu melhor resultado</p>
							<p class="week-summary-value">{fechamentoMensal.melhorResultado.nome}</p>
							<p class="week-summary-delta privacy-value">+{fmtMoney(fechamentoMensal.melhorResultado.valor)}</p>
						</div>
					{/if}
					<div class="week-summary-item">
						<p class="week-summary-label">Score</p>
						<p class="week-summary-value" style={`color:${scoreColor(financialScore.overall)}`}>
							{fechamentoMensal.scoreAnterior !== null ? `${fechamentoMensal.scoreAnterior} → ${financialScore.overall}` : financialScore.overall}
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if categoriasComOrcamento.length || appState.budgetGlobal}
	<div class="score-row">
		<div class="card">
			<div class="feed-list-head">
				<p class="stat-label" style="margin:0">Orçamento por categoria</p>
				<a class="link-more" href="/categorias">Gerenciar ↗</a>
			</div>
			<p class="cat-row-sub" style="margin:0 0 10px">Ainda falta{diasRestantesMes === 1 ? '' : 'm'} {diasRestantesMes} dia{diasRestantesMes > 1 ? 's' : ''} para o fim do mês.</p>
			{#if appState.budgetGlobal}
				<div class="mini-progress-track" style="margin-bottom:4px">
					<div class="mini-progress-fill" style={`width:${pctOrcamentoGlobal}%; background:${corOrcamento(pctOrcamentoGlobal)}`}></div>
				</div>
				<p class="cat-row-sub" style="margin:0 0 12px">Total do mês: {fmtMoney(gastoTotalMes)} de {fmtMoney(appState.budgetGlobal)} ({pctOrcamentoGlobal}%)</p>
			{/if}
			<div class="score-components" style="grid-template-columns:1fr">
				{#each categoriasComOrcamento as { cat, gasto, pct } (cat.id)}
					<div class="score-component-row" style="grid-template-columns:120px 1fr 90px">
						<span class="score-component-label">{cat.nome}</span>
						<div class="score-component-track">
							<div class="score-component-fill" style={`width:${pct}%; background:${corOrcamento(pct)}`}></div>
						</div>
						<span class="score-component-value" style="text-align:right">{fmtMoney(gasto)} / {fmtMoney(cat.orcamentoMensal)}</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<div class="feed-row">
	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0">Movimentações recentes</p>
			<a class="link-more" href="/movimentacoes">Ver todas ↗</a>
		</div>
		{#if recentes.length}
			{#each recentes as tr (tr.id)}
				{@const conta = appState.accounts.find((a) => a.id === tr.contaId)}
				<div class="feed-row-item">
					<span class="type-icon" class:income={tr.tipo === 'receita' && !tr.isTransferencia} class:transfer={tr.isTransferencia}>
						{#if tr.isTransferencia}<ArrowLeftRight size={16} />{:else if tr.tipo === 'receita'}<ArrowUpRight size={16} />{:else}<ArrowDownRight size={16} />{/if}
					</span>
					<div class="feed-row-info">
						<p class="feed-row-name">{tr.descricao || 'Lançamento'}</p>
						<p class="feed-row-meta">
							{tr.isTransferencia ? 'Transferência' : appState.categories.find((c) => c.id === tr.categoriaId)?.nome || 'Sem categoria'} · {conta?.nome || 'Sem conta'}
						</p>
					</div>
					<div class="feed-row-amount">
						<p class="privacy-value" class:money-in={tr.tipo === 'receita'} class:money-out={tr.tipo === 'despesa'}>{tr.tipo === 'receita' ? '+' : '−'} {fmtMoney(tr.valor)}</p>
						<p class="feed-row-date">{fmtDate(tr.data)}</p>
					</div>
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<p class="empty">Ainda não há movimentações.</p>
				<p class="empty-sub">Comece registrando sua primeira receita ou despesa.</p>
				<button class="btn btn-primary sm" onclick={() => (showNew = true)}><Plus size={14} /> Adicionar lançamento</button>
			</div>
		{/if}
	</div>
	<div class="insight-card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0"><Sparkles size={16} color="var(--accent-fg)" style="vertical-align:-3px; margin-right:6px" />Insights</p>
			<a class="link-more" href="/relatorios">Ver relatório ↗</a>
		</div>
		{#if insights.length}
			<div class="insight-list">
				{#each insights as ins, i (i)}
					<div class="insight-item">
						<span class="insight-item-tag" data-tipo={ins.tipo}>{INSIGHT_LABELS[ins.tipo] || 'Insight'}</span>
						<p class="insight-item-title">{ins.title}</p>
						<p class="insight-item-body">{ins.body}</p>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">Sem insights por enquanto — continue registrando seus lançamentos para receber recomendações.</p>
		{/if}
	</div>
</div>
{/if}

<FinancialCalendarModal open={showCalendar} onClose={() => (showCalendar = false)} />
<NewMovementModal open={showNew} onClose={() => (showNew = false)} />
<MonthMovementsModal
	open={monthDetailTipo !== null}
	tipo={monthDetailTipo}
	transactions={monthDetailTipo === 'receita' ? entradasMes : saidasMes}
	monthLabel={monthLabel(mKey)}
	onClose={() => (monthDetailTipo = null)}
/>
<MoveFormModal
	open={aporteModal.open}
	resourceId={aporteModal.resourceId}
	goalId={aporteModal.goalId}
	prefill={aporteModal.prefill}
	onClose={() => (aporteModal = { ...aporteModal, open: false })}
/>
