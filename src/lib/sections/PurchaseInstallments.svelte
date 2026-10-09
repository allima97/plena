<script>
	import { appState, addPurchaseInstallment, updatePurchaseInstallment, removePurchaseInstallment, restorePurchaseInstallment } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate, todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import PurchaseInstallmentModal from '$lib/components/PurchaseInstallmentModal.svelte';
	import InstallmentPaymentModal from '$lib/components/InstallmentPaymentModal.svelte';
	import { Plus, Trash2, Pencil, Calendar, CreditCard, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-svelte';

	let modal = $state({ open: false, editing: null });
	let paymentModal = $state({ open: false, installment: null, installmentNumber: null });
	let deleting = $state(null);
	let expanded = $state({}); // installmentId -> expanded?

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

	// Agrupa parcelas por mês (apenas pendentes)
	function groupByMonth(installments) {
		const groups = {};
		installments.forEach((inst) => {
			const dates = generateInstallmentDates(inst.firstDate, inst.installmentCount);
			dates.forEach((date, idx) => {
				const payment = inst.payments?.find((p) => p.installmentNumber === idx + 1);
				if (payment) return; // já paga
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

	function toggleExpand(instId) {
		expanded[instId] = !expanded[instId];
	}

	function openPaymentModal(inst, installmentNumber) {
		paymentModal = { open: true, installment: inst, installmentNumber };
	}

	function markAsPaid(inst, installmentNumber, paymentDate, paymentMethod) {
		const payments = inst.payments || [];
		const existingIndex = payments.findIndex((p) => p.installmentNumber === installmentNumber);
		const payment = { installmentNumber, paymentDate, paymentMethod };

		let newPayments;
		if (existingIndex >= 0) {
			newPayments = payments.map((p, i) => (i === existingIndex ? payment : p));
		} else {
			newPayments = [...payments, payment];
		}

		updatePurchaseInstallment(inst.id, { payments: newPayments });
		paymentModal = { ...paymentModal, open: false };
		showToast({ message: `Parcela ${installmentNumber}/${inst.installmentCount} marcada como paga.` });
	}

	function unmarkAsPaid(inst, installmentNumber) {
		const payments = (inst.payments || []).filter((p) => p.installmentNumber !== installmentNumber);
		updatePurchaseInstallment(inst.id, { payments });
		showToast({ message: `Parcela ${installmentNumber}/${inst.installmentCount} desmarcada.` });
	}

	function handleSaved() {
		modal = { ...modal, open: false };
	}

	// Calcula estatísticas
	const stats = $derived.by(() => {
		let total = 0;
		let paid = 0;
		let pending = 0;
		appState.purchaseInstallments.forEach((inst) => {
			const count = inst.installmentCount;
			const paidCount = (inst.payments || []).length;
			total += count;
			paid += paidCount;
			pending += count - paidCount;
		});
		return { total, paid, pending };
	});
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Parcelamentos</h1>
		<p class="page-sub">Controle de compras parceladas (sem impacto no movimento financeiro)</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo parcelamento</button>
</div>

<!-- Resumo geral -->
{#if appState.purchaseInstallments.length > 0}
	<div class="stats-row">
		<div class="stat-card">
			<p class="stat-label">Total de parcelas</p>
			<p class="font-display stat-value">{stats.total}</p>
		</div>
		<div class="stat-card kpi-green">
			<p class="stat-label">Pagas</p>
			<p class="font-display stat-value">{stats.paid}</p>
		</div>
		<div class="stat-card kpi-amber">
			<p class="stat-label">Pendentes</p>
			<p class="font-display stat-value">{stats.pending}</p>
		</div>
	</div>
{/if}

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
				{@const dates = generateInstallmentDates(inst.firstDate, inst.installmentCount)}
				{@const isExpanded = expanded[inst.id]}
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
							{fmtDate(inst.firstDate)} – {fmtDate(dates[inst.installmentCount - 1])}
						</p>
						<p class="installment-progress">
							{(inst.payments || []).length} de {inst.installmentCount} parcelas pagas
						</p>
					</div>
					<div class="installment-actions">
						<button class="btn btn-ghost sm" onclick={() => toggleExpand(inst.id)} title="Ver parcelas">
							{#if isExpanded}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
						</button>
						<button class="btn btn-ghost sm" onclick={() => openEdit(inst)} title="Editar"><Pencil size={14} /></button>
						<button class="btn btn-danger sm" onclick={() => handleDelete(inst)} title="Excluir"><Trash2 size={14} /></button>
					</div>
				</div>

				{#if isExpanded}
					<div class="installment-details">
						{#each dates as date, idx (idx)}
							{@const installmentNumber = idx + 1}
							{@const payment = inst.payments?.find((p) => p.installmentNumber === installmentNumber)}
							{@const installmentValue = inst.totalValue / inst.installmentCount}
							<div class="installment-row" class:paid={payment}>
								<div class="installment-row-main">
									<span class="installment-number">{installmentNumber}/{inst.installmentCount}</span>
									<span class="installment-row-date">{fmtDate(date)}</span>
									<span class="installment-row-value privacy-value">{fmtMoney(installmentValue)}</span>
								</div>
								<div class="installment-row-info">
									{#if payment}
										<span class="badge badge-green">
											<CheckCircle2 size={11} style="vertical-align:-1px;margin-right:3px" />
											Pago em {fmtDate(payment.paymentDate)}
										</span>
										<span class="payment-method">{payment.paymentMethod}</span>
										<button class="btn btn-ghost sm" onclick={() => unmarkAsPaid(inst, installmentNumber)} title="Desmarcar como pago">
											<Circle size={12} />
										</button>
									{:else}
										<button class="btn btn-sm" onclick={() => openPaymentModal(inst, installmentNumber)}>
											<CheckCircle2 size={12} style="vertical-align:-1px;margin-right:4px" />
											Marcar como pago
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
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
<InstallmentPaymentModal open={paymentModal.open} installment={paymentModal.installment} installmentNumber={paymentModal.installmentNumber} onClose={() => (paymentModal = { ...paymentModal, open: false })} onPaid={markAsPaid} />

<style>
	.stats-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 12px;
		margin-bottom: 24px;
	}

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
		margin: 0 0 4px 0;
		display: flex;
		align-items: center;
	}

	.installment-progress {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
	}

	.installment-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.installment-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		margin-top: 12px;
		background: var(--bg-muted);
		border-radius: 6px;
	}

	.installment-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px;
		background: var(--card-bg);
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.installment-row.paid {
		background: var(--bg-muted);
		opacity: 0.7;
	}

	.installment-row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
	}

	.installment-number {
		font-weight: 600;
		font-size: 13px;
		min-width: 50px;
	}

	.installment-row-date {
		font-size: 13px;
		color: var(--text-muted);
	}

	.installment-row-value {
		font-weight: 600;
		font-size: 14px;
	}

	.installment-row-info {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.payment-method {
		font-size: 12px;
		color: var(--text-muted);
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
