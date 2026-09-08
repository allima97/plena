<script>
	import { appState } from '$lib/fin/store.svelte.js';
	import { monthTransactions, totals, byCategory, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney, monthKey, monthLabel, yearKey, todayISO } from '$lib/format.js';
	import ReportCenterModal from '$lib/components/ReportCenterModal.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import { FileBarChart, CheckCircle2, AlertTriangle } from 'lucide-svelte';

	const MES_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

	let periodo = $state('mensal');
	let anoSelecionado = $state(Number(yearKey(todayISO())));
	let mesSelecionado = $state(currentMonthKey());
	let showReport = $state(false);

	const anosDisponiveis = $derived.by(() => {
		const set = new Set(appState.transactions.map((t) => Number(yearKey(t.data))));
		set.add(Number(yearKey(todayISO())));
		return [...set].sort((a, b) => b - a);
	});

	function txDoAno(ano) {
		return appState.transactions.filter((t) => Number(yearKey(t.data)) === ano);
	}

	const evolucaoMensal = $derived.by(() => {
		const anoTx = txDoAno(anoSelecionado);
		const out = [];
		for (let m = 1; m <= 12; m++) {
			const k = `${anoSelecionado}-${String(m).padStart(2, '0')}`;
			const tt = totals(anoTx.filter((t) => monthKey(t.data) === k));
			out.push({ label: MES_ABBR[m - 1], a: tt.receitas, b: tt.despesas, current: k === currentMonthKey() });
		}
		return out;
	});

	const evolucaoTrimestral = $derived.by(() => {
		const anoTx = txDoAno(anoSelecionado);
		const nomes = ['1º trim.', '2º trim.', '3º trim.', '4º trim.'];
		const mesAtual = Number(currentMonthKey().split('-')[1]);
		return nomes.map((label, i) => {
			const meses = [i * 3 + 1, i * 3 + 2, i * 3 + 3];
			const tt = totals(anoTx.filter((t) => meses.includes(Number(monthKey(t.data).split('-')[1]))));
			return { label, a: tt.receitas, b: tt.despesas, current: meses.includes(mesAtual) && anoSelecionado === Number(yearKey(todayISO())) };
		});
	});

	const evolucaoAnual = $derived.by(() => {
		const anoAtual = Number(yearKey(todayISO()));
		const anos = [];
		for (let i = 4; i >= 0; i--) anos.push(anoAtual - i);
		return anos.map((ano) => {
			const tt = totals(txDoAno(ano));
			return { label: String(ano), a: tt.receitas, b: tt.despesas, current: ano === anoAtual };
		});
	});

	const chartData = $derived(periodo === 'mensal' ? evolucaoMensal : periodo === 'trimestral' ? evolucaoTrimestral : evolucaoAnual);
	const chartTitle = $derived(periodo === 'anual' ? 'Evolução anual' : 'Evolução mensal');

	const totaisPeriodo = $derived.by(() => {
		const rows = periodo === 'anual' ? evolucaoAnual : chartData;
		return rows.reduce((s, r) => ({ receitas: s.receitas + r.a, despesas: s.despesas + r.b }), { receitas: 0, despesas: 0 });
	});

	// leituras rápidas
	const mesAtualTx = $derived(monthTransactions(appState.transactions, currentMonthKey()));
	const totalMesAtual = $derived(totals(mesAtualTx));
	const cartoes = $derived(appState.accounts.filter((a) => a.tipo === 'cartao'));
	const usoCartoes = $derived.by(() => {
		const limiteTotal = cartoes.reduce((s, a) => s + (Number(a.limite) || 0), 0);
		const usoTotal = cartoes.reduce((s, a) => {
			const fatura = mesAtualTx.filter((t) => t.contaId === a.id && t.tipo === 'despesa').reduce((sum, t) => sum + (Number(t.valor) || 0), 0);
			return s + fatura;
		}, 0);
		return limiteTotal > 0 ? Math.round((usoTotal / limiteTotal) * 100) : null;
	});
	const maiorReceita = $derived(byCategory(mesAtualTx, appState.categories, 'receita')[0]);

	// detalhamento por categoria (mês específico, independente do período acima)
	const mesesDisponiveis = $derived.by(() => {
		const set = new Set(appState.transactions.map((t) => monthKey(t.data)));
		set.add(currentMonthKey());
		return [...set].sort().reverse();
	});
	const mesTx = $derived(monthTransactions(appState.transactions, mesSelecionado));
	const tMes = $derived(totals(mesTx));
	const despesasPorCategoria = $derived(byCategory(mesTx, appState.categories, 'despesa'));
	const receitasPorCategoria = $derived(byCategory(mesTx, appState.categories, 'receita'));
	const maxDespesa = $derived(Math.max(1, ...despesasPorCategoria.map((c) => c.total)));
	const maxReceita = $derived(Math.max(1, ...receitasPorCategoria.map((c) => c.total)));
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Análise financeira</p>
		<h1 class="font-display page-title">Decisões melhores começam aqui.</h1>
		<p class="page-sub">Enxergue seus padrões por dia, mês ou ano e transforme movimentação em próximos passos.</p>
	</div>
	<button class="btn" onclick={() => (showReport = true)}><FileBarChart size={16} /> Exportar relatório</button>
