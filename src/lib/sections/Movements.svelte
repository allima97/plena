<script>
	import { appState, setPaymentStatus, manageSeries, removeTransaction } from '$lib/fin/store.svelte.js';
	import { committedThisMonth, currentMonthKey, monthTransactions } from '$lib/fin/derived.js';
	import { exportCSV, exportPDF } from '$lib/fin/export.js';
	import { fmtMoney, monthKey, monthLabel } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import ReportCenterModal from '$lib/components/ReportCenterModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import MovementRow from '$lib/components/MovementRow.svelte';
	import { Plus, FileBarChart, Search, Download, FileDown } from 'lucide-svelte';

	let query = $state('');
	let monthFilter = $state(currentMonthKey());
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

	function limparFiltros() {
		query = '';
		monthFilter = 'all';
		seriesFilter = 'all';
		statusFilter = 'all';
		paymentFilter = 'all';
		dateFilter = '';
	}

	const mesesDisponiveis = $derived.by(() => {
		const set = new Set(appState.transactions.map((t) => monthKey(t.data)));
		set.add(currentMonthKey());
		return [...set].sort().reverse();
	});

	const filtered = $derived(
		appState.transactions
			.filter((t) => {
				if (query) {
					const cat = appState.categories.find((c) => c.id === t.categoriaId);
					const acc = appState.accounts.find((a) => a.id === t.contaId);
					const haystack = `${t.descricao || ''} ${cat?.nome || ''} ${acc?.nome || ''}`.toLowerCase();
					if (!haystack.includes(query.toLowerCase())) return false;
				}
				if (monthFilter !== 'all' && monthKey(t.data) !== monthFilter) return false;
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

	const resumoMesKey = $derived(monthFilter === 'all' ? currentMonthKey() : monthFilter);
	const resumoMesTx = $derived(monthTransactions(appState.transactions, resumoMesKey));
	const comprometido = $derived(committedThisMonth(appState.transactions, resumoMesKey));
	const parcelamentosMes = $derived(resumoMesTx.filter((t) => t.seriesKind === 'parcelado' && t.seriesStatus === 'ativa').reduce((s, t) => s + (Number(t.valor) || 0), 0));
	const recorrenciasMes = $derived(resumoMesTx.filter((t) => t.seriesKind === 'recorrente' && t.seriesStatus === 'ativa').reduce((s, t) => s + (Number(t.valor) || 0), 0));

	async function exportarCSVRapido() {
		await exportCSV(filtered, appState.categories, appState.accounts);
	}
	async function exportarPDFRapido() {
		await exportPDF(filtered, appState.categories, appState.accounts, {
			periodo: monthFilter === 'all' ? 'Todos os períodos' : monthLabel(monthFilter),
			filtrosResumo: query ? `Busca: "${query}"` : ''
		});
	}
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Movimentações · {monthLabel(resumoMesKey)}</p>
		<h1 class="font-display page-title">Onde seu dinheiro se move.</h1>
		<p class="page-sub">Consulte lançamentos, séries futuras e próximos vencimentos com filtros rápidos.</p>
	</div>
	<div class="actions-row">
		<button class="btn" onclick={exportarPDFRapido}><FileDown size={16} /> Exportar PDF</button>
		<button class="btn" onclick={exportarCSVRapido}><Download size={16} /> Exportar CSV</button>
		<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo lançamento</button>
	</div>
</div>

<div class="move-summary-grid">
	<div class="move-summary-card dark">
		<p class="move-summary-label">Comprometido em {monthLabel(resumoMesKey)}</p>
		<p class="move-summary-value">{fmtMoney(comprometido)}</p>
		<p class="move-summary-sub">parcelas + recorrências</p>
	</div>
	<div class="move-summary-card tint-blue">
		<p class="move-summary-label" style="color:var(--accent-fg)">Parcelamentos</p>
		<p class="move-summary-value" style="color:var(--ink)">{fmtMoney(parcelamentosMes)}</p>
		<p class="move-summary-sub" style="color:var(--ink-muted)">vencendo neste mês</p>
	</div>
	<div class="move-summary-card tint-green">
		<p class="move-summary-label" style="color:var(--income)">Recorrências</p>
		<p class="move-summary-value" style="color:var(--ink)">{fmtMoney(recorrenciasMes)}</p>
		<p class="move-summary-sub" style="color:var(--ink-muted)">vencendo neste mês</p>
	</div>
</div>

<div class="filters-bar">
	<div class="search-input-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input type="text" placeholder="Buscar por descrição, categoria ou conta" bind:value={query} />
	</div>
	<select bind:value={monthFilter}>
		<option value="all">Todos os meses</option>
		{#each mesesDisponiveis as m}
			<option value={m}>{monthLabel(m)}</option>
		{/each}
	</select>
	<button class="btn btn-ghost sm" onclick={() => (showReport = true)}><FileBarChart size={14} /> Central de relatórios</button>
</div>

<div class="filters-bar">
	<select bind:value={paymentFilter}>
		<option value="all">Todos os pagamentos</option>
		<option value="pago">Só pagos</option>
		<option value="pendente">Só pendentes</option>
	</select>
	<select bind:value={seriesFilter}>
		<option value="all">Todos os lançamentos</option>
		<option value="parcelado">Parcelamentos</option>
		<option value="recorrente">Recorrentes</option>
		<option value="nenhuma">Sem série</option>
	</select>
	<select bind:value={statusFilter}>
		<option value="all">Todos os status</option>
		<option value="ativa">Ativas</option>
		<option value="pausada">Pausadas</option>
		<option value="cancelada">Canceladas</option>
	</select>
	<input type="date" bind:value={dateFilter} aria-label="Vencimento específico" />
	<button class="btn btn-ghost sm" onclick={limparFiltros}>Limpar filtros</button>
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
