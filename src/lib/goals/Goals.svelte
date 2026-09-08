<script>
	import {
		appState,
		removeGoal,
		updateGoal,
		removeResource,
		removeResourceMove,
		removeInstallment,
		removeAmortization
	} from '$lib/fin/store.svelte.js';
	import { computeMetrics, progressColor, encargosAbatimentoSummary, installmentYearsOf } from './metrics.js';
	import { GOAL_TYPES } from './constants.js';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GoalFormModal from './GoalFormModal.svelte';
	import ResourceFormModal from './ResourceFormModal.svelte';
	import MoveFormModal from './MoveFormModal.svelte';
	import InstallmentFormModal from './InstallmentFormModal.svelte';
	import AmortizationFormModal from './AmortizationFormModal.svelte';
	import { Plus, Archive, ArchiveRestore, Pencil, Trash2, ChevronDown, ChevronUp, Wallet, Eye, X, Minus } from 'lucide-svelte';

	const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

	let selectedGoalId = $state(null);
	let showArchived = $state(false);
	let expandedResource = $state({});
	let movesPage = $state({}); // resourceId -> pagina atual

	let expandedAmortCard = $state({}); // goalId -> expandido? (padrao: fechado)
	let amortPage = $state({}); // goalId -> pagina atual

	let expandedInstallment = $state({}); // installmentId -> expandido? (padrao: fechado)
	let instPage = $state({}); // goalId -> pagina atual
	let instFindMonth = $state(''); // "YYYY-MM" digitado na busca de Ultimas Prestacoes

	let installmentYear = $state(null); // ano escolhido em "Prestacoes do financiamento"
	let encargosPeriod = $state('currentYear'); // 'currentYear' | 'last12' | 'all' | 'year' | 'installment'
	let encargosYear = $state(null); // ano escolhido no seletor "Em <ano>" de Encargos e Abatimentos
	let compositionInstallmentId = $state(null); // prestacao escolhida (icone de olho / seletor / Anterior-Proxima)

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
		if (kind === 'goal') removeGoal(id);
		else if (kind === 'resource') removeResource(id);
		else if (kind === 'move') removeResourceMove(id);
		else if (kind === 'installment') removeInstallment(id);
		else if (kind === 'amortization') removeAmortization(id);
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
	<aside class="goals-list">
		{#each activeGoals as g (g.id)}
			{@const m = computeMetrics(g, { resources: appState.resources, resourceMoves: appState.resourceMoves, goalCategories: appState.goalCategories, installments: appState.installments, amortizations: appState.amortizations })}
			<button class="goal-list-item" class:active={g.id === selectedGoalId} onclick={() => (selectedGoalId = g.id)}>
				<div class="goal-list-top">
					<span class="goal-list-name">{g.name}</span>
					<span class="badge" class:badge-green={m.statusTone === 'good'} class:badge-red={m.statusTone === 'danger'} class:badge-orange={m.statusTone === 'warn'} class:badge-gray={m.statusTone === 'neutral'}>
						{m.statusLabel}
					</span>
				</div>
				<p class="goal-list-type">{GOAL_TYPES[g.type]?.label || 'Outro objetivo'}</p>
				<div class="goal-progress-track" style="margin-top:8px">
					<div class="goal-progress-fill" style="width:{m.percent * 100}%;background:{progressColor(m.percent)}"></div>
				</div>
				<p class="goal-list-values"><span class="privacy-value">{fmtMoney(m.totalAccumulated)}</span> de <span class="privacy-value">{fmtMoney(m.effectiveTarget)}</span></p>
			</button>
		{:else}
			<p class="empty">Nenhum objetivo ainda.</p>
		{/each}

		{#if archivedGoals.length}
			<button class="btn btn-ghost sm" style="margin-top:6px" onclick={() => (showArchived = !showArchived)}>
				{showArchived ? 'Ocultar' : 'Mostrar'} arquivados ({archivedGoals.length})
			</button>
			{#if showArchived}
				{#each archivedGoals as g (g.id)}
					<button class="goal-list-item archived" class:active={g.id === selectedGoalId} onclick={() => (selectedGoalId = g.id)}>
						<span class="goal-list-name">{g.name}</span>
					</button>
				{/each}
			{/if}
		{/if}
	</aside>

	<section class="goal-detail">
		{#if selectedGoal && metrics}
			<div class="card">
				<div class="goal-detail-head">
					<div>
						<p class="stat-label">{GOAL_TYPES[selectedGoal.type]?.label || 'Outro objetivo'}</p>
						<h2 class="font-display" style="margin:4px 0 0;font-size:22px">{selectedGoal.name}</h2>
						{#if selectedGoal.notes}<p class="movement-meta" style="margin-top:6px">{selectedGoal.notes}</p>{/if}
					</div>
					<div class="actions-row">
						<button class="btn btn-ghost sm" onclick={() => (goalModal = { open: true, editing: selectedGoal })}><Pencil size={14} /> Editar</button>
						<button class="btn btn-ghost sm" onclick={() => updateGoal(selectedGoal.id, { archived: !selectedGoal.archived })}>
							{#if selectedGoal.archived}<ArchiveRestore size={14} /> Reativar{:else}<Archive size={14} /> Arquivar{/if}
						</button>
						<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'goal', id: selectedGoal.id, label: `"${selectedGoal.name}"`, warn: 'Todos os recursos, movimentações e prestações desse objetivo serão apagados.' })}>
							<Trash2 size={14} /> Excluir
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
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.effectiveTarget)}</p>
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
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.totalAccumulated)}</p>
					</div>
					<div class="stat-card" class:kpi-green={metrics.remaining <= 0} class:kpi-rose={metrics.remaining > 0}>
						<p class="stat-label">Falta arrecadar</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.remaining)}</p>
					</div>
					<div class="stat-card kpi-blue">
						<p class="stat-label">Recomendado/mês</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.recommendedMonthly)}</p>
						<p class="stat-sub">{metrics.monthsLeft != null ? `${metrics.monthsLeft} meses restantes` : 'sem prazo definido'}</p>
					</div>
				</div>

				<div class="goal-pace-row">
					<div class="stat-card kpi-gold">
						<p class="stat-label">Média Geral</p>
						<p class="font-display stat-value privacy-value">{metrics.generalAveragePace > 0 ? fmtMoney(metrics.generalAveragePace) : '—'}</p>
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
				<div class="page-head" style="margin-bottom:14px">
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
							<span class="font-display resource-balance privacy-value">{fmtMoney(resourceBalanceOf(r.id))}</span>
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
									<div class="movement-row" style="padding:10px 0">
										<div class="movement-info">
											<p class="movement-desc">{mv.description}</p>
											<p class="movement-meta">{fmtDate(mv.date)}</p>
										</div>
										<div class="movement-amount">
											<p class="font-display privacy-value" class:money-in={mv.amount >= 0} class:money-out={mv.amount < 0}>{fmtMoney(mv.amount)}</p>
										</div>
										<div class="movement-actions">
											<button class="btn btn-ghost sm" onclick={() => (moveModal = { open: true, resourceId: r.id, goalId: selectedGoal.id, editing: mv })}>Editar</button>
											<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'move', id: mv.id, label: `"${mv.description}"`, warn: '' })}>Excluir</button>
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
										<div class="movement-row" style="padding:10px 0">
											<div class="movement-info">
												<p class="movement-desc">{a.tipo}</p>
												<p class="movement-meta">{fmtDate(a.date)}</p>
											</div>
											<div class="movement-amount"><p class="font-display money-out privacy-value">-{fmtMoney(a.amount)}</p></div>
											<div class="movement-actions">
												<button class="btn btn-ghost sm" onclick={() => (amortModal = { open: true, goalId: selectedGoal.id, editing: a })}>Editar</button>
												<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'amortization', id: a.id, label: 'esta amortização', warn: '' })}>Excluir</button>
											</div>
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
						<button class="btn sm" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Nova prestação</button>
					</div>
					{#if installmentYears.length}
						<div class="filters-bar" style="margin-bottom:14px">
							<select onchange={(e) => (installmentYear = Number(e.currentTarget.value))}>
								{#each installmentYears as y (y)}
									<option value={y} selected={installmentYear === y}>{y}</option>
								{/each}
							</select>
							{#if installmentYears.length >= 5}<span class="field-hint" style="align-self:center">mostrando os 5 anos mais recentes</span>{/if}
						</div>
						<div class="table-wrap">
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
								<div class="inst-card" class:is-ref={compositionRef && it.id === compositionRef.id}>
									<div class="inst-row" role="button" tabindex="0" onclick={() => (expandedInstallment = { ...expandedInstallment, [it.id]: !expandedInstallment[it.id] })} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); expandedInstallment = { ...expandedInstallment, [it.id]: !expandedInstallment[it.id] }; } }}>
										<span style="color:var(--ink-faint);display:flex;transform:rotate({expandedInstallment[it.id] ? 90 : 0}deg)"><ChevronDown size={15} /></span>
										<span class="inst-num">Nº {it.number}</span>
										<span class="inst-date">{fmtDate(it.date)}</span>
										<span class="font-display inst-val privacy-value">{fmtMoney(it.valorPrestacao)}</span>
										<span class="inst-actions">
											<button class="btn btn-ghost sm" title="Ver composição em Encargos e Abatimentos" onclick={(e) => { e.stopPropagation(); viewComposition(it.id); }}><Eye size={14} /></button>
											<button class="btn btn-ghost sm" title="Editar" onclick={(e) => { e.stopPropagation(); installmentModal = { open: true, goalId: selectedGoal.id, editing: it }; }}><Pencil size={14} /></button>
											<button class="btn btn-danger sm" title="Remover" onclick={(e) => { e.stopPropagation(); deleting = { kind: 'installment', id: it.id, label: `prestação nº ${it.number}`, warn: '' }; }}><Trash2 size={14} /></button>
										</span>
									</div>
									{#if expandedInstallment[it.id]}
										<div class="inst-body">
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
											<div class="inst-body-actions">
												<button type="button" class="btn sm" class:btn-primary={compositionRef && it.id === compositionRef.id} onclick={() => viewComposition(it.id)}><Eye size={14} /> Ver</button>
												<button type="button" class="btn btn-primary sm" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: it })}><Pencil size={14} /> Editar</button>
												<button type="button" class="btn btn-danger sm" onclick={() => (deleting = { kind: 'installment', id: it.id, label: `prestação nº ${it.number}`, warn: '' })}><Trash2 size={14} /> Excluir</button>
											</div>
										</div>
									{/if}
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

<ConfirmDialog
	open={deleting !== null}
	title={`Excluir ${deleting?.label || ''}?`}
	message={deleting?.warn || 'Esta ação não pode ser desfeita.'}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={confirmDelete}
/>
