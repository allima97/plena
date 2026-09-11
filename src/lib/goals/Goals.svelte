<script>
	import {
		appState,
		removeGoal,
		updateGoal,
		removeResource,
		removeResourceMove,
		removeInstallment,
		removeAmortization,
		restoreResource,
		restoreResourceMove,
		restoreInstallment,
		restoreAmortization
	} from '$lib/fin/store.svelte.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { page } from '$app/state';
	import { computeMetrics, progressColor, encargosAbatimentoSummary, installmentYearsOf, estimateMonthlyRate, simulateAmortizationScenario, simulateMultipleAmortizations } from './metrics.js';
	import { GOAL_TYPES } from './constants.js';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GoalFormModal from './GoalFormModal.svelte';
	import ResourceFormModal from './ResourceFormModal.svelte';
	import MoveFormModal from './MoveFormModal.svelte';
	import InstallmentFormModal from './InstallmentFormModal.svelte';
	import AmortizationFormModal from './AmortizationFormModal.svelte';
	import RowActionsModal from '$lib/components/RowActionsModal.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { Plus, Archive, ArchiveRestore, Pencil, Trash2, ChevronDown, ChevronUp, Wallet, Eye, X, Minus, Pause, Play } from 'lucide-svelte';

	const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

	// Se a página abriu a partir da busca global (?goal=<id>), começa com esse objetivo
	// selecionado -- o efeito abaixo cai pro primeiro objetivo se o id não existir/for inválido.
	let selectedGoalId = $state(page.url.searchParams.get('goal'));
	let showArchived = $state(false);
	let expandedResource = $state({});
	let movesPage = $state({}); // resourceId -> pagina atual

	let expandedAmortCard = $state({}); // goalId -> expandido? (padrao: fechado)
	let amortPage = $state({}); // goalId -> pagina atual

	let instPage = $state({}); // goalId -> pagina atual

	// Modal genérico de ações de uma linha (movimentação de recurso ou
	// amortização) -- substitui os botões "Editar/Excluir" sempre visíveis.
	let rowActions = $state({ open: false, title: '', subtitle: '', actions: [] });
	function openRowActions(config) {
		rowActions = { open: true, ...config };
	}

	// Prestação selecionada para o modal de detalhes/ações (substitui o
	// expandir-em-linha + botões de ícone que existiam antes).
	let installmentDetail = $state({ open: false, installment: null });
	let instFindMonth = $state(''); // "YYYY-MM" digitado na busca de Ultimas Prestacoes

	let installmentYear = $state(null); // ano escolhido em "Prestacoes do financiamento"
	let encargosPeriod = $state('currentYear'); // 'currentYear' | 'last12' | 'all' | 'year' | 'installment'
	let encargosYear = $state(null); // ano escolhido no seletor "Em <ano>" de Encargos e Abatimentos
	let compositionInstallmentId = $state(null); // prestacao escolhida (icone de olho / seletor / Anterior-Proxima)

	let simAporte = $state(''); // Fase 5: simulador de amortizacao extra -- valor hipotetico digitado pelo usuario
	let simAportesMultiplos = $state([]); // P5.4: lista de aportes futuros planejados { id, mes, valor }

	const ENCARGOS_MAIN_PERIODS = [
		{ key: 'currentYear', label: 'Ano atual' },
		{ key: 'last12', label: 'Últimas 12 Prestações' },
		{ key: 'all', label: 'Total do Contrato' }
	];
	// Mesmas cores do nextgoals para os selos de categoria (Amortização Extra reaproveita o vermelho de despesa do Plena).
	const SEG_COLORS = {
		amortizacao: 'var(--cat-amort)',
		juros: 'var(--cat-juros)',
		correcao: 'var(--cat-correcao)',
		seguros: 'var(--cat-seguros)',
		taxas: 'var(--cat-taxas)',
		extra: 'var(--expense)',
		diferenca: 'var(--cat-diferenca)'
	};

	const activeGoals = $derived(appState.goals.filter((g) => !g.archived));
	const archivedGoals = $derived(appState.goals.filter((g) => g.archived));

	$effect(() => {
		if (selectedGoalId && appState.goals.some((g) => g.id === selectedGoalId)) return;
		selectedGoalId = activeGoals[0]?.id || appState.goals[0]?.id || null;
	});

	const selectedGoal = $derived(appState.goals.find((g) => g.id === selectedGoalId) || null);
	// Objetivo pode ser numa moeda diferente da padrão do sistema (ver GoalFormModal) -- os
	// valores do próprio objetivo (meta, acumulado, aportes) mostram nessa moeda.
	const moeda = $derived(selectedGoal?.currency || 'BRL');
	const metrics = $derived(
		selectedGoal
			? computeMetrics(selectedGoal, {
					resources: appState.resources,
					resourceMoves: appState.resourceMoves,
					goalCategories: appState.goalCategories,
					installments: appState.installments,
					amortizations: appState.amortizations
				})
			: null
	);

	// ---------- Fase 5: simulador de amortização extra ("e se eu pagasse R$X a mais agora?") ----------
	$effect(() => {
		selectedGoalId;
		simAporte = '';
		simAportesMultiplos = [];
	});
	function addSimAporteMultiplo() {
		simAportesMultiplos = [...simAportesMultiplos, { id: `${Date.now()}-${Math.random()}`, mes: '', valor: '' }];
	}
	function removeSimAporteMultiplo(id) {
		simAportesMultiplos = simAportesMultiplos.filter((a) => a.id !== id);
	}
	const simTaxaMensal = $derived(metrics ? estimateMonthlyRate(metrics.installmentRows) : null);
	const simBase = $derived.by(() => {
		if (!metrics || !metrics.installmentRows.length || !simTaxaMensal) return null;
		const last = metrics.installmentRows[metrics.installmentRows.length - 1];
		if (!(last.saldoDevedor > 0) || !(last.valorPrestacao > 0)) return null;
		return { saldo: last.saldoDevedor, taxaMensal: simTaxaMensal, parcela: last.valorPrestacao };
	});
	const simResult = $derived.by(() => {
		if (!simBase) return { valido: false };
		return simulateAmortizationScenario({ ...simBase, aporte: Number(simAporte) || 0 });
	});
	const simMultiploResult = $derived.by(() => {
		if (!simBase) return { valido: false };
		const aportes = simAportesMultiplos
			.filter((a) => Number(a.mes) >= 1 && Number(a.valor) > 0)
			.map((a) => ({ mes: Number(a.mes), valor: Number(a.valor) }));
		if (!aportes.length) return { valido: false };
		return simulateMultipleAmortizations({ ...simBase, aportes });
	});

	// ---------- Prestações do financiamento: anos disponíveis (5 mais recentes) ----------
	const installmentYears = $derived(metrics ? installmentYearsOf(metrics.installments) : []);
	$effect(() => {
		if (installmentYears.length && (installmentYear == null || !installmentYears.includes(installmentYear))) {
			installmentYear = installmentYears[0];
		}
	});
	$effect(() => {
		if (installmentYears.length && (encargosYear == null || !installmentYears.includes(encargosYear))) {
			encargosYear = installmentYears[0];
		}
	});
	const yearInstallments = $derived(
		metrics && installmentYear != null ? metrics.installmentRows.filter((it) => new Date(it.date + 'T12:00:00').getFullYear() === installmentYear) : []
	);
	// Abatimento mês a mês: mais recente primeiro (a lista de origem vem cronológica).
	const orderedYearInstallments = $derived([...yearInstallments].reverse());

	// ---------- Encargos e Abatimentos ----------
	const compositionRefIndex = $derived.by(() => {
		if (!metrics || !metrics.installmentRows.length) return -1;
		if (compositionInstallmentId) {
			const idx = metrics.installmentRows.findIndex((it) => it.id === compositionInstallmentId);
			if (idx >= 0) return idx;
		}
		return metrics.installmentRows.length - 1;
	});
	const compositionRef = $derived(compositionRefIndex >= 0 ? metrics.installmentRows[compositionRefIndex] : null);

	const encargosSummary = $derived(
		metrics && encargosPeriod !== 'installment' ? encargosAbatimentoSummary(metrics.installmentRows, encargosPeriod, encargosYear) : null
	);

	function rankedLegend(segs, baseOverride) {
		const base = baseOverride != null ? baseOverride : segs.reduce((s, x) => s + Math.abs(x.val), 0);
		return segs.map((s) => ({ ...s, pct: base > 0 ? (Math.abs(s.val) / base) * 100 : 0 })).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
	}

	const encargosLegend = $derived(
		encargosSummary
			? rankedLegend([
					{ key: 'amortizacao', label: 'Amortização da parcela', val: encargosSummary.totalAmortizacaoParcela, color: SEG_COLORS.amortizacao },
					{ key: 'juros', label: 'Juros', val: encargosSummary.totalJuros, color: SEG_COLORS.juros },
					{ key: 'correcao', label: 'Correção monetária', val: encargosSummary.totalCorrecao, color: SEG_COLORS.correcao },
					{ key: 'seguros', label: 'Seguros', val: encargosSummary.totalSeguros, color: SEG_COLORS.seguros },
					{ key: 'taxas', label: 'Taxas', val: encargosSummary.totalTaxas, color: SEG_COLORS.taxas },
					{ key: 'extra', label: 'Amortização Extra', val: encargosSummary.totalExtra, color: SEG_COLORS.extra }
				])
			: []
	);

	const compositionLegend = $derived.by(() => {
		if (!compositionRef) return [];
		const it = compositionRef;
		const refTotal = (it.amortizacao || 0) + (it.juros || 0) + (it.seguros || 0) + (it.taxas || 0);
		return rankedLegend(
			[
				{ key: 'amortizacao', label: 'Amortização', val: it.amortizacao || 0, color: SEG_COLORS.amortizacao },
				{ key: 'juros', label: 'Juros', val: it.juros || 0, color: SEG_COLORS.juros },
				{ key: 'seguros', label: 'Seguros', val: it.seguros || 0, color: SEG_COLORS.seguros },
				{ key: 'taxas', label: 'Taxas', val: it.taxas || 0, color: SEG_COLORS.taxas },
				{ key: 'correcao', label: 'Correção monetária', val: it.correcaoMonetaria || 0, color: SEG_COLORS.correcao },
				{ key: 'diferenca', label: 'Valor da diferença', val: it.valorDiferenca || 0, color: SEG_COLORS.diferenca }
			],
			refTotal
		);
	});

	const encargosRangeLabel = $derived.by(() => {
		if (!encargosSummary || !encargosSummary.subset.length) return 'Nenhuma prestação neste período.';
		const n = encargosSummary.subset.length;
		const first = encargosSummary.subset[0];
		const last = encargosSummary.subset[n - 1];
		return `${n} ${n === 1 ? 'prestação' : 'prestações'} · ${fmtDate(first.date)} – ${fmtDate(last.date)}`;
	});

	function viewComposition(installmentId) {
		compositionInstallmentId = installmentId;
		encargosPeriod = 'installment';
	}
	function navComposition(dir) {
		if (!metrics) return;
		const idx = compositionRefIndex + (dir === 'prev' ? -1 : 1);
		if (idx < 0 || idx >= metrics.installmentRows.length) return;
		compositionInstallmentId = metrics.installmentRows[idx].id;
		encargosPeriod = 'installment';
	}

	// ---------- paginação (recursos, amortizações, últimas prestações) ----------
	// Puramente derivada a partir do estado -- nunca escreve de volta durante a
	// renderização, só nos handlers dos botões Anterior/Próxima.
	function pageInfo(list, rawPage, pageSize) {
		const totalPages = Math.max(Math.ceil(list.length / pageSize), 1);
		const page = Math.max(0, Math.min(rawPage || 0, totalPages - 1));
		return { items: list.slice(page * pageSize, page * pageSize + pageSize), page, totalPages };
	}

	function movesOf(resourceId) {
		return appState.resourceMoves.filter((m) => m.resourceId === resourceId).sort((a, b) => (a.date < b.date ? 1 : -1));
	}
	function resourceBalanceOf(resourceId) {
		return movesOf(resourceId).reduce((s, m) => s + (m.amount || 0), 0);
	}

	// modais
	let goalModal = $state({ open: false, editing: null });
	let resourceModal = $state({ open: false, goalId: null, editing: null });
	let moveModal = $state({ open: false, resourceId: null, goalId: null, editing: null });
	let installmentModal = $state({ open: false, goalId: null, editing: null });
	let amortModal = $state({ open: false, goalId: null, editing: null });
	let deleting = $state(null); // { kind, id, label, warn }

	function confirmDelete() {
		if (!deleting) return;
		const { kind, id } = deleting;
		if (kind === 'goal') {
			// Objetivo inteiro: cascata grande demais (recursos, movimentações, prestações,
			// amortizações) pra desfazer com segurança -- o aviso no ConfirmDialog já cobre isso.
			removeGoal(id);
		} else if (kind === 'resource') {
			const snapshot = appState.resources.find((r) => r.id === id);
			const movesSnapshot = appState.resourceMoves.filter((m) => m.resourceId === id).map((m) => ({ ...m }));
			removeResource(id);
			if (snapshot) {
				showToast({
					message: `Recurso "${snapshot.name}" excluído.`,
					actionLabel: 'DESFAZER',
					onAction: () => {
						restoreResource(snapshot);
						movesSnapshot.forEach((m) => restoreResourceMove(m));
					}
				});
			}
		} else if (kind === 'move') {
			const snapshot = appState.resourceMoves.find((m) => m.id === id);
			removeResourceMove(id);
			if (snapshot) {
				showToast({ message: 'Movimentação excluída.', actionLabel: 'DESFAZER', onAction: () => restoreResourceMove(snapshot) });
			}
		} else if (kind === 'installment') {
			const snapshot = appState.installments.find((i) => i.id === id);
			removeInstallment(id);
			if (snapshot) {
				showToast({ message: `Prestação nº ${snapshot.number} excluída.`, actionLabel: 'DESFAZER', onAction: () => restoreInstallment(snapshot) });
			}
		} else if (kind === 'amortization') {
			const snapshot = appState.amortizations.find((a) => a.id === id);
			removeAmortization(id);
			if (snapshot) {
				showToast({ message: 'Amortização excluída.', actionLabel: 'DESFAZER', onAction: () => restoreAmortization(snapshot) });
			}
		}
		deleting = null;
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Objetivos</h1>
		<p class="page-sub">A mesma ideia do Rumo Financeiro (nextgoals), agora no design do Plena.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (goalModal = { open: true, editing: null })}><Plus size={16} /> Novo objetivo</button>
