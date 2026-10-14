<script>
	import { appState, addPurchaseInstallment, updatePurchaseInstallment, removePurchaseInstallment, restorePurchaseInstallment } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import PurchaseInstallmentModal from '$lib/components/PurchaseInstallmentModal.svelte';
	import InstallmentPaymentModal from '$lib/components/InstallmentPaymentModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Plus, Trash2, Pencil, Calendar, CreditCard, CheckCircle2, Circle, ChevronDown, ChevronUp, Archive, ArchiveRestore } from 'lucide-svelte';

	let modal = $state({ open: false, editing: null });
	let paymentModal = $state({ open: false, installment: null, installmentNumber: null });
	let confirmDelete = $state({ open: false, target: null });
	let expanded = $state({}); // installmentId -> expanded?
	let showArchived = $state(false);

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

	// Verifica se todas as parcelas estão pagas
	function isCompleted(inst) {
		return (inst.payments || []).length >= inst.installmentCount;
	}

	// Agrupa parcelas por mês (apenas pendentes, apenas não-arquivadas)
	function groupByMonth(installments) {
		const groups = {};
		installments
			.filter((inst) => !inst.archived)
			.forEach((inst) => {
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

	const activeInstallments = $derived(appState.purchaseInstallments.filter((i) => !i.archived));
	const archivedInstallments = $derived(appState.purchaseInstallments.filter((i) => i.archived));

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

	// Abre confirmação antes de excluir
	function handleDelete(inst) {
		confirmDelete = { open: true, target: inst };
	}

	// Executa a exclusão após confirmação
	function confirmDeleteNow() {
		const inst = confirmDelete.target;
		confirmDelete = { open: false, target: null };
		if (!inst) return;
		const snapshot = { ...inst };
		removePurchaseInstallment(inst.id);
		showToast({
			message: `Parcelamento "${inst.description || 'sem descrição'}" excluído.`,
			actionLabel: 'DESFAZER',
			onAction: () => restorePurchaseInstallment(snapshot)
		});
	}

	// Arquiva um parcelamento finalizado
	function handleArchive(inst) {
		updatePurchaseInstallment(inst.id, { archived: true });
		showToast({
			message: `"${inst.description || 'Parcelamento'}" arquivado.`,
			actionLabel: 'DESFAZER',
			onAction: () => updatePurchaseInstallment(inst.id, { archived: false })
		});
	}

	// Desarquiva um parcelamento
	function handleUnarchive(inst) {
		updatePurchaseInstallment(inst.id, { archived: false });
		showToast({ message: `"${inst.description || 'Parcelamento'}" restaurado.` });
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
		const payment = { ...payments[existingIndex], installmentNumber, paymentDate, paymentMethod };

		let newPayments;
		if (existingIndex >= 0) {
			newPayments = payments.map((p, i) => (i === existingIndex ? payment : p));
		} else {
			newPayments = [...payments, payment];
		}

		updatePurchaseInstallment(inst.id, { payments: newPayments });
		paymentModal = { ...paymentModal, open: false };
		showToast({ message: `Parcela ${installmentNumber}/${inst.installmentCount} ${existingIndex >= 0 ? 'atualizada' : 'marcada como paga'}.` });
	}

	function unmarkAsPaid(inst, installmentNumber) {
		const payments = (inst.payments || []).filter((p) => p.installmentNumber !== installmentNumber);
		updatePurchaseInstallment(inst.id, { payments });
		showToast({ message: `Parcela ${installmentNumber}/${inst.installmentCount} desmarcada.` });
	}

	function handleSaved() {
		modal = { ...modal, open: false };
	}

	// Calcula estatísticas (apenas ativos)
	const stats = $derived.by(() => {
		let total = 0;
		let paid = 0;
		let pending = 0;
		let totalAmount = 0;
		let paidAmount = 0;
		activeInstallments.forEach((inst) => {
			const count = inst.installmentCount;
			const paidCount = (inst.payments || []).length;
			total += count;
			paid += paidCount;
			pending += count - paidCount;
			const value = Number(inst.totalValue) || 0;
			totalAmount += value;
			paidAmount += count > 0 ? value * paidCount / count : 0;
		});
		return { total, paid, pending, totalAmount, paidAmount, pendingAmount: totalAmount - paidAmount };
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
{#if activeInstallments.length > 0}
	<div class="stats-row">
		<div class="stat-card">
			<p class="stat-label">Total de parcelas</p>
			<p class="font-display stat-value">{stats.total}</p>
			<p class="stat-amount privacy-value">{fmtMoney(stats.totalAmount)}</p>
		</div>
		<div class="stat-card kpi-green">
			<p class="stat-label">Pagas</p>
			<p class="font-display stat-value">{stats.paid}</p>
			<p class="stat-amount privacy-value">{fmtMoney(stats.paidAmount)}</p>
		</div>
		<div class="stat-card kpi-amber">
			<p class="stat-label">Pendentes</p>
			<p class="font-display stat-value">{stats.pending}</p>
			<p class="stat-amount privacy-value">{fmtMoney(stats.pendingAmount)}</p>
		</div>
	</div>
{/if}

{#if activeInstallments.length === 0 && archivedInstallments.length === 0}
	<div class="empty-state">
		<CreditCard size={48} style="opacity:0.3;margin-bottom:16px" />
		<p>Nenhum parcelamento cadastrado.</p>
		<p class="empty-sub">Use o botão acima para adicionar suas compras parceladas.</p>
	</div>
{:else}
	<!-- Lista de parcelamentos ativos -->
	{#if activeInstallments.length > 0}
		<section class="installment-section">
			<h3 class="card section-heading">Todos os parcelamentos</h3>
			<div class="installments-list">
				{#each activeInstallments as inst (inst.id)}
					{@const dates = generateInstallmentDates(inst.firstDate, inst.installmentCount)}
					{@const isExpanded = expanded[inst.id]}
					{@const completed = isCompleted(inst)}
					<div class="installment-item" class:completed>
						<div class="installment-main">
							<div class="installment-header">
								<span class="installment-desc">{inst.description || 'Sem descrição'}</span>
								<span class="badge">{inst.installmentCount}x</span>
								{#if completed}
									<span class="badge badge-green" style="font-size:11px">
										<CheckCircle2 size={11} style="vertical-align:-1px;margin-right:3px" />
										Finalizado
									</span>
								{/if}
							</div>
							<p class="installment-meta">
								{inst.paymentMethod}
							</p>
							<div class="installment-values">
								<span class="privacy-value">{fmtMoney(inst.totalValue)}</span>
								<span class="installment-unit privacy-value">({fmtMoney(inst.totalValue / inst.installmentCount)}/mês)</span>
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
							{#if completed}
								<button class="btn btn-ghost sm" onclick={() => handleArchive(inst)} title="Arquivar parcelamento finalizado" style="color:var(--text-muted)">
									<Archive size={14} />
								</button>
							{/if}
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
												<span>Pago em {fmtDate(payment.paymentDate)}</span>
											</span>
											<span class="payment-method">{payment.paymentMethod}</span>
											<button class="btn btn-ghost sm" onclick={() => openPaymentModal(inst, installmentNumber)} title="Editar pagamento">
												<Pencil size={12} />
											</button>
											<button class="btn btn-ghost sm" onclick={() => unmarkAsPaid(inst, installmentNumber)} title="Desmarcar como pago">
												<Circle size={12} />
											</button>
										{:else}
											<button class="btn btn-sm" onclick={() => openPaymentModal(inst, installmentNumber)}>
												<CheckCircle2 size={12} style="vertical-align:-1px;margin-right:4px" />
												<span>Marcar como paga</span>
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
	{:else if archivedInstallments.length > 0}
		<div class="empty-state" style="padding:32px 24px">
			<CheckCircle2 size={40} style="opacity:0.3;margin-bottom:12px" />
			<p>Todos os parcelamentos foram finalizados e arquivados.</p>
			<p class="empty-sub">Adicione novos ou confira os arquivados abaixo.</p>
		</div>
	{/if}

	<!-- Resumo mês a mês -->
	{#if sortedMonths.length > 0}
		<section class="installment-section">
			<h3 class="card section-heading">Compromissos por mês</h3>
			<div class="monthly-summary">
				{#each sortedMonths as month (month)}
					{@const items = monthlyGroups[month]}
					{@const total = items.reduce((sum, item) => sum + item.installmentValue, 0)}
					<div class="month-group">
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
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Seção de arquivados -->
	{#if archivedInstallments.length > 0}
		<section class="card archived-section">
			<button class="archived-toggle" onclick={() => (showArchived = !showArchived)}>
				<span style="display:flex;align-items:center;gap:8px">
					<Archive size={15} style="opacity:0.6" />
					<span>Arquivados</span>
					<span class="badge">{archivedInstallments.length}</span>
				</span>
				{#if showArchived}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
			</button>

			{#if showArchived}
				<div class="installments-list" style="margin-top:16px">
					{#each archivedInstallments as inst (inst.id)}
						{@const dates = generateInstallmentDates(inst.firstDate, inst.installmentCount)}
						{@const isExpanded = expanded[inst.id]}
						<div class="installment-item archived-item">
							<div class="installment-main">
								<div class="installment-header">
									<span class="installment-desc">{inst.description || 'Sem descrição'}</span>
									<span class="badge">{inst.installmentCount}x</span>
									<span class="badge badge-green" style="font-size:11px">
										<CheckCircle2 size={11} style="vertical-align:-1px;margin-right:3px" />
										Finalizado
									</span>
								</div>
								<p class="installment-meta">{inst.paymentMethod}</p>
								<div class="installment-values">
									<span class="privacy-value">{fmtMoney(inst.totalValue)}</span>
									<span class="installment-unit privacy-value">({fmtMoney(inst.totalValue / inst.installmentCount)}/mês)</span>
								</div>
								<p class="installment-dates">
									<Calendar size={12} style="vertical-align:-1px;margin-right:4px" />
									{fmtDate(inst.firstDate)} – {fmtDate(dates[inst.installmentCount - 1])}
								</p>
							</div>
							<div class="installment-actions">
								<button class="btn btn-ghost sm" onclick={() => toggleExpand(inst.id)} title="Ver parcelas">
									{#if isExpanded}<ChevronUp size={14} />{:else}<ChevronDown size={14} />{/if}
								</button>
								<button class="btn btn-ghost sm" onclick={() => handleUnarchive(inst)} title="Restaurar" style="color:var(--text-muted)">
									<ArchiveRestore size={14} />
								</button>
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
													<span>Pago em {fmtDate(payment.paymentDate)}</span>
												</span>
												<span class="payment-method">{payment.paymentMethod}</span>
												<button class="btn btn-ghost sm" onclick={() => openPaymentModal(inst, installmentNumber)} title="Editar pagamento">
													<Pencil size={12} /> Editar pagamento
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</section>
	{/if}
{/if}

<PurchaseInstallmentModal open={modal.open} editing={modal.editing} onClose={() => (modal = { ...modal, open: false })} onSaved={handleSaved} />
<InstallmentPaymentModal open={paymentModal.open} installment={paymentModal.installment} installmentNumber={paymentModal.installmentNumber} onClose={() => (paymentModal = { ...paymentModal, open: false })} onPaid={markAsPaid} />
<ConfirmDialog
	open={confirmDelete.open}
	title="Excluir parcelamento"
	message={confirmDelete.target ? `Tem certeza que deseja excluir "${confirmDelete.target.description || 'este parcelamento'}"? Esta ação não pode ser desfeita.` : ''}
	confirmLabel="Excluir"
	onConfirm={confirmDeleteNow}
	onCancel={() => (confirmDelete = { open: false, target: null })}
/>

<style>
	.installment-section {
		margin-bottom: 24px;
		min-width: 0;
	}

	.section-heading {
		margin: 0 0 16px;
		padding: 16px 20px;
		font-size: 16px;
	}

	.month-group {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--card);
	}

	.stat-amount {
		margin: 8px 0 0;
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

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
		background: var(--card);
	}

	.installment-item.completed {
		border-color: var(--color-green, #16a34a);
		border-left-width: 3px;
	}

	.installment-item.archived-item {
		opacity: 0.75;
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
		flex-wrap: wrap;
	}

	.installment-desc {
		font-size: 17px;
		font-weight: 800;
		line-height: 1.4;
		color: var(--ink);
		overflow-wrap: anywhere;
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
		font-weight: 700;
		color: var(--ink);
		margin: 0;
	}

	.installment-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.installment-details {
		min-width: 0;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		margin-top: 12px;
		background: var(--bg-muted);
		border-radius: 6px;
	}

	.installment-row {
		min-width: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px;
		background: var(--card);
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.installment-row.paid {
		background: var(--bg-muted);
		opacity: 0.7;
	}

	.installment-row-main {
		flex-wrap: wrap;
		min-width: 0;
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
		flex-wrap: wrap;
		min-width: 0;
		max-width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.installment-row-info .badge,
	.installment-row-info .btn {
		min-width: 0;
		max-width: 100%;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.installment-row-info :global(svg) {
		flex-shrink: 0;
	}

	.installment-row-info span {
		min-width: 0;
	}

	.payment-method {
		overflow-wrap: anywhere;
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
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 4px 12px;
		align-items: center;
		padding: 14px 12px;
		background: var(--surface-2);
		border-radius: 8px 8px 0 0;
		border-bottom: 1px solid var(--border);
	}

	.month-label {
		font-size: 17px;
		font-weight: 800;
	}

	.month-value {
		font-size: 17px;
		font-weight: 800;
		text-align: right;
	}

	.month-count {
		grid-column: 1 / -1;
		text-align: right;
		font-size: 13px;
		color: var(--text-muted);
	}

	.month-details {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding: 12px;
	}

	.month-detail-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
		align-items: center;
		font-size: 13px;
	}

	.detail-meta {
		grid-column: 1 / -1;
		font-weight: 700;
		color: var(--ink);
		white-space: nowrap;
	}

	.detail-desc {
		font-weight: 500;
	}

	.detail-value {
		font-weight: 600;
	}

	.archived-section {
		opacity: 0.9;
	}

	.archived-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 16px;
		font-weight: 500;
		color: var(--text);
	}

	.archived-toggle:hover {
		color: var(--accent);
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
	@media (max-width: 640px) {
		.installment-item {
			flex-wrap: wrap;
		}
		.installment-actions {
			flex-wrap: wrap;
		}
		.installment-values {
			flex-wrap: wrap;
		}
		.installment-row {
			grid-template-columns: minmax(0, 1fr) auto auto;
			align-items: center;
		}
		.installment-row-main {
			grid-column: 1;
			grid-row: 1;
			gap: 8px;
		}
		.installment-details {
			padding: 8px;
		}
		.installment-row-info {
			display: contents;
		}
		.installment-row-info .badge {
			grid-column: 1 / -1;
			grid-row: 2;
			justify-self: start;
		}
		.installment-row-info .payment-method {
			grid-column: 1 / -1;
			grid-row: 3;
		}
		.installment-row-info .btn {
			min-height: 40px;
			height: auto;
			padding: 8px 10px;
		}
		.installment-row-info .btn:not([title]) {
			grid-column: 1 / -1;
			grid-row: 2;
			width: 100%;
		}
		.installment-row-info .btn[title="Editar pagamento"] {
			grid-column: 2;
			grid-row: 1;
		}
		.installment-row-info .btn[title="Desmarcar como pago"] {
			grid-column: 3;
			grid-row: 1;
		}
		.month-detail-item {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.detail-meta {
			grid-column: 1 / -1;
			white-space: normal;
		}
		.detail-desc, .installment-desc {
			overflow-wrap: anywhere;
		}
	}
</style>
