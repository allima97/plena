<script>
	import { appState, addPurchaseInstallment, updatePurchaseInstallment, removePurchaseInstallment, restorePurchaseInstallment } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate, todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import PurchaseInstallmentModal from '$lib/components/PurchaseInstallmentModal.svelte';
	import { Plus, Trash2, Pencil, Calendar, CreditCard, CheckCircle2, Circle } from 'lucide-svelte';

	let modal = $state({ open: false, editing: null });
	let deleting = $state(null);

	const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

	// Calcula as datas das parcelas a partir da primeira parcela
	function generateInstallmentDates(firstDate, count) {
		const dates = [];
		const [year, month, day] = firstDate.split('-').map(Number);
		for (let i = 0; i < count; i++) {
			const date = new Date(year, month - 1 + i, day);
			const pad = (n) => String(n).padStart(2, '0');
			dates.push(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
		}
		return dates;
	}

	// Agrupa parcelas por mês
	function groupByMonth(installments) {
		const groups = {};
		installments.forEach((inst) => {
			const dates = generateInstallmentDates(inst.firstDate, inst.installmentCount);
			dates.forEach((date, idx) => {
				if (inst.paidUpTo && idx <= inst.paidUpTo - 1) return; // já quitada
				const monthKey = date.substring(0, 7); // YYYY-MM
				if (!groups[monthKey]) groups[monthKey] = [];
				const installmentValue = inst.totalValue / inst.installmentCount;
				groups[monthKey].push({
					...inst,
					installmentNumber: idx + 1,
					installmentDate: date,
					installmentValue
				});
			});
		});
		return groups;
	}

	const monthlyGroups = $derived.by(() => {
		return groupByMonth(appState.purchaseInstallments);
	});

	const sortedMonths = $derived.by(() => {
		return Object.keys(monthlyGroups).sort();
	});

	function formatMonthLabel(monthKey) {
		const [year, month] = monthKey.split('-').map(Number);
		return `${MONTH_ABBR[month - 1]}/${year}`;
	}

	function openNew() {
		modal = { open: true, editing: null };
	}

	function openEdit(inst) {
		modal = { open: true, editing: inst };
	}

	function handleDelete(inst) {
		const snapshot = { ...inst };
		removePurchaseInstallment(inst.id);
		showToast({
			message: `Parcelamento "${inst.description || 'sem descrição'}" excluído.`,
			actionLabel: 'DESFAZER',
			onAction: () => restorePurchaseInstallment(snapshot)
		});
	}

	function togglePaid(inst) {
		const newPaidUpTo = inst.paidUpTo ? null : inst.installmentCount;
		updatePurchaseInstallment(inst.id, { paidUpTo: newPaidUpTo });
	}

	function handleSaved() {
		modal = { ...modal, open: false };
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Parcelamentos</h1>
		<p class="page-sub">Controle de compras parceladas (sem impacto no movimento financeiro)</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo parcelamento</button>
</div>

{#if appState.purchaseInstallments.length === 0}
	<div class="empty-state">
		<CreditCard size={48} style="opacity:0.3;margin-bottom:16px" />
		<p>Nenhum parcelamento cadastrado.</p>
		<p class="empty-sub">Use o botão acima para adicionar suas compras parceladas.</p>
	</div>
{:else}
	<!-- Lista de todos os parcelamentos -->
	<section class="card" style="margin-bottom:24px">
		<h3 style="margin:0 0 16px 0;font-size:16px">Todos os parcelamentos</h3>
		<div class="installments-list">
			{#each appState.purchaseInstallments as inst (inst.id)}
				<div class="installment-item">
					<div class="installment-main">
						<div class="installment-header">
							<span class="installment-desc">{inst.description || 'Sem descrição'}</span>
							<span class="badge">{inst.installmentCount}x</span>
						</div>
						<p class="installment-meta">
							{inst.paymentMethod}
						</p>
						<div class="installment-values">
							<span class="privacy-value">{fmtMoney(inst.totalValue)}</span>
							<span class="installment-unit">({fmtMoney(inst.totalValue / inst.installmentCount)}/mês)</span>
						</div>
						<p class="installment-dates">
							<Calendar size={12} style="vertical-align:-1px;margin-right:4px" />
							{fmtDate(inst.firstDate)} – {fmtDate(generateInstallmentDates(inst.firstDate, inst.installmentCount)[inst.installmentCount - 1])}
						</p>
						{#if inst.paidUpTo}
							<span class="badge badge-green"><CheckCircle2 size={11} style="vertical-align:-1px;margin-right:3px" />Quitado</span>
						{/if}
					</div>
					<div class="installment-actions">
						<button class="btn btn-ghost sm" onclick={() => togglePaid(inst)} title={inst.paidUpTo ? 'Marcar como não quitado' : 'Marcar como quitado'}>
							{#if inst.paidUpTo}<Circle size={14} />{:else}<CheckCircle2 size={14} />{/if}
						</button>
						<button class="btn btn-ghost sm" onclick={() => openEdit(inst)} title="Editar"><Pencil size={14} /></button>
						<button class="btn btn-danger sm" onclick={() => handleDelete(inst)} title="Excluir"><Trash2 size={14} /></button>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<!-- Resumo mês a mês -->
	<section class="card">
		<h3 style="margin:0 0 16px 0;font-size:16px">Compromissos por mês</h3>
		{#if sortedMonths.length === 0}
			<p class="empty">Nenhuma parcela pendente.</p>
		{:else}
			<div class="monthly-summary">
				{#each sortedMonths as month (month)}
					{@const items = monthlyGroups[month]}
					{@const total = items.reduce((sum, item) => sum + item.installmentValue, 0)}
					<div class="month-row">
						<div class="month-label">{formatMonthLabel(month)}</div>
						<div class="month-value privacy-value">{fmtMoney(total)}</div>
						<div class="month-count">{items.length} parcela{items.length > 1 ? 's' : ''}</div>
					</div>
					<div class="month-details">
						{#each items as item (item.id + '-' + item.installmentNumber)}
							<div class="month-detail-item">
								<span class="detail-meta">{item.installmentNumber}/{item.installmentCount} · {item.paymentMethod}</span>
								<span class="detail-desc">{item.description || 'Sem descrição'}</span>
								<span class="detail-value privacy-value">{fmtMoney(item.installmentValue)}</span>
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}

<PurchaseInstallmentModal open={modal.open} editing={modal.editing} onClose={() => (modal = { ...modal, open: false })} onSaved={handleSaved} />

<style>
	.installments-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.installment-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--card-bg);
	}

	.installment-main {
		flex: 1;
		min-width: 0;
	}

	.installment-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
	}

	.installment-desc {
		font-weight: 500;
	}

	.installment-meta {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0 0 4px 0;
	}

	.installment-values {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 4px;
	}

	.installment-unit {
		font-size: 13px;
		color: var(--text-muted);
	}

	.installment-dates {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
		display: flex;
		align-items: center;
	}

	.installment-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.monthly-summary {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.month-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 8px 12px;
		background: var(--bg-muted);
		border-radius: 6px;
	}

	.month-label {
		font-weight: 500;
	}

	.month-value {
		font-weight: 600;
		text-align: right;
	}

	.month-count {
		font-size: 13px;
		color: var(--text-muted);
	}

	.month-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-left: 12px;
		border-left: 2px solid var(--border);
	}

	.month-detail-item {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 8px;
		align-items: center;
		font-size: 13px;
	}

	.detail-meta {
		color: var(--text-muted);
		white-space: nowrap;
	}

	.detail-desc {
		font-weight: 500;
	}

	.detail-value {
		font-weight: 600;
	}

	.empty-state {
		text-align: center;
		padding: 48px 24px;
		color: var(--text-muted);
	}

	.empty-sub {
		font-size: 14px;
		margin-top: 8px;
	}
</style>
