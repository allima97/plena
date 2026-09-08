<script>
	import { appState, setAlertThresholds } from '$lib/fin/store.svelte.js';
	import { totals, monthTransactions, committedThisMonth, upcomingDue, pausedSeries, nextScheduleDate, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney, fmtDate, monthLabel, monthKey, todayISO } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import Sparkline from '$lib/components/charts/Sparkline.svelte';
	import { Bell, CalendarDays, Plus, ArrowUpRight, ArrowDownRight, TrendingUp, Sparkles } from 'lucide-svelte';

	const MES_ABBR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
	const DOT_PALETTE = ['#e06b5f', '#e0a23f', '#8b78db', '#4a78db', '#23a768', '#2fb7c4', '#c4519a'];

	let showNew = $state(false);
	let contaFiltro = $state('all');
	let tipoFiltro = $state('all');

	function shiftMonthKey(mKey, delta) {
		const [y, m] = mKey.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	const eyebrowDate = $derived.by(() => {
		const d = new Date();
		return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).replace(', ', ' · ');
	});

	const mKey = $derived(currentMonthKey());
	const prevMKey = $derived(shiftMonthKey(mKey, -1));

	const contaTx = $derived(appState.transactions.filter((t) => contaFiltro === 'all' || t.contaId === contaFiltro));
	const baseTx = $derived(contaTx.filter((t) => tipoFiltro === 'all' || t.tipo === tipoFiltro));

	const mesTx = $derived(monthTransactions(baseTx, mKey));
	const prevMesTx = $derived(monthTransactions(baseTx, prevMKey));
	const t = $derived(totals(mesTx));
	const prevT = $derived(totals(prevMesTx));
	const geral = $derived(totals(appState.transactions));

	function saldoAte(dataLimite) {
		return appState.transactions
			.filter((tr) => tr.data <= dataLimite)
			.reduce((s, tr) => s + (tr.tipo === 'receita' ? Number(tr.valor) || 0 : -(Number(tr.valor) || 0)), 0);
	}
	const saldoAtualGeral = $derived(geral.saldo);
	const saldoFimMesAnterior = $derived.by(() => {
		const [y, m] = mKey.split('-').map(Number);
		const lastDayPrev = new Date(y, m - 1, 0);
		const pad = (n) => String(n).padStart(2, '0');
		return saldoAte(`${lastDayPrev.getFullYear()}-${pad(lastDayPrev.getMonth() + 1)}-${pad(lastDayPrev.getDate())}`);
	});
	const saldoDeltaPct = $derived(saldoFimMesAnterior !== 0 ? ((saldoAtualGeral - saldoFimMesAnterior) / Math.abs(saldoFimMesAnterior)) * 100 : 0);

	const sparkValues = $derived.by(() => {
		const out = [];
		for (let i = 5; i >= 0; i--) {
			const k = shiftMonthKey(mKey, -i);
			const tt = totals(monthTransactions(appState.transactions, k));
			out.push(Math.max(1, tt.receitas + tt.despesas));
		}
		return out;
	});

	const comprometido = $derived(committedThisMonth(baseTx, mKey));
	const comprometidoPct = $derived(t.despesas > 0 ? Math.min(100, Math.round((comprometido / t.despesas) * 100)) : 0);
	const entradasDeltaPct = $derived(prevT.receitas > 0 ? ((t.receitas - prevT.receitas) / prevT.receitas) * 100 : null);
	const saidasDeltaPct = $derived(prevT.despesas > 0 ? ((t.despesas - prevT.despesas) / prevT.despesas) * 100 : null);

	const alertas = $derived(upcomingDue(baseTx, appState.alertThresholds));
	const pausadas = $derived(pausedSeries(baseTx));
	const template = $derived(appState.reportTemplates.find((tp) => tp.id === appState.reportSchedule.templateId));

	// fluxo de caixa: últimos 6 meses, respeitando apenas o filtro de conta
	const fluxoData = $derived.by(() => {
		const out = [];
		for (let i = 5; i >= 0; i--) {
			const k = shiftMonthKey(mKey, -i);
			const tt = totals(monthTransactions(contaTx, k));
			const [, mm] = k.split('-').map(Number);
			out.push({ label: MES_ABBR[mm - 1], a: tt.receitas, b: tt.despesas, current: k === mKey });
		}
		return out;
	});

	// distribuição: despesas do mês por categoria (respeitando conta), top 4 + outros
	const distribuicao = $derived.by(() => {
		const despesasMes = monthTransactions(contaTx, mKey).filter((tr) => tr.tipo === 'despesa');
		const map = new Map();
		for (const tr of despesasMes) {
			const cat = appState.categories.find((c) => c.id === tr.categoriaId);
			const nome = cat ? cat.nome : 'Sem categoria';
			map.set(nome, (map.get(nome) || 0) + (Number(tr.valor) || 0));
		}
		const arr = [...map.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
		const top = arr.slice(0, 4);
		const outros = arr.slice(4).reduce((s, c) => s + c.total, 0);
		if (outros > 0) top.push({ nome: 'Outros', total: outros });
		return top;
	});
	const distribuicaoTotal = $derived(distribuicao.reduce((s, c) => s + c.total, 0));

	const recentes = $derived([...baseTx].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5));

	const mediaDespesas3Meses = $derived.by(() => {
		let soma = 0;
		for (let i = 1; i <= 3; i++) soma += totals(monthTransactions(appState.transactions, shiftMonthKey(mKey, -i))).despesas;
		return soma / 3;
	});
	const insight = $derived.by(() => {
		if (t.despesas > 0 && mediaDespesas3Meses > 0 && t.despesas < mediaDespesas3Meses) {
			const pct = Math.round((1 - t.despesas / mediaDespesas3Meses) * 100);
			return { title: 'Você está no caminho certo.', body: `Suas despesas este mês estão ${pct}% abaixo da média dos últimos 3 meses. Se mantiver esse ritmo, o saldo tende a crescer.` };
		}
		if (t.saldo >= 0) {
			return { title: 'Mês positivo até aqui.', body: 'As entradas superam as saídas neste mês. Continue de olho nos vencimentos próximos para manter o ritmo.' };
		}
		return { title: 'Fique de olho nos gastos.', body: 'As saídas superaram as entradas neste mês. Vale revisar as categorias com maior peso em Relatórios.' };
	});

	function updateThreshold(key, value) {
		setAlertThresholds({ [key]: Math.max(1, Number(value) || 1) });
	}
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">{eyebrowDate}</p>
		<h1 class="font-display page-title">Seu dinheiro, em perspectiva.</h1>
		<p class="page-sub">Uma leitura simples do que entrou, do que saiu e do que está por vir neste mês.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showNew = true)}><Plus size={16} /> Novo lançamento</button>
