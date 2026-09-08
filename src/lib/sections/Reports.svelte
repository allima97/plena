<script>
	import { appState } from '$lib/fin/store.svelte.js';
	import { monthTransactions, totals, byCategory, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney, monthKey, monthLabel, todayISO } from '$lib/format.js';
	import ReportCenterModal from '$lib/components/ReportCenterModal.svelte';
	import { FileBarChart } from 'lucide-svelte';

	let mesSelecionado = $state(currentMonthKey());
	let showReport = $state(false);

	const mesesDisponiveis = $derived(
		[...new Set(appState.transactions.map((t) => monthKey(t.data)))].sort().reverse().length
			? [...new Set(appState.transactions.map((t) => monthKey(t.data)))].sort().reverse()
			: [currentMonthKey()]
	);

	const mesTx = $derived(monthTransactions(appState.transactions, mesSelecionado));
	const t = $derived(totals(mesTx));
	const despesasPorCategoria = $derived(byCategory(mesTx, appState.categories, 'despesa'));
	const receitasPorCategoria = $derived(byCategory(mesTx, appState.categories, 'receita'));
	const maxDespesa = $derived(Math.max(1, ...despesasPorCategoria.map((c) => c.total)));
	const maxReceita = $derived(Math.max(1, ...receitasPorCategoria.map((c) => c.total)));
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Relatórios</h1>
		<p class="page-sub">Panorama por categoria — use o centro de relatórios para exportar em CSV ou PDF.</p>
	</div>
	<div class="actions-row">
		<select class="field-input" style="height:40px;width:auto" value={mesSelecionado} onchange={(e) => (mesSelecionado = e.target.value)}>
			{#each mesesDisponiveis as m}
				<option value={m}>{monthLabel(m)}</option>
			{/each}
		</select>
		<button class="btn btn-primary" onclick={() => (showReport = true)}><FileBarChart size={16} /> Exportar relatório</button>
	</div>
</div>

<div class="grid-cards">
	<div class="stat-card">
		<p class="stat-label">Receitas</p>
		<p class="font-display stat-value money-in">{fmtMoney(t.receitas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Despesas</p>
		<p class="font-display stat-value money-out">{fmtMoney(t.despesas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Saldo do mês</p>
		<p class="font-display stat-value">{fmtMoney(t.saldo)}</p>
	</div>
</div>

<div class="grid-cards" style="grid-template-columns:1fr 1fr">
	<div class="card">
		<p class="stat-label" style="margin-bottom:16px">Despesas por categoria</p>
		{#if despesasPorCategoria.length}
			<div class="bar-list">
				{#each despesasPorCategoria as c (c.nome)}
					<div class="bar-row">
						<span class="bar-label">{c.nome}</span>
						<div class="bar-track"><div class="bar-fill" style="width:{(c.total / maxDespesa) * 100}%"></div></div>
						<span class="bar-value">{fmtMoney(c.total)}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">Sem despesas neste mês.</p>
		{/if}
	</div>
	<div class="card">
		<p class="stat-label" style="margin-bottom:16px">Receitas por categoria</p>
		{#if receitasPorCategoria.length}
			<div class="bar-list">
				{#each receitasPorCategoria as c (c.nome)}
					<div class="bar-row">
						<span class="bar-label">{c.nome}</span>
						<div class="bar-track"><div class="bar-fill" style="width:{(c.total / maxReceita) * 100}%;background:var(--income-bar-hover)"></div></div>
						<span class="bar-value">{fmtMoney(c.total)}</span>
					</div>
				{/each}
			</div>
		{:else}
			<p class="empty">Sem receitas neste mês.</p>
		{/if}
	</div>
</div>

<ReportCenterModal open={showReport} onClose={() => (showReport = false)} />
