<script>
	import Modal from './Modal.svelte';
	import MovementRow from './MovementRow.svelte';
	import NewMovementModal from './NewMovementModal.svelte';
	import { appState, setPaymentStatus, removeTransaction, restoreTransaction, manageSeries } from '$lib/fin/store.svelte.js';
	import { fmtMoney, todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';

	/**
	 * Lista as entradas ou saídas de um mês (os mesmos lançamentos já somados nos cards
	 * "Entradas no mês" / "Saídas no mês" do Dashboard), com a mesma interação de
	 * Movimentações: clicar num lançamento abre pra ver/editar, dá pra marcar como
	 * pago/pendente e excluir com desfazer.
	 */
	let { open, onClose, tipo, transactions = [], monthLabel = '' } = $props();

	let editModal = $state({ open: false, mode: 'edit-occurrence', transaction: null });

	function openEditOccurrence(t) {
		editModal = { open: true, mode: 'edit-occurrence', transaction: t };
	}
	function openEditSeries(t) {
		editModal = { open: true, mode: 'edit-series', transaction: t };
	}
	function closeEditModal() {
		editModal = { ...editModal, open: false };
	}
	function togglePayment(t) {
		setPaymentStatus(t.id, t.statusPagamento === 'pago' ? 'pendente' : 'pago');
	}
	function handleDelete(t) {
		const snapshot = { ...t };
		removeTransaction(t.id);
		showToast({
			message: `Lançamento "${t.descricao || 'sem descrição'}" excluído.`,
			actionLabel: 'DESFAZER',
			onAction: () => restoreTransaction(snapshot)
		});
	}

	const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
	function yesterdayISO() {
		const d = new Date();
		d.setDate(d.getDate() - 1);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	}
	function dateGroupLabel(iso) {
		if (iso === todayISO()) return 'Hoje';
		if (iso === yesterdayISO()) return 'Ontem';
		const [, m, d] = iso.split('-');
		return `${d} ${MES_ABBR[Number(m) - 1]}`;
	}

	// Mesmo agrupamento por data (desc) com cabeçalho Hoje/Ontem/DD MES usado em Movimentações.
	const sorted = $derived([...transactions].sort((a, b) => b.data.localeCompare(a.data)));
	const grouped = $derived.by(() => {
		const groups = [];
		let current = null;
		for (const t of sorted) {
			if (!current || current.date !== t.data) {
				current = { date: t.data, label: dateGroupLabel(t.data), items: [] };
				groups.push(current);
			}
			current.items.push(t);
		}
		return groups;
	});

	const total = $derived(transactions.reduce((s, t) => s + (Number(t.valor) || 0), 0));
	const titulo = $derived(tipo === 'receita' ? 'Entradas do mês' : 'Saídas do mês');
</script>

<Modal
	open={open && !editModal.open}
	onClose={onClose}
	maxWidth="560px"
	eyebrow={monthLabel}
	title={titulo}
	subtitle={`${transactions.length} lançamento${transactions.length === 1 ? '' : 's'} · total ${fmtMoney(total)}`}
>
	{#if grouped.length === 0}
		<p class="empty">Nenhum lançamento {tipo === 'receita' ? 'de entrada' : 'de saída'} neste mês.</p>
	{:else}
		{#each grouped as g (g.date)}
			<div class="movement-date-group">
				<p class="movement-date-heading">{g.label}</p>
				{#each g.items as t (t.id)}
					<MovementRow
						{t}
						categoria={appState.categories.find((c) => c.id === t.categoriaId)}
						subcategoria={appState.categories.find((c) => c.id === t.categoriaId)?.secundarios?.find((s) => s.id === t.subcategoriaId)?.nome}
						conta={appState.accounts.find((a) => a.id === t.contaId)}
						onTogglePayment={togglePayment}
						onEditOccurrence={openEditOccurrence}
						onDelete={handleDelete}
					/>
				{/each}
			</div>
		{/each}
	{/if}
</Modal>

<NewMovementModal
	open={editModal.open}
	mode={editModal.mode}
	transaction={editModal.transaction}
	onClose={closeEditModal}
	onDelete={handleDelete}
	onEditSeries={openEditSeries}
	onManageSeries={manageSeries}
/>