</div>

<div class="dash-filters">
	<select class="field-input" style="height:40px;width:auto" bind:value={contaFiltro}>
		<option value="all">Todas as contas</option>
		{#each appState.accounts as acc (acc.id)}
			<option value={acc.id}>{acc.nome}</option>
		{/each}
	</select>
	<select class="field-input" style="height:40px;width:auto" bind:value={tipoFiltro}>
		<option value="all">Receitas e despesas</option>
		<option value="receita">Só receitas</option>
		<option value="despesa">Só despesas</option>
	</select>
</div>

<section class="alerts-grid">
	<div class="card alerts-card">
		<div class="alerts-head">
			<span class="alerts-icon"><Bell size={18} /></span>
			<div>
				<p class="stat-label">Próximos vencimentos</p>
				<p class="alerts-summary">
					{alertas.total
						? `${alertas.total} lançamento${alertas.total > 1 ? 's' : ''} nos próximos ${appState.alertThresholds.sete} dias`
						: `Nenhum vencimento nos próximos ${appState.alertThresholds.sete} dias`}
				</p>
			</div>
		</div>
		<div class="alerts-thresholds">
			<span>Alertar com antecedência:</span>
			{#each [['um', appState.alertThresholds.um], ['tres', appState.alertThresholds.tres], ['sete', appState.alertThresholds.sete]] as [key, value] (key)}
				<label class="threshold-pill">
					<input type="number" min="1" max="30" {value} oninput={(e) => updateThreshold(key, e.target.value)} />d
				</label>
			{/each}
		</div>
		<div class="alerts-buckets">
			<div class="alert-bucket red">
				<p class="bucket-label">Até {appState.alertThresholds.um} dia(s)</p>
				<p class="font-display bucket-count">{alertas.um.length}</p>
				<p class="bucket-detail">{alertas.um[0]?.descricao || 'Tudo em dia'}</p>
			</div>
			<div class="alert-bucket orange">
				<p class="bucket-label">Até {appState.alertThresholds.tres} dias</p>
				<p class="font-display bucket-count">{alertas.tres.length}</p>
				<p class="bucket-detail">{alertas.tres[0]?.descricao || 'Tudo em dia'}</p>
			</div>
			<div class="alert-bucket yellow">
				<p class="bucket-label">Até {appState.alertThresholds.sete} dias</p>
				<p class="font-display bucket-count">{alertas.sete.length}</p>
				<p class="bucket-detail">{alertas.sete[0]?.descricao || 'Tudo em dia'}</p>
			</div>
		</div>
	</div>

	<div class="card paused-card">
		<span class="alerts-icon purple"><Bell size={18} /></span>
		<div>
			<p class="stat-label">Séries pausadas</p>
			<p class="alerts-summary">
				{pausadas.length
					? `${pausadas.length} série${pausadas.length > 1 ? 's' : ''} precisa${pausadas.length > 1 ? 'm' : ''} de atenção`
					: 'Todas as séries estão ativas'}
			</p>
			{#if pausadas.length}
				<p class="paused-list">{pausadas.map((p) => p.descricao).join(' • ')}</p>
			{/if}
		</div>
	</div>
</section>

<div class="hero-row">
	<div class="balance-hero">
		<div class="balance-hero-label"><span>Saldo disponível</span><TrendingUp size={16} /></div>
		<p class="balance-hero-value privacy-value">{fmtMoney(saldoAtualGeral)}</p>
		<div class="balance-hero-foot">
			<span class="balance-hero-delta" class:down={saldoDeltaPct < 0}>
				{saldoDeltaPct >= 0 ? '↗' : '↘'} {Math.abs(saldoDeltaPct).toFixed(1)}% vs. mês anterior
			</span>
			<Sparkline values={sparkValues} />
		</div>
	</div>
	<div class="mini-stat">
		<div class="mini-stat-top"><span class="stat-label">Entradas no mês</span><span class="mini-stat-dot" style="background:var(--income)"></span></div>
		<p class="mini-stat-value money-in font-display privacy-value">{fmtMoney(t.receitas)}</p>
		{#if entradasDeltaPct !== null}<p class="mini-stat-delta">{entradasDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(entradasDeltaPct).toFixed(1)}% vs. {monthLabel(prevMKey)}</p>{/if}
	</div>
	<div class="mini-stat">
		<div class="mini-stat-top"><span class="stat-label">Saídas no mês</span><span class="mini-stat-dot" style="background:var(--expense)"></span></div>
		<p class="mini-stat-value money-out font-display privacy-value">{fmtMoney(t.despesas)}</p>
		{#if saidasDeltaPct !== null}<p class="mini-stat-delta">{saidasDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(saidasDeltaPct).toFixed(1)}% vs. {monthLabel(prevMKey)}</p>{/if}
	</div>
	<div class="mini-stat">
		<div class="mini-stat-top"><span class="stat-label">Comprometido</span><span class="mini-stat-dot" style="background:var(--purple)"></span></div>
		<p class="mini-stat-value font-display privacy-value">{fmtMoney(comprometido)}</p>
		<p class="mini-stat-delta">{comprometidoPct}% das despesas do mês</p>
		<div class="mini-progress-track"><div class="mini-progress-fill" style="width:{comprometidoPct}%;background:var(--purple)"></div></div>
	</div>
</div>

<div class="charts-row">
	<div class="card">
		<div class="chart-card-head">
			<div>
				<p class="stat-label" style="margin:0">Fluxo de caixa</p>
				<p class="font-display privacy-value" style="margin:6px 0 0;font-size:20px">{fmtMoney(t.receitas)}</p>
			</div>
			<div class="chart-legend">
				<span><span class="legend-dot" style="background:#4dcc8c"></span>Entradas</span>
				<span><span class="legend-dot" style="background:#f18c7e"></span>Saídas</span>
			</div>
		</div>
		<BarChart data={fluxoData} />
	</div>
	<div class="card">
		<div class="chart-card-head">
			<p class="stat-label" style="margin:0">Distribuição</p>
			<span class="page-sub" style="margin:0">Para onde vai?</span>
		</div>
		{#if distribuicao.length}
			<div class="donut-wrap">
				<DonutChart
					slices={distribuicao.map((c, i) => ({ label: c.nome, value: c.total, color: DOT_PALETTE[i % DOT_PALETTE.length] }))}
					centerLabel="Total"
					centerValue={fmtMoney(distribuicaoTotal)}
				/>
				<div class="donut-legend">
					{#each distribuicao as c, i (c.nome)}
						<div class="donut-legend-row">
							<span class="donut-legend-name"><span class="legend-dot" style="background:{DOT_PALETTE[i % DOT_PALETTE.length]}"></span>{c.nome}</span>
							<span class="donut-legend-pct">{distribuicaoTotal ? Math.round((c.total / distribuicaoTotal) * 100) : 0}%</span>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<p class="empty">Sem despesas neste mês.</p>
		{/if}
	</div>
</div>

<div class="card schedule-card" class:on={appState.reportSchedule.ativo && template}>
	<span class="alerts-icon" class:green={appState.reportSchedule.ativo && template}><CalendarDays size={18} /></span>
	<div>
		<div class="schedule-head">
			<p class="stat-label">Próxima exportação automática</p>
			<span class="badge" class:badge-green={appState.reportSchedule.ativo && template} class:badge-gray={!(appState.reportSchedule.ativo && template)}>
				{appState.reportSchedule.ativo && template ? 'Agendada' : 'Não configurada'}
			</span>
		</div>
		{#if appState.reportSchedule.ativo && template}
			<p class="alerts-summary">{nextScheduleDate(appState.reportSchedule)} às {appState.reportSchedule.hora}</p>
			<p class="paused-list">Modelo: {template.nome} · filtros salvos serão usados na exportação.</p>
		{:else}
			<p class="alerts-summary">Configure um modelo mensal no centro de relatórios, em Movimentações.</p>
		{/if}
	</div>
</div>

<div class="feed-row">
	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0">Movimentações recentes</p>
			<a class="link-more" href="/movimentacoes">Ver todas ↗</a>
		</div>
		{#if recentes.length}
			{#each recentes as tr (tr.id)}
				{@const conta = appState.accounts.find((a) => a.id === tr.contaId)}
				<div class="feed-row-item">
					<span class="type-icon" class:income={tr.tipo === 'receita'}>
						{#if tr.tipo === 'receita'}<ArrowUpRight size={16} />{:else}<ArrowDownRight size={16} />{/if}
					</span>
					<div class="feed-row-info">
						<p class="feed-row-name">{tr.descricao || 'Lançamento'}</p>
						<p class="feed-row-meta">{appState.categories.find((c) => c.id === tr.categoriaId)?.nome || 'Sem categoria'} · {conta?.nome || 'Sem conta'}</p>
					</div>
					<div class="feed-row-amount">
						<p class="privacy-value" class:money-in={tr.tipo === 'receita'} class:money-out={tr.tipo === 'despesa'}>{tr.tipo === 'receita' ? '+' : '−'} {fmtMoney(tr.valor)}</p>
						<p class="feed-row-date">{fmtDate(tr.data)}</p>
					</div>
				</div>
			{/each}
		{:else}
			<p class="empty">Nenhuma movimentação ainda.</p>
		{/if}
	</div>
	<div class="insight-card">
		<Sparkles size={20} color="var(--accent-fg)" />
		<p class="insight-eyebrow" style="margin-top:14px">Insight do mês</p>
		<h3 class="insight-title">{insight.title}</h3>
		<p class="insight-body">{insight.body}</p>
		<a class="insight-link" href="/relatorios">Explorar relatório ↗</a>
	</div>
</div>

<NewMovementModal open={showNew} onClose={() => (showNew = false)} />