</div>

<div class="actions-row" style="margin-bottom:20px">
	<div class="period-tabs">
		<button type="button" class:active={periodo === 'mensal'} onclick={() => (periodo = 'mensal')}>Mensal</button>
		<button type="button" class:active={periodo === 'trimestral'} onclick={() => (periodo = 'trimestral')}>Trimestral</button>
		<button type="button" class:active={periodo === 'anual'} onclick={() => (periodo = 'anual')}>Anual</button>
	</div>
	{#if periodo !== 'anual'}
		<select class="field-input" style="height:38px;width:auto" bind:value={anoSelecionado}>
			{#each anosDisponiveis as a}<option value={a}>{a}</option>{/each}
		</select>
	{/if}
</div>

<div class="charts-row" style="grid-template-columns:1.6fr 1fr">
	<div class="card">
		<div class="chart-card-head">
			<div>
				<p class="stat-label" style="margin:0">Resumo de {periodo === 'anual' ? 'últimos anos' : anoSelecionado}</p>
				<p class="font-display" style="margin:6px 0 0;font-size:20px">{chartTitle}</p>
			</div>
			<div class="chart-legend">
				<span><span class="legend-dot" style="background:#4dcc8c"></span>Receitas</span>
				<span><span class="legend-dot" style="background:#f18c7e"></span>Despesas</span>
			</div>
		</div>
		<BarChart data={chartData} height={240} />
	</div>
	<div class="card">
		<p class="stat-label" style="margin-bottom:14px">Leituras rápidas</p>
		<p class="font-display" style="margin:0 0 14px;font-size:16px">O que merece atenção</p>
		<div class="insights-list">
			<div class="insight-row">
				<span class="insight-row-icon" class:bad={totalMesAtual.saldo < 0}>{#if totalMesAtual.saldo >= 0}<CheckCircle2 size={16} />{:else}<AlertTriangle size={16} />{/if}</span>
				<div>
					<p class="insight-row-title">{totalMesAtual.saldo >= 0 ? 'Saldo positivo' : 'Saldo negativo'}</p>
					<p class="insight-row-desc">{totalMesAtual.saldo >= 0 ? 'Entradas superam saídas neste mês.' : 'Saídas superam entradas neste mês.'}</p>
				</div>
			</div>
			{#if usoCartoes !== null}
				<div class="insight-row">
					<span class="insight-row-icon" class:warn={usoCartoes > 70}>{#if usoCartoes <= 70}<CheckCircle2 size={16} />{:else}<AlertTriangle size={16} />{/if}</span>
					<div>
						<p class="insight-row-title">Cartões {usoCartoes > 70 ? 'no limite' : 'em dia'}</p>
						<p class="insight-row-desc">{usoCartoes}% do limite total está em uso.</p>
					</div>
				</div>
			{/if}
			{#if maiorReceita}
				<div class="insight-row">
					<span class="insight-row-icon"><CheckCircle2 size={16} /></span>
					<div>
						<p class="insight-row-title">Maior origem de receita</p>
						<p class="insight-row-desc">{fmtMoney(maiorReceita.total)} vieram de {maiorReceita.nome}.</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<div class="grid-cards">
	<div class="stat-card">
		<p class="stat-label">Total de entradas</p>
		<p class="font-display stat-value money-in">{fmtMoney(totaisPeriodo.receitas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Total de saídas</p>
		<p class="font-display stat-value money-out">{fmtMoney(totaisPeriodo.despesas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Saldo acumulado</p>
		<p class="font-display stat-value">{fmtMoney(totaisPeriodo.receitas - totaisPeriodo.despesas)}</p>
	</div>
</div>

<div class="page-head" style="margin-top:6px">
	<div>
		<p class="font-display" style="margin:0;font-size:18px">Detalhamento por categoria</p>
		<p class="page-sub">Panorama de um mês específico.</p>
	</div>
	<select class="field-input" style="height:40px;width:auto" bind:value={mesSelecionado}>
		{#each mesesDisponiveis as m}<option value={m}>{monthLabel(m)}</option>{/each}
	</select>
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
