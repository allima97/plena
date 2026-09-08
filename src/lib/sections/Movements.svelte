<script>
	import { appState, setPaymentStatus, manageSeries, removeTransaction } from '$lib/fin/store.svelte.js';
	import { committedThisMonth, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import ReportCenterModal from '$lib/components/ReportCenterModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MovementRow from '$lib/components/MovementRow.svelte';
	import { Plus, FileBarChart, Search } from 'lucide-svelte';

	let query = $state('');
	let seriesFilter = $state('all');
	let statusFilter = $state('all');
	let paymentFilter = $state('all');
	let dateFilter = $state('');

	let modal = $state({ open: false, mode: 'create', transaction: null });
	let showReport = $state(false);
	let deleting = $state(null);

	function openNew() {
		modal = { open: true, mode: 'create', transaction: null };
	}
	function openEditOccurrence(t) {
		modal = { open: true, mode: 'edit-occurrence', transaction: t };
	}
	function openEditSeries(t) {
		modal = { open: true, mode: 'edit-series', transaction: t };
	}
	function closeModal() {
		modal = { ...modal, open: false };
	}

	function togglePayment(t) {
		setPaymentStatus(t.id, t.statusPagamento === 'pago' ? 'pendente' : 'pago');
	}

	const filtered = $derived(
		appState.transactions
			.filter((t) => {
				if (query) {
					const cat = appState.categories.find((c) => c.id === t.categoriaId);
					const acc = appState.accounts.find((a) => a.id === t.contaId);
					const haystack = `${t.descricao || ''} ${cat?.nome || ''} ${acc?.nome || ''}`.toLowerCase();
					if (!haystack.includes(query.toLowerCase())) return false;
				}
				if (seriesFilter === 'parcelado' && t.seriesKind !== 'parcelado') return false;
				if (seriesFilter === 'recorrente' && t.seriesKind !== 'recorrente') return false;
				if (seriesFilter === 'nenhuma' && t.seriesId) return false;
				if (statusFilter !== 'all' && (t.seriesStatus || 'nenhuma') !== statusFilter) return false;
				if (paymentFilter !== 'all' && t.statusPagamento !== paymentFilter) return false;
				if (dateFilter && t.data !== dateFilter) return false;
				return true;
			})
			.sort((a, b) => b.data.localeCompare(a.data))
	);

	const comprometido = $derived(committedThisMonth(appState.transactions, currentMonthKey()));
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Movimentações</h1>
		<p class="page-sub">{appState.transactions.length} lançamento(s) no total · {fmtMoney(comprometido)} comprometidos este mês em parcelas e recorrências</p>
	</div>
	<div class="actions-row">
		<button class="btn" onclick={() => (showReport = true)}><FileBarChart size={16} /> Relatórios</button>
		<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo lançamento</button>
	</div>
</div>

<div class="filters-bar">
	<div class="search-input-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input type="text" placeholder="Buscar por descrição, categoria ou conta" bind:value={query} />
	</div>
	<select bind:value={seriesFilter}>
		<option value="all">Todas as séries</option>
		<option value="parcelado">Parcelamentos</option>
		<option value="recorrente">Recorrentes</option>
		<option value="nenhuma">Sem série</option>
	</select>
	<select bind:value={statusFilter}>
		<option value="all">Qualquer status de série</option>
		<option value="ativa">Ativas</option>
		<option value="pausada">Pausadas</option>
		<option value="cancelada">Canceladas</option>
	</select>
	<select bind:value={paymentFilter}>
		<option value="all">Pago e pendente</option>
		<option value="pago">Só pagos</option>
		<option value="pendente">Só pendentes</option>
	</select>
	<input type="date" bind:value={dateFilter} aria-label="Vencimento específico" />
</div>

<div class="card">
	{#if filtered.length === 0}
		<p class="empty">Nenhum lançamento encontrado.</p>
	{:else}
		{#each filtered as t (t.id)}
			<MovementRow
				{t}
				categoria={appState.categories.find((c) => c.id === t.categoriaId)}
				subcategoria={appState.categories.find((c) => c.id === t.categoriaId)?.secundarios?.find((s) => s.id === t.subcategoriaId)?.nome}
				conta={appState.accounts.find((a) => a.id === t.contaId)}
				onTogglePayment={togglePayment}
				onEditOccurrence={openEditOccurrence}
				onEditSeries={openEditSeries}
				onManageSeries={manageSeries}
				onDelete={(tx) => (deleting = tx)}
			/>
		{/each}
	{/if}
</div>

<NewMovementModal open={modal.open} mode={modal.mode} transaction={modal.transaction} onClose={closeModal} />
<ReportCenterModal open={showReport} onClose={() => (showReport = false)} />
<ConfirmDialog
	open={deleting !== null}
	title="Excluir lançamento?"
	message={`"${deleting?.descricao || 'Este lançamento'}" será removido. Esta ação não pode ser desfeita.`}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={() => {
		removeTransaction(deleting.id);
		deleting = null;
	}}
/>