</div>

<div class="goals-layout">
	<div class="goals-list" style="--goal-cols:{Math.max(Math.min(activeGoals.length, 6), 1)}">
		{#each activeGoals as g (g.id)}
			{@const m = computeMetrics(g, { resources: appState.resources, resourceMoves: appState.resourceMoves, goalCategories: appState.goalCategories, installments: appState.installments, amortizations: appState.amortizations })}
			<button class="goal-list-item" class:active={g.id === selectedGoalId} class:paused={g.paused} onclick={() => (selectedGoalId = g.id)}>
				<div class="goal-list-top">
					<span class="goal-list-name">{g.name}</span>
					{#if g.paused}
						<span class="badge badge-gray"><Pause size={11} style="vertical-align:-1px;margin-right:3px" />Pausado</span>
					{:else}
						<span class="badge" class:badge-green={m.statusTone === 'good'} class:badge-red={m.statusTone === 'danger'} class:badge-orange={m.statusTone === 'warn'} class:badge-gray={m.statusTone === 'neutral'}>
							{m.statusLabel}
						</span>
					{/if}
				</div>
				<p class="goal-list-type">{GOAL_TYPES[g.type]?.label || 'Outro objetivo'}</p>
				<div class="goal-progress-track" style="margin-top:8px">
					<div class="goal-progress-fill" style="width:{m.percent * 100}%;background:{progressColor(m.percent)}"></div>
				</div>
				<p class="goal-list-values"><span class="privacy-value">{fmtMoney(m.totalAccumulated, g.currency)}</span> de <span class="privacy-value">{fmtMoney(m.effectiveTarget, g.currency)}</span></p>
				{#if m.status !== 'concluido' && m.targetDate && m.projectedDate}
					<p class="goal-list-pace">Previsão: {m.projectedDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</p>
				{/if}
			</button>
		{:else}
			<p class="empty">Nenhum objetivo ainda.</p>
		{/each}
	</div>

	{#if archivedGoals.length}
		<div class="goals-archived-row">
			<button class="btn btn-ghost sm" onclick={() => (showArchived = !showArchived)}>
				{showArchived ? 'Ocultar' : 'Mostrar'} arquivados ({archivedGoals.length})
			</button>
			{#if showArchived}
				<div class="goals-list archived" style="--goal-cols:{Math.max(Math.min(archivedGoals.length, 6), 1)}">
					{#each archivedGoals as g (g.id)}
						<button class="goal-list-item archived" class:active={g.id === selectedGoalId} onclick={() => (selectedGoalId = g.id)}>
							<span class="goal-list-name">{g.name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<section class="goal-detail">
		{#if selectedGoal && metrics}
			<div class="card">
				<div class="goal-detail-head">
					<div>
						<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
							<p class="stat-label" style="margin:0">{GOAL_TYPES[selectedGoal.type]?.label || 'Outro objetivo'}</p>
							{#if selectedGoal.paused}<span class="badge badge-gray"><Pause size={11} style="vertical-align:-1px;margin-right:3px" />Pausado</span>{/if}
						</div>
						<h2 class="font-display" style="margin:4px 0 0;font-size:22px">{selectedGoal.name}</h2>
						{#if selectedGoal.notes}<p class="movement-meta" style="margin-top:6px">{selectedGoal.notes}</p>{/if}
						{#if selectedGoal.paused}<p class="movement-meta" style="margin-top:6px">Objetivo pausado: não entra no score financeiro, nos avisos nem nos totais da Dashboard, do Simulador ou do Patrimônio.</p>{/if}
					</div>
					<div class="actions-row">
						<button class="btn btn-ghost sm" aria-label="Editar" title="Editar" onclick={() => (goalModal = { open: true, editing: selectedGoal })}><Pencil size={14} /> <span class="btn-label">Editar</span></button>
						<button class="btn btn-ghost sm" aria-label={selectedGoal.paused ? 'Retomar' : 'Pausar'} title={selectedGoal.paused ? 'Retomar' : 'Pausar'} onclick={() => updateGoal(selectedGoal.id, { paused: !selectedGoal.paused })}>
							{#if selectedGoal.paused}<Play size={14} /> <span class="btn-label">Retomar</span>{:else}<Pause size={14} /> <span class="btn-label">Pausar</span>{/if}
						</button>
						<button class="btn btn-ghost sm" aria-label={selectedGoal.archived ? 'Reativar' : 'Arquivar'} title={selectedGoal.archived ? 'Reativar' : 'Arquivar'} onclick={() => updateGoal(selectedGoal.id, { archived: !selectedGoal.archived })}>
							{#if selectedGoal.archived}<ArchiveRestore size={14} /> <span class="btn-label">Reativar</span>{:else}<Archive size={14} /> <span class="btn-label">Arquivar</span>{/if}
						</button>
						<button class="btn btn-danger sm" aria-label="Excluir" title="Excluir" onclick={() => (deleting = { kind: 'goal', id: selectedGoal.id, label: `"${selectedGoal.name}"`, warn: 'Todos os recursos, movimentações e prestações desse objetivo serão apagados.' })}>
							<Trash2 size={14} /> <span class="btn-label">Excluir</span>
						</button>
					</div>
				</div>

				<div class="goal-progress-track" style="margin-top:18px;height:12px">
					<div class="goal-progress-fill" style="width:{metrics.percent * 100}%;background:{progressColor(metrics.percent)}"></div>
				</div>
				<p class="stat-sub" style="margin-top:8px">{Math.round(metrics.percent * 100)}% concluído</p>

				<div class="grid-cards" style="margin-top:18px">
					<div class="stat-card kpi-green">
						<p class="stat-label">Objetivo</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.effectiveTarget, moeda)}</p>
						{#if selectedGoal.linkToBalance}
							<p class="stat-sub">
								vinculado ao saldo devedor
								{#if metrics.latestInstallment}
									· <button type="button" class="stat-caption-link" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: metrics.latestInstallment })}>editar</button>
								{/if}
							</p>
						{/if}
					</div>
					<div class="stat-card kpi-amber">
						<p class="stat-label">Acumulado</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.totalAccumulated, moeda)}</p>
					</div>
					<div class="stat-card" class:kpi-green={metrics.remaining <= 0} class:kpi-rose={metrics.remaining > 0}>
						<p class="stat-label">Falta arrecadar</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.remaining, moeda)}</p>
					</div>
					<div class="stat-card kpi-blue">
						<p class="stat-label">Recomendado/mês</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.recommendedMonthly, moeda)}</p>
						<p class="stat-sub">{metrics.monthsLeft != null ? `${metrics.monthsLeft} meses restantes` : 'sem prazo definido'}</p>
					</div>
				</div>

				<div class="goal-pace-row">
					<div class="stat-card kpi-gold">
						<p class="stat-label">Média Geral</p>
						<p class="font-display stat-value privacy-value">{metrics.generalAveragePace > 0 ? fmtMoney(metrics.generalAveragePace, moeda) : '—'}</p>
						<p class="stat-sub">média mensal desde o início do objetivo</p>
					</div>
					<div class="stat-card">
						<p class="stat-label">Previsão de conclusão</p>
						<p class="font-display stat-value" class:good={metrics.status !== 'atrasado' && metrics.status !== 'sem-ritmo'} class:warn={metrics.status === 'sem-ritmo'} class:danger={metrics.status === 'atrasado'} style="font-size:18px">
							{metrics.status === 'concluido' ? (metrics.achievedDate ? fmtDate(metrics.achievedDate) : 'Concluído') : metrics.projectedDate ? metrics.projectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—'}
						</p>
						{#if metrics.usesAbatimentoProjection}
							<p class="stat-sub">considera aportes + abatimento da última prestação; pode variar com juros, saldo devedor e correções monetárias</p>
						{:else if selectedGoal.targetDate}
							<p class="stat-sub">meta: {fmtDate(selectedGoal.targetDate)}</p>
						{/if}
					</div>
				</div>
			</div>

			<div class="card" style="margin-top:16px">
				<div class="page-head page-head--flat" style="margin-bottom:14px">
					<p class="stat-label" style="margin:0">Recursos</p>
					<button class="btn sm" onclick={() => (resourceModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Novo recurso</button>
				</div>
				{#each metrics.resources as r (r.id)}
					{@const moves = movesOf(r.id)}
					{@const mp = pageInfo(moves, movesPage[r.id] || 0, 5)}
					<div class="resource-block">
						<button class="resource-head" onclick={() => (expandedResource = { ...expandedResource, [r.id]: !expandedResource[r.id] })}>
							<span class="type-icon income"><Wallet size={15} /></span>
							<span class="resource-name">{r.name}</span>
							<span class="font-display resource-balance privacy-value">{fmtMoney(resourceBalanceOf(r.id), moeda)}</span>
							{#if expandedResource[r.id]}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
						</button>
						{#if expandedResource[r.id]}
							<div class="resource-body">
								<div class="actions-row" style="margin-bottom:10px">
									<button class="btn btn-ghost sm" onclick={() => (moveModal = { open: true, resourceId: r.id, goalId: selectedGoal.id, editing: null })}><Plus size={13} /> Lançamento</button>
									<button class="btn btn-ghost sm" onclick={() => (resourceModal = { open: true, goalId: selectedGoal.id, editing: r })}>Editar recurso</button>
									<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'resource', id: r.id, label: `"${r.name}"`, warn: 'O histórico de movimentações desse recurso será apagado.' })}>Excluir recurso</button>
								</div>
								{#each mp.items as mv (mv.id)}
									<div
										class="movement-row"
										style="padding:10px 0"
										role="button"
										tabindex="0"
										onclick={() =>
											openRowActions({
												title: mv.description,
												subtitle: fmtDate(mv.date),
												actions: [
													{ label: 'Editar', icon: Pencil, onClick: () => (moveModal = { open: true, resourceId: r.id, goalId: selectedGoal.id, editing: mv }) },
													{ label: 'Excluir', icon: Trash2, variant: 'danger', onClick: () => (deleting = { kind: 'move', id: mv.id, label: `"${mv.description}"`, warn: '' }) }
												]
											})}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
										}}
									>
										<div class="movement-info">
											<p class="movement-desc">{mv.description}</p>
											<p class="movement-meta">{fmtDate(mv.date)}</p>
										</div>
										<div class="movement-amount">
											<p class="font-display privacy-value" class:money-in={mv.amount >= 0} class:money-out={mv.amount < 0}>{fmtMoney(mv.amount, moeda)}</p>
											{#if mv.baseAmount}<p class="movement-date privacy-value">≈ {fmtMoney(mv.baseAmount, appState.settings.moedaPadrao)}</p>{/if}
										</div>
									</div>
								{:else}
									<p class="empty">Nenhuma movimentação ainda.</p>
								{/each}
								{#if moves.length > 5}
									<div class="list-nav">
										<button type="button" class="list-nav-btn" disabled={mp.page <= 0} onclick={() => (movesPage = { ...movesPage, [r.id]: mp.page - 1 })}>‹ Anterior</button>
										<span class="list-nav-range">{mp.page * 5 + 1}–{Math.min((mp.page + 1) * 5, moves.length)} de {moves.length}</span>
										<button type="button" class="list-nav-btn" disabled={mp.page >= mp.totalPages - 1} onclick={() => (movesPage = { ...movesPage, [r.id]: mp.page + 1 })}>Próxima ›</button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else}
					<p class="empty">Nenhum recurso ainda — crie um para começar a registrar aportes.</p>
				{/each}
			</div>

			{#if selectedGoal.type === 'financiamento'}
				<!-- Amortizações Extras: mesmo padrão visual de um card de Recurso (linha com nome + saldo, corpo expansível), fechado por padrão. -->
				<div class="card" style="margin-top:16px">
					<div class="page-head" style="margin-bottom:6px">
						<p class="stat-label" style="margin:0">Amortizações Extras</p>
						<button class="btn sm" onclick={() => (amortModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Nova amortização</button>
					</div>
					<p class="movement-meta" style="margin:0 0 12px">
						Valores pagos direto ao banco, fora dos recursos — somados ao abatimento do mês correspondente. O saldo devedor e o objetivo só são atualizados quando a próxima prestação (já com o valor descontado) for lançada.
					</p>
					{#if !metrics.amortizations.length}
						<p class="empty">Nenhuma amortização registrada ainda.</p>
					{:else}
						{@const sortedAmorts = [...metrics.amortizations].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))}
						{@const totalAmort = metrics.amortizations.reduce((s, a) => s + (a.amount || 0), 0)}
						{@const ap = pageInfo(sortedAmorts, amortPage[selectedGoal.id] || 0, 5)}
						<div class="resource-block">
							<button class="resource-head" onclick={() => (expandedAmortCard = { ...expandedAmortCard, [selectedGoal.id]: !expandedAmortCard[selectedGoal.id] })}>
								<span class="type-icon"><Minus size={15} /></span>
								<span class="resource-name">Amortizações</span>
								<span class="font-display resource-balance money-out privacy-value">-{fmtMoney(totalAmort)}</span>
								{#if expandedAmortCard[selectedGoal.id]}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
							</button>
							{#if expandedAmortCard[selectedGoal.id]}
								<div class="resource-body">
									{#each ap.items as a (a.id)}
										<div
											class="movement-row"
											style="padding:10px 0"
											role="button"
											tabindex="0"
											onclick={() =>
												openRowActions({
													title: a.tipo,
													subtitle: fmtDate(a.date),
													actions: [
														{ label: 'Editar', icon: Pencil, onClick: () => (amortModal = { open: true, goalId: selectedGoal.id, editing: a }) },
														{ label: 'Excluir', icon: Trash2, variant: 'danger', onClick: () => (deleting = { kind: 'amortization', id: a.id, label: 'esta amortização', warn: '' }) }
													]
												})}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click();
											}}
										>
											<div class="movement-info">
												<p class="movement-desc">{a.tipo}</p>
												<p class="movement-meta">{fmtDate(a.date)}</p>
											</div>
											<div class="movement-amount"><p class="font-display money-out privacy-value">-{fmtMoney(a.amount)}</p></div>
										</div>
									{/each}
									{#if metrics.amortizations.length > 5}
										<div class="list-nav">
											<button type="button" class="list-nav-btn" disabled={ap.page <= 0} onclick={() => (amortPage = { ...amortPage, [selectedGoal.id]: ap.page - 1 })}>‹ Anterior</button>
											<span class="list-nav-range">{ap.page * 5 + 1}–{Math.min((ap.page + 1) * 5, metrics.amortizations.length)} de {metrics.amortizations.length}</span>
											<button type="button" class="list-nav-btn" disabled={ap.page >= ap.totalPages - 1} onclick={() => (amortPage = { ...amortPage, [selectedGoal.id]: ap.page + 1 })}>Próxima ›</button>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				{#if simBase}
					<!-- Central do financiamento (P5.1): os 4 números que mais importam, num só lugar. -->
					<div class="card" style="margin-top:16px">
						<p class="stat-label" style="margin:0 0 12px">Central do financiamento</p>
						<div class="grid-cards">
							<div class="stat-card kpi-rose">
								<p class="stat-label">Saldo devedor</p>
								<p class="font-display stat-value privacy-value">{fmtMoney(simBase.saldo)}</p>
							</div>
							<div class="stat-card kpi-blue">
								<p class="stat-label">Prestação atual</p>
								<p class="font-display stat-value privacy-value">{fmtMoney(simBase.parcela)}</p>
							</div>
							<div class="stat-card">
								<p class="stat-label">Prazo restante</p>
								<p class="font-display stat-value">{selectedGoal.remainingTermMonths ?? '—'}{selectedGoal.remainingTermMonths ? ' meses' : ''}</p>
							</div>
							<div class="stat-card kpi-gold">
								<p class="stat-label">Taxa estimada</p>
								<p class="font-display stat-value">{(simBase.taxaMensal * 100).toFixed(2)}% a.m.</p>
							</div>
						</div>
					</div>

					<!-- Simulador de amortização (Fase 5): "e se eu pagasse R$X a mais agora?" -->
					<div class="card sim-card" style="margin-top:16px">
						<div class="page-head" style="margin-bottom:6px">
							<div>
								<p class="stat-label" style="margin:0">Simulador de amortização</p>
								<p class="movement-meta" style="margin:4px 0 0">
									E se você amortizasse um valor extra agora? Estimativa pela Tabela Price a partir do saldo devedor e da parcela mais recentes — não substitui a simulação oficial do banco.
								</p>
							</div>
							{#if selectedGoal.remainingTermMonths || selectedGoal.initialTermMonths}
								<span class="sim-prazo-chip">
									{#if selectedGoal.remainingTermMonths}{selectedGoal.remainingTermMonths}{:else}?{/if}
									{#if selectedGoal.initialTermMonths}&nbsp;de {selectedGoal.initialTermMonths}{/if}
									&nbsp;parcelas restantes
								</span>
							{/if}
						</div>
						<label class="field" style="max-width:280px">
							<span>Valor do aporte extra</span>
							<input class="field-input" type="number" step="0.01" min="0" max={simBase.saldo} placeholder="R$ 0,00" bind:value={simAporte} />
						</label>
						{#if simResult.valido && simResult.aporte > 0}
							<div class="table-wrap" style="margin-bottom:16px">
								<table class="list">
									<thead>
										<tr><th>Hoje × Depois</th><th class="num">Hoje</th><th class="num">Reduzindo prazo</th><th class="num">Reduzindo parcela</th></tr>
									</thead>
									<tbody>
										<tr>
											<td data-label="">Saldo devedor</td>
											<td class="num privacy-value" data-label="Hoje">{fmtMoney(simResult.saldo)}</td>
											<td class="num privacy-value" data-label="Reduzindo prazo">{fmtMoney(simResult.novoSaldo)}</td>
											<td class="num privacy-value" data-label="Reduzindo parcela">{fmtMoney(simResult.novoSaldo)}</td>
										</tr>
										<tr>
											<td data-label="">Parcela</td>
											<td class="num privacy-value" data-label="Hoje">{fmtMoney(simBase.parcela)}</td>
											<td class="num privacy-value" data-label="Reduzindo prazo">{fmtMoney(simBase.parcela)}</td>
											<td class="num privacy-value" data-label="Reduzindo parcela">{fmtMoney(simResult.parcelaReduzida.parcela)}</td>
										</tr>
										<tr>
											<td data-label="">Prazo</td>
											<td class="num" data-label="Hoje">{Math.ceil(simResult.mesesAtual)} meses</td>
											<td class="num" data-label="Reduzindo prazo">{Math.ceil(simResult.prazoReduzido.meses)} meses</td>
											<td class="num" data-label="Reduzindo parcela">{Math.ceil(simResult.mesesAtual)} meses</td>
										</tr>
										<tr>
											<td data-label="">Juros restantes</td>
											<td class="num privacy-value" data-label="Hoje">{fmtMoney(simResult.jurosAtual)}</td>
											<td class="num privacy-value" data-label="Reduzindo prazo">{fmtMoney(simResult.prazoReduzido.juros)}</td>
											<td class="num privacy-value" data-label="Reduzindo parcela">{fmtMoney(simResult.parcelaReduzida.juros)}</td>
										</tr>
									</tbody>
								</table>
							</div>
							<div class="sim-scenarios">
								<div class="sim-scenario">
									<p class="sim-scenario-title">Reduzindo o prazo</p>
									<p class="sim-scenario-sub">Mantém a parcela de <span class="privacy-value">{fmtMoney(simBase.parcela)}</span></p>
									<p class="sim-scenario-value privacy-value">{Math.round(simResult.prazoReduzido.mesesEconomizados)} meses a menos</p>
									<p class="sim-scenario-detail">Economia de juros: <span class="privacy-value">{fmtMoney(simResult.prazoReduzido.jurosEconomizados)}</span></p>
								</div>
								<div class="sim-scenario">
									<p class="sim-scenario-title">Reduzindo a parcela</p>
									<p class="sim-scenario-sub">Mantém o prazo em ~{Math.ceil(simResult.mesesAtual)} meses</p>
									<p class="sim-scenario-value privacy-value">-{fmtMoney(simResult.parcelaReduzida.economiaParcela)}/mês</p>
									<p class="sim-scenario-detail">Economia de juros: <span class="privacy-value">{fmtMoney(simResult.parcelaReduzida.jurosEconomizados)}</span></p>
								</div>
							</div>
							{#if simResult.prazoReduzido.jurosEconomizados !== simResult.parcelaReduzida.jurosEconomizados}
								{@const prazoGanha = simResult.prazoReduzido.jurosEconomizados > simResult.parcelaReduzida.jurosEconomizados}
								{@const diferenca = Math.abs(simResult.prazoReduzido.jurosEconomizados - simResult.parcelaReduzida.jurosEconomizados)}
								<p class="sim-verdict">
									<b>{prazoGanha ? 'Reduzir o prazo' : 'Reduzir a parcela'}</b> economiza aproximadamente <span class="privacy-value">{fmtMoney(diferenca)}</span> a mais em juros do que a outra opção.
								</p>
							{/if}
						{:else if simResult.valido}
							<p class="empty">Informe um valor de aporte para ver os cenários.</p>
						{/if}
					</div>

					<!-- Simulação de vários aportes ao longo do tempo (P5.4) -->
					<div class="card sim-card" style="margin-top:16px">
						<p class="stat-label" style="margin:0 0 4px">Simular vários aportes</p>
						<p class="movement-meta" style="margin:0 0 12px">
							Planeje mais de um aporte de amortização em momentos diferentes e veja o efeito combinado no prazo e nos juros, mantendo a parcela atual.
						</p>
						{#each simAportesMultiplos as ap (ap.id)}
							<div class="sim-multi-row">
								<label class="field">
									<span>Daqui a quantos meses</span>
									<input class="field-input" type="number" step="1" min="1" placeholder="Ex.: 6" bind:value={ap.mes} />
								</label>
								<label class="field">
									<span>Valor do aporte</span>
									<input class="field-input" type="number" step="0.01" min="0" placeholder="R$ 0,00" bind:value={ap.valor} />
								</label>
								<button type="button" class="icon-btn" onclick={() => removeSimAporteMultiplo(ap.id)} aria-label="Remover aporte">
									<Trash2 size={16} />
								</button>
							</div>
						{/each}
						<button type="button" class="btn-ghost sim-multi-add" onclick={addSimAporteMultiplo}>
							<Plus size={14} /> Adicionar aporte
						</button>
						{#if simMultiploResult.valido}
							<div class="sim-scenarios">
								<div class="sim-scenario">
									<p class="sim-scenario-title">Prazo com os aportes</p>
									<p class="sim-scenario-sub">Total aportado: <span class="privacy-value">{fmtMoney(simMultiploResult.totalAportado)}</span></p>
									<p class="sim-scenario-value privacy-value">{Math.round(simMultiploResult.mesesEconomizados)} meses a menos</p>
									<p class="sim-scenario-detail">Prazo final: ~{simMultiploResult.mesesComAportes} meses (era ~{Math.ceil(simMultiploResult.mesesSemAporte)})</p>
								</div>
								<div class="sim-scenario">
									<p class="sim-scenario-title">Economia de juros</p>
									<p class="sim-scenario-sub">Mantendo a parcela de <span class="privacy-value">{fmtMoney(simBase.parcela)}</span></p>
									<p class="sim-scenario-value privacy-value">{fmtMoney(simMultiploResult.jurosEconomizados)}</p>
									<p class="sim-scenario-detail">Juros totais: <span class="privacy-value">{fmtMoney(simMultiploResult.jurosComAportes)}</span> (era <span class="privacy-value">{fmtMoney(simMultiploResult.jurosSemAporte)}</span>)</p>
								</div>
							</div>
						{:else if simAportesMultiplos.length}
							<p class="empty" style="margin-top:12px">Informe o mês e o valor de ao menos um aporte para ver o resultado.</p>
						{/if}
					</div>
				{/if}

				{#if metrics.installmentRows.length}
					<!-- Encargos e Abatimentos: resumo por período, antes do detalhe mês a mês. -->
					<div class="card" style="margin-top:16px">
						<div class="page-head" style="margin-bottom:2px">
							<p class="stat-label" style="margin:0">Encargos e Abatimentos</p>
							<div class="encargos-tabs filters-bar" style="margin:0">
								<select onchange={(e) => (encargosPeriod = e.currentTarget.value)}>
									{#each ENCARGOS_MAIN_PERIODS as p (p.key)}
										<option value={p.key} selected={encargosPeriod === p.key}>{p.label}</option>
									{/each}
								</select>
								<select onchange={(e) => { encargosPeriod = 'installment'; compositionInstallmentId = e.currentTarget.value; }}>
									{#each [...metrics.installmentRows].reverse() as it (it.id)}
										<option value={it.id} selected={compositionRef && it.id === compositionRef.id}>Prestação nº{it.number} ({fmtDate(it.date)})</option>
									{/each}
								</select>
								{#if installmentYears.length}
									<select onchange={(e) => { encargosPeriod = 'year'; encargosYear = Number(e.currentTarget.value); }}>
										{#each installmentYears as y (y)}
											<option value={y} selected={encargosPeriod === 'year' && encargosYear === y}>Em {y}</option>
										{/each}
									</select>
								{/if}
							</div>
						</div>

						{#if encargosPeriod === 'installment' && compositionRef}
							<div class="page-head" style="margin-bottom:0">
								<p class="movement-meta" style="margin:0">Prestação nº{compositionRef.number} ({fmtDate(compositionRef.date)})</p>
								<div class="list-nav" style="margin-top:0">
									<button type="button" class="list-nav-btn" disabled={compositionRefIndex <= 0} onclick={() => navComposition('prev')}>‹ Anterior</button>
									<button type="button" class="list-nav-btn" disabled={compositionRefIndex >= metrics.installmentRows.length - 1} onclick={() => navComposition('next')}>Próxima ›</button>
								</div>
							</div>
							<div class="comp-legend">
								{#each compositionLegend as s (s.key)}
									<div class="comp-legend-item">
										<div class="comp-legend-top"><span class="comp-legend-swatch" style="background:{s.color}"></span><span>{s.label}</span></div>
										<div class="comp-legend-bottom"><span class="comp-legend-pct">{s.pct.toFixed(1)}%</span><span class="comp-legend-val privacy-value">{fmtMoney(s.val)}</span></div>
									</div>
								{/each}
							</div>
						{:else if encargosSummary}
							<p class="encargos-range">{encargosRangeLabel}</p>
							<div class="grid-cards" style="margin-bottom:4px">
								<div class="stat-card kpi-blue">
									<p class="stat-label">Total Pago</p>
									<p class="font-display stat-value privacy-value">{fmtMoney(encargosSummary.totalPago)}</p>
								</div>
								<div class="stat-card kpi-rose">
									<p class="stat-label">Total de Encargos</p>
									<p class="font-display stat-value privacy-value">{fmtMoney(encargosSummary.totalEncargos)}</p>
								</div>
								<div class="stat-card kpi-green">
									<p class="stat-label">Total de Abatimentos</p>
									<p class="font-display stat-value privacy-value">{fmtMoney(encargosSummary.totalAbatimento)}</p>
								</div>
							</div>
							<p class="stat-label" style="margin:0">Composição dos Valores pagos</p>
							<div class="comp-legend">
								{#each encargosLegend as s (s.key)}
									<div class="comp-legend-item">
										<div class="comp-legend-top"><span class="comp-legend-swatch" style="background:{s.color}"></span><span>{s.label}</span></div>
										<div class="comp-legend-bottom"><span class="comp-legend-pct">{s.pct.toFixed(1)}%</span><span class="comp-legend-val privacy-value">{fmtMoney(s.val)}</span></div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<div class="card" style="margin-top:16px">
					<div class="page-head" style="margin-bottom:14px">
						<p class="stat-label" style="margin:0">Prestações do financiamento</p>
						<button class="btn sm" class:installments-add-btn--desktop={installmentYears.length > 0} onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Nova prestação</button>
					</div>
					{#if installmentYears.length}
						<div class="filters-bar" style="margin-bottom:14px">
							<select onchange={(e) => (installmentYear = Number(e.currentTarget.value))}>
								{#each installmentYears as y (y)}
									<option value={y} selected={installmentYear === y}>{y}</option>
								{/each}
							</select>
							{#if installmentYears.length >= 5}<span class="field-hint" style="align-self:center">mostrando os 5 anos mais recentes</span>{/if}
							<button class="btn sm installments-add-btn--mobile" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Nova prestação</button>
						</div>
						<div class="table-wrap installments-table-wrap">
							<table class="list">
								<thead>
									<tr><th>Mês</th><th class="num">Saldo devedor</th><th class="num">Abatimento</th></tr>
								</thead>
								<tbody>
									{#each orderedYearInstallments as it (it.id)}
										<tr>
											<td data-label="Mês">{MONTH_ABBR[new Date(it.date + 'T12:00:00').getMonth()]}</td>
											<td class="num privacy-value" data-label="Saldo devedor">{fmtMoney(it.saldoDevedor)}</td>
											<td class="num privacy-value" data-label="Abatimento" class:money-in={it.delta > 0} class:money-out={it.delta < 0}>{it.delta > 0 ? '+' : it.delta < 0 ? '-' : ''}{fmtMoney(Math.abs(it.delta))}</td>
										</tr>
									{:else}
										<tr><td colspan="3" class="empty">Sem prestações neste ano.</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="empty">Nenhuma prestação registrada ainda.</p>
					{/if}
				</div>

				<div class="card" style="margin-top:16px">
					<div class="page-head" style="margin-bottom:14px">
						<p class="stat-label" style="margin:0">Últimas Prestações</p>
						<div class="inst-find">
							<input type="month" value={instFindMonth} onchange={(e) => (instFindMonth = e.currentTarget.value)} title="Buscar prestação por mês/ano" />
							{#if instFindMonth}
								<button type="button" class="inst-find-clear" title="Limpar busca" onclick={() => (instFindMonth = '')}><X size={14} /></button>
							{/if}
						</div>
					</div>
					{#if !metrics.installments.length}
						<p class="empty">Nenhuma prestação registrada ainda.</p>
					{:else}
						{@const sortedInsts = [...metrics.installmentRows].sort((a, b) => b.number - a.number)}
						{@const ip = pageInfo(sortedInsts, instPage[selectedGoal.id] || 0, 3)}
						{@const listInsts = instFindMonth ? sortedInsts.filter((it) => (it.date || '').slice(0, 7) === instFindMonth) : ip.items}
						{#if !listInsts.length}
							<p class="empty">Nenhuma prestação encontrada para esse mês/ano.</p>
						{:else}
							{#each listInsts as it (it.id)}
								<div
									class="inst-card"
									class:is-ref={compositionRef && it.id === compositionRef.id}
									role="button"
									tabindex="0"
									onclick={() => (installmentDetail = { open: true, installment: it })}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											installmentDetail = { open: true, installment: it };
										}
									}}
								>
									<div class="inst-row">
										<span class="inst-num">Nº {it.number}</span>
										<span class="inst-date">{fmtDate(it.date)}</span>
										<span class="font-display inst-val privacy-value">{fmtMoney(it.valorPrestacao)}</span>
									</div>
								</div>
							{/each}
						{/if}
						{#if !instFindMonth && sortedInsts.length > 3}
							<div class="list-nav">
								<button type="button" class="list-nav-btn" disabled={ip.page <= 0} onclick={() => (instPage = { ...instPage, [selectedGoal.id]: ip.page - 1 })}>‹ Anterior</button>
								<span class="list-nav-range">{ip.page * 3 + 1}–{Math.min((ip.page + 1) * 3, sortedInsts.length)} de {sortedInsts.length}</span>
								<button type="button" class="list-nav-btn" disabled={ip.page >= ip.totalPages - 1} onclick={() => (instPage = { ...instPage, [selectedGoal.id]: ip.page + 1 })}>Próxima ›</button>
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		{:else}
			<p class="empty">Crie um objetivo para começar.</p>
		{/if}
	</section>
</div>

<GoalFormModal open={goalModal.open} editing={goalModal.editing} onClose={() => (goalModal = { ...goalModal, open: false })} onSaved={(g) => (selectedGoalId = g.id)} />
<ResourceFormModal open={resourceModal.open} goalId={resourceModal.goalId} editing={resourceModal.editing} onClose={() => (resourceModal = { ...resourceModal, open: false })} />
<MoveFormModal open={moveModal.open} resourceId={moveModal.resourceId} goalId={moveModal.goalId} editing={moveModal.editing} onClose={() => (moveModal = { ...moveModal, open: false })} />
<InstallmentFormModal open={installmentModal.open} goalId={installmentModal.goalId} editing={installmentModal.editing} onClose={() => (installmentModal = { ...installmentModal, open: false })} />
<AmortizationFormModal open={amortModal.open} goalId={amortModal.goalId} editing={amortModal.editing} onClose={() => (amortModal = { ...amortModal, open: false })} />

<RowActionsModal
	open={rowActions.open}
	onClose={() => (rowActions = { ...rowActions, open: false })}
	title={rowActions.title}
	subtitle={rowActions.subtitle}
	actions={rowActions.actions}
/>

<Modal
	open={installmentDetail.open}
	onClose={() => (installmentDetail = { ...installmentDetail, open: false })}
	title={installmentDetail.installment ? `Prestação nº ${installmentDetail.installment.number}` : ''}
	subtitle={installmentDetail.installment ? `${fmtDate(installmentDetail.installment.date)} · ${fmtMoney(installmentDetail.installment.valorPrestacao)}` : ''}
	maxWidth="440px"
>
	{#if installmentDetail.installment}
		{@const it = installmentDetail.installment}
		<div class="inst-grid">
			<span class="k">Amortização</span><span class="v privacy-value">{fmtMoney(it.amortizacao)}</span>
			<span class="k">Juros</span><span class="v privacy-value">{fmtMoney(it.juros)}</span>
			<span class="k">Seguros</span><span class="v privacy-value">{fmtMoney(it.seguros)}</span>
			<span class="k">Taxas</span><span class="v privacy-value">{fmtMoney(it.taxas)}</span>
			<span class="k">Encargo líquido</span><span class="v privacy-value">{fmtMoney(it.encargoLiquido)}</span>
			<span class="k">Valor devido</span><span class="v privacy-value">{fmtMoney(it.valorDevido)}</span>
			<span class="k">Valor da diferença</span><span class="v privacy-value">{fmtMoney(it.valorDiferenca)}</span>
			<span class="k">Correção monetária</span><span class="v privacy-value">{fmtMoney(it.correcaoMonetaria)}</span>
			<div class="full" style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center">
				<span class="k" style="font-weight:700">Saldo devedor</span><span class="v privacy-value" style="font-size:13.5px">{fmtMoney(it.saldoDevedor)}</span>
			</div>
		</div>
	{/if}
	{#snippet footer()}
		{#if installmentDetail.installment}
			{@const it = installmentDetail.installment}
			<button
				type="button"
				class="btn sm"
				class:btn-primary={compositionRef && it.id === compositionRef.id}
				onclick={() => {
					installmentDetail = { ...installmentDetail, open: false };
					viewComposition(it.id);
				}}
			>
				<Eye size={14} /> Ver composição
			</button>
			<button
				type="button"
				class="btn btn-primary sm"
				onclick={() => {
					installmentDetail = { ...installmentDetail, open: false };
					installmentModal = { open: true, goalId: selectedGoal.id, editing: it };
				}}
			>
				<Pencil size={14} /> Editar
			</button>
			<button
				type="button"
				class="btn btn-danger sm"
				onclick={() => {
					installmentDetail = { ...installmentDetail, open: false };
					deleting = { kind: 'installment', id: it.id, label: `prestação nº ${it.number}`, warn: '' };
				}}
			>
				<Trash2 size={14} /> Excluir
			</button>
		{/if}
	{/snippet}
</Modal>

<ConfirmDialog
	open={deleting !== null}
	title={`Excluir ${deleting?.label || ''}?`}
	message={deleting?.warn || 'Esta ação não pode ser desfeita.'}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={confirmDelete}
/>

<style>
	/* Prestações do Financiamento — tabela "Mês / Saldo devedor / Abatimento":
	   mesma apresentação (caixa arredondada com borda, cabeçalho com fundo
	   sombreado, sem forçar a tabela a ficar larga) do app nextgoals.
	   Não mexe em fonte — só em fundo, borda e largura, com as próprias
	   variáveis de cor do Plena. Escopado a esta tabela (.installments-table-wrap)
	   para não alterar as outras tabelas ("list") do app. */
	.installments-table-wrap :global(table.list) {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}
	.installments-table-wrap :global(table.list th) {
		background: var(--surface-2);
	}
	@media (max-width: 760px) {
		.installments-table-wrap :global(table.list) {
			display: table;
		}
		.installments-table-wrap :global(table.list thead) {
			display: table-header-group;
		}
		.installments-table-wrap :global(table.list tbody) {
			display: table-row-group;
		}
		.installments-table-wrap :global(table.list tr) {
			display: table-row;
			margin: 0;
			padding: 0;
			border: none;
			background: none;
			border-radius: 0;
		}
		.installments-table-wrap :global(table.list td) {
			display: table-cell;
			text-align: right;
			padding: 9px 12px;
			border-bottom: 1px solid var(--border-soft);
		}
		.installments-table-wrap :global(table.list td:first-child) {
			text-align: left;
		}
		.installments-table-wrap :global(table.list td::before) {
			content: none;
		}
	}

	/* No mobile, "Nova prestação" fica ao lado do seletor de ano (ano
	   primeiro à esquerda, botão por último à direita) em vez de empilhado
	   abaixo do título. No desktop continua junto do título, como antes. */
	.installments-add-btn--mobile {
		display: none;
	}
	@media (max-width: 760px) {
		.installments-add-btn--desktop {
			display: none;
		}
		.installments-add-btn--mobile {
			display: inline-flex;
			margin-left: auto;
		}
	}
</style>
