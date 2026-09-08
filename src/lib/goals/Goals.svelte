<script>
	import { appState, removeGoal, updateGoal, removeResource, removeResourceMove, removeInstallment, removeAmortization } from '$lib/fin/store.svelte.js';
	import { computeMetrics, progressColor } from './metrics.js';
	import { GOAL_TYPES } from './constants.js';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import GoalFormModal from './GoalFormModal.svelte';
	import ResourceFormModal from './ResourceFormModal.svelte';
	import MoveFormModal from './MoveFormModal.svelte';
	import InstallmentFormModal from './InstallmentFormModal.svelte';
	import AmortizationFormModal from './AmortizationFormModal.svelte';
	import { Plus, Archive, ArchiveRestore, Pencil, Trash2, ChevronDown, ChevronUp, Wallet } from 'lucide-svelte';

	let selectedGoalId = $state(null);
	let showArchived = $state(false);
	let expandedResource = $state({});

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

	// modais
	let goalModal = $state({ open: false, editing: null });
	let resourceModal = $state({ open: false, goalId: null, editing: null });
	let moveModal = $state({ open: false, resourceId: null, goalId: null, editing: null });
	let installmentModal = $state({ open: false, goalId: null, editing: null });
	let amortModal = $state({ open: false, goalId: null, editing: null });
	let deleting = $state(null); // { kind, id, label, warn }

	function movesOf(resourceId) {
		return appState.resourceMoves.filter((m) => m.resourceId === resourceId).sort((a, b) => (a.date < b.date ? 1 : -1));
	}
	function resourceBalanceOf(resourceId) {
		return movesOf(resourceId).reduce((s, m) => s + (m.amount || 0), 0);
	}

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
					<div class="stat-card">
						<p class="stat-label">Acumulado</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.totalAccumulated)}</p>
						<p class="stat-sub">de <span class="privacy-value">{fmtMoney(metrics.effectiveTarget)}</span></p>
					</div>
					<div class="stat-card">
						<p class="stat-label">Ritmo médio mensal</p>
						<p class="font-display stat-value privacy-value">{fmtMoney(metrics.generalAveragePace)}</p>
						{#if metrics.recommendedMonthly && metrics.monthsLeft}<p class="stat-sub">recomendado: <span class="privacy-value">{fmtMoney(metrics.recommendedMonthly)}</span>/mês</p>{/if}
					</div>
					<div class="stat-card">
						<p class="stat-label">Previsão de conclusão</p>
						<p class="font-display stat-value" style="font-size:18px">
							{metrics.status === 'concluido' ? (metrics.achievedDate ? fmtDate(metrics.achievedDate) : 'Concluído') : metrics.projectedDate ? metrics.projectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—'}
						</p>
						{#if selectedGoal.targetDate}<p class="stat-sub">meta: {fmtDate(selectedGoal.targetDate)}</p>{/if}
					</div>
				</div>
			</div>

			<div class="card" style="margin-top:16px">
				<div class="page-head" style="margin-bottom:14px">
					<p class="stat-label" style="margin:0">Recursos</p>
					<button class="btn sm" onclick={() => (resourceModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Novo recurso</button>
				</div>
				{#each metrics.resources as r (r.id)}
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
								{#each movesOf(r.id) as mv (mv.id)}
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
							</div>
						{/if}
					</div>
				{:else}
					<p class="empty">Nenhum recurso ainda — crie um para começar a registrar aportes.</p>
				{/each}
			</div>

			{#if selectedGoal.type === 'financiamento'}
				<div class="card" style="margin-top:16px">
					<div class="page-head" style="margin-bottom:14px">
						<p class="stat-label" style="margin:0">Prestações</p>
						<button class="btn sm" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Registrar prestação</button>
					</div>
					{#if metrics.installmentRows.length}
						<div class="table-wrap">
							<table class="list">
								<thead>
									<tr>
										<th>Nº</th><th>Data</th><th class="num">Valor</th><th class="num">Amortização</th><th class="num">Juros</th><th class="num">Saldo devedor</th><th class="num">Abatimento</th><th class="actions-cell"></th>
									</tr>
								</thead>
								<tbody>
									{#each [...metrics.installmentRows].reverse() as it (it.id)}
										<tr>
											<td data-label="Nº">{it.number}</td>
											<td data-label="Data">{fmtDate(it.date)}</td>
											<td class="num privacy-value" data-label="Valor">{fmtMoney(it.valorPrestacao)}</td>
											<td class="num privacy-value" data-label="Amortização">{fmtMoney(it.amortizacao)}</td>
											<td class="num privacy-value" data-label="Juros">{fmtMoney(it.juros)}</td>
											<td class="num privacy-value" data-label="Saldo devedor">{fmtMoney(it.saldoDevedor)}</td>
											<td class="num privacy-value" data-label="Abatimento" class:money-in={it.delta > 0} class:money-out={it.delta < 0}>{fmtMoney(it.delta)}</td>
											<td class="actions-cell">
												<div class="actions-row" style="justify-content:flex-end">
													<button class="btn btn-ghost sm" onclick={() => (installmentModal = { open: true, goalId: selectedGoal.id, editing: it })}>Editar</button>
													<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'installment', id: it.id, label: `prestação nº ${it.number}`, warn: '' })}>Excluir</button>
												</div>
											</td>
										</tr>
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
						<p class="stat-label" style="margin:0">Amortizações extras</p>
						<button class="btn sm" onclick={() => (amortModal = { open: true, goalId: selectedGoal.id, editing: null })}><Plus size={14} /> Nova amortização</button>
					</div>
					{#each metrics.amortizations as a (a.id)}
						<div class="movement-row">
							<div class="movement-info">
								<p class="movement-desc">{a.tipo}</p>
								<p class="movement-meta">{fmtDate(a.date)}</p>
							</div>
							<div class="movement-amount"><p class="font-display privacy-value">{fmtMoney(a.amount)}</p></div>
							<div class="movement-actions">
								<button class="btn btn-ghost sm" onclick={() => (amortModal = { open: true, goalId: selectedGoal.id, editing: a })}>Editar</button>
								<button class="btn btn-danger sm" onclick={() => (deleting = { kind: 'amortization', id: a.id, label: 'esta amortização', warn: '' })}>Excluir</button>
							</div>
						</div>
					{:else}
						<p class="empty">Nenhuma amortização extra registrada.</p>
					{/each}
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
