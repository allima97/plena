<script>
	import { appState, setPaymentStatus, manageSeries, removeTransaction, restoreTransaction, transferPairOf } from '$lib/fin/store.svelte.js';
	import { committedThisMonth, currentMonthKey, monthTransactions } from '$lib/fin/derived.js';
	import { exportCSV, exportPDF } from '$lib/fin/export.js';
	import { fmtMoney, financialMonthKey, monthLabel, todayISO } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import ReportCenterModal from '$lib/components/ReportCenterModal.svelte';
import TransferModal from '$lib/components/TransferModal.svelte';
	import { showToast } from '$lib/toast.svelte.js';
	import MovementRow from '$lib/components/MovementRow.svelte';
	import { Plus, FileBarChart, Search, Download, FileDown, ArrowLeftRight, ChevronDown } from 'lucide-svelte';
	import { page } from '$app/state';

	let query = $state('');
	let monthFilter = $state(currentMonthKey());
	let quickFilter = $state('all'); // all | receita | despesa | pendente
	let seriesFilter = $state('all');
	let statusFilter = $state('all');
	let paymentFilter = $state('all');
	let dateFilter = $state('');
	let maisFiltrosAbertos = $state(false);

	let modal = $state({ open: false, mode: 'create', transaction: null });
	let showReport = $state(false);
	let showTransfer = $state(false);

	const startDay = $derived(appState.settings.monthStartDay || 1);

	// Vindo da busca global (?open=<id>): abre direto o lançamento exato, uma única vez,
	// e amplia o filtro de mês para garantir que ele apareça mesmo fora do mês corrente.
	let openedFromSearch = false;
	$effect(() => {
		if (openedFromSearch) return;
		const id = page.url.searchParams.get('open');
		if (!id) return;
		const tx = appState.transactions.find((t) => t.id === id);
		if (tx) {
			openedFromSearch = true;
			monthFilter = 'all';
			openEditOccurrence(tx);
		}
	});


	function handleDelete(tx) {
		if (tx.isTransferencia && tx.transferId) {
			const pair = transferPairOf(tx.transferId).map((t) => ({ ...t }));
			pair.forEach((t) => removeTransaction(t.id));
			showToast({
				message: 'Transferência excluída.',
				actionLabel: 'DESFAZER',
				onAction: () => pair.forEach((t) => restoreTransaction(t))
			});
			return;
		}
		const snapshot = { ...tx };
		removeTransaction(tx.id);
		showToast({
			message: `Lançamento "${tx.descricao || 'sem descrição'}" excluído.`,
			actionLabel: 'DESFAZER',
			onAction: () => restoreTransaction(snapshot)
		});
	}

	function openNew() {
		modal = { open: true, mode: 'create', transaction: null };
	}
	function openEditOccurrence(t) {
		modal = { open: true, mode: 'edit-occurrence', transaction: t };
	}
	function openEditSeries(t) {
		modal = { open: true, mode: 'edit-series', transaction: t };
	}
	function duplicateTransaction(t) {
		modal = {
			open: true,
			mode: 'create',
			transaction: {
				tipo: t.tipo,
				valor: t.valor,
				data: todayISO(),
				descricao: t.descricao,
				categoriaId: t.categoriaId,
				subcategoriaId: t.subcategoriaId,
				contaId: t.contaId,
				formaPagamento: t.formaPagamento
			}
		};
	}
	function closeModal() {
		modal = { ...modal, open: false };
	}

	function togglePayment(t) {
		setPaymentStatus(t.id, t.statusPagamento === 'pago' ? 'pendente' : 'pago');
	}

	function limparFiltros() {
		query = '';
		quickFilter = 'all';
		monthFilter = 'all';
		seriesFilter = 'all';
		statusFilter = 'all';
		paymentFilter = 'all';
		dateFilter = '';
	}

	// Conta quantos filtros "avançados" (escondidos atrás de "Mais filtros") estão ativos,
	// para mostrar o badge "Filtros · N" sem precisar abrir o painel.
	const filtrosAtivosCount = $derived(
		(monthFilter !== currentMonthKey(startDay) ? 1 : 0) +
			(seriesFilter !== 'all' ? 1 : 0) +
			(statusFilter !== 'all' ? 1 : 0) +
			(paymentFilter !== 'all' ? 1 : 0) +
			(dateFilter ? 1 : 0)
	);

	const mesesDisponiveis = $derived.by(() => {
		const set = new Set(appState.transactions.map((t) => financialMonthKey(t.data, startDay)));
		set.add(currentMonthKey(startDay));
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
				if (monthFilter !== 'all' && financialMonthKey(t.data, startDay) !== monthFilter) return false;
				if (quickFilter === 'receita' && t.tipo !== 'receita') return false;
				if (quickFilter === 'despesa' && t.tipo !== 'despesa') return false;
				if (quickFilter === 'pendente' && t.statusPagamento !== 'pendente') return false;
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
	// Agrupa a lista já filtrada/ordenada por data (desc) em seções com cabeçalho
	// (Hoje / Ontem / DD MES), sem alterar os filtros existentes.
	const groupedFiltered = $derived.by(() => {
		const groups = [];
		let current = null;
		for (const t of filtered) {
			if (!current || current.date !== t.data) {
				current = { date: t.data, label: dateGroupLabel(t.data), items: [] };
				groups.push(current);
			}
			current.items.push(t);
		}
		return groups;
	});

	const resumoMesKey = $derived(monthFilter === 'all' ? currentMonthKey(startDay) : monthFilter);
	const resumoMesTx = $derived(monthTransactions(appState.transactions, resumoMesKey, startDay));
	const comprometido = $derived(committedThisMonth(appState.transactions, resumoMesKey, startDay));
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
		<button class="btn" onclick={() => (showTransfer = true)}><ArrowLeftRight size={16} /> Transferência</button>
		<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo lançamento</button>
	</div>
</div>

<div class="move-summary-grid">
	<div class="move-summary-card dark">
		<p class="move-summary-label">Comprometido em {monthLabel(resumoMesKey)}</p>
		<p class="move-summary-value privacy-value">{fmtMoney(comprometido)}</p>
		<p class="move-summary-sub">parcelas + recorrências</p>
	</div>
	<div class="move-summary-card tint-blue">
		<p class="move-summary-label" style="color:var(--accent-fg)">Parcelamentos</p>
		<p class="move-summary-value privacy-value" style="color:var(--ink)">{fmtMoney(parcelamentosMes)}</p>
		<p class="move-summary-sub" style="color:var(--ink-muted)">vencendo neste mês</p>
	</div>
	<div class="move-summary-card tint-green">
		<p class="move-summary-label" style="color:var(--income)">Recorrências</p>
		<p class="move-summary-value privacy-value" style="color:var(--ink)">{fmtMoney(recorrenciasMes)}</p>
		<p class="move-summary-sub" style="color:var(--ink-muted)">vencendo neste mês</p>
	</div>
</div>

<div class="filters-bar">
	<div class="search-input-wrap">
		<span class="search-icon"><Search size={15} /></span>
		<input type="text" placeholder="Buscar por descrição, categoria ou conta" bind:value={query} />
	</div>
	<button class="btn btn-ghost sm" onclick={() => (showReport = true)}><FileBarChart size={14} /> Central de relatórios</button>
</div>

<div class="quick-filters-row">
	<button type="button" class="quick-filter-chip" class:active={quickFilter === 'all'} onclick={() => (quickFilter = 'all')}>Todos</button>
	<button type="button" class="quick-filter-chip" class:active={quickFilter === 'receita'} onclick={() => (quickFilter = 'receita')}>Receitas</button>
	<button type="button" class="quick-filter-chip" class:active={quickFilter === 'despesa'} onclick={() => (quickFilter = 'despesa')}>Despesas</button>
	<button type="button" class="quick-filter-chip" class:active={quickFilter === 'pendente'} onclick={() => (quickFilter = 'pendente')}>Pendentes</button>
	<button type="button" class="filters-more-toggle" onclick={() => (maisFiltrosAbertos = !maisFiltrosAbertos)}>
		Mais filtros
		{#if filtrosAtivosCount}<span class="filters-badge">{filtrosAtivosCount}</span>{/if}
		<span class="filters-more-chevron" class:rotated={maisFiltrosAbertos}><ChevronDown size={14} /></span>
	</button>
	{#if filtrosAtivosCount || quickFilter !== 'all' || query}
		<button type="button" class="btn btn-ghost sm" onclick={limparFiltros}>Limpar filtros</button>
	{/if}
</div>

{#if maisFiltrosAbertos}
	<div class="filters-bar filters-bar--advanced">
		<select bind:value={monthFilter}>
			<option value="all">Todos os meses</option>
			{#each mesesDisponiveis as m}
				<option value={m}>{monthLabel(m)}</option>
			{/each}
		</select>
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
	</div>
{/if}

<div class="card">
	{#if filtered.length === 0}
		<p class="empty">Nenhum lançamento encontrado.</p>
	{:else}
		{#each groupedFiltered as g (g.date)}
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
</div>

<NewMovementModal
	open={modal.open}
	mode={modal.mode}
	transaction={modal.transaction}
	onClose={closeModal}
	onDuplicate={duplicateTransaction}
	onDelete={handleDelete}
	onEditSeries={openEditSeries}
	onManageSeries={manageSeries}
/>
<ReportCenterModal open={showReport} onClose={() => (showReport = false)} />
<TransferModal open={showTransfer} onClose={() => (showTransfer = false)} />

