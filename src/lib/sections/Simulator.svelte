<script>
	import { appState } from '$lib/fin/store.svelte.js';
	import { totals, monthTransactions, currentMonthKey } from '$lib/fin/derived.js';
	import { computeMetrics } from '$lib/goals/metrics.js';
	import { fmtMoney } from '$lib/format.js';
	import { Wand2 } from 'lucide-svelte';

	function shiftMonthKey(mKey, delta) {
		const [y, m] = mKey.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}
	function addMonthsF(date, months) {
		const d = new Date(date);
		d.setMonth(d.getMonth() + Math.round(months));
		return d;
	}
	function fmtMonthYear(date) {
		if (!date) return '--';
		return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
	}

	const startDay = $derived(appState.settings.monthStartDay || 1);

	// Médias dos últimos 3 meses fechados -- mesma janela usada no motor de insights, mas
	// calculada aqui localmente pois lá é uma função privada do módulo.
	const mediaDespesas3Meses = $derived.by(() => {
		const mKey = currentMonthKey(startDay);
		let soma = 0;
		for (let i = 1; i <= 3; i++) soma += totals(monthTransactions(appState.transactions, shiftMonthKey(mKey, -i), startDay)).despesas;
		return soma / 3;
	});
	const mediaReceitas3Meses = $derived.by(() => {
		const mKey = currentMonthKey(startDay);
		let soma = 0;
		for (let i = 1; i <= 3; i++) soma += totals(monthTransactions(appState.transactions, shiftMonthKey(mKey, -i), startDay)).receitas;
		return soma / 3;
	});
	const taxaPoupancaAtual = $derived(mediaReceitas3Meses > 0 ? ((mediaReceitas3Meses - mediaDespesas3Meses) / mediaReceitas3Meses) * 100 : null);

	// --- Cenário A: gastar menos por mês -----------------------------------
	let gastaMenosInput = $state('');
	const gastaMenosValor = $derived(Number(gastaMenosInput) || 0);
	const cenarioGastarMenos = $derived.by(() => {
		const novaDespesa = Math.max(0, mediaDespesas3Meses - gastaMenosValor);
		const novaTaxa = mediaReceitas3Meses > 0 ? ((mediaReceitas3Meses - novaDespesa) / mediaReceitas3Meses) * 100 : null;
		const guardadoAnoHoje = (mediaReceitas3Meses - mediaDespesas3Meses) * 12;
		const guardadoAnoNovo = guardadoAnoHoje + gastaMenosValor * 12;
		return {
			economiaAno: gastaMenosValor * 12,
			taxaAtual: taxaPoupancaAtual,
			taxaNova: novaTaxa,
			guardadoAnoHoje,
			guardadoAnoNovo
		};
	});

	// --- Cenário B: aportar mais numa meta ----------------------------------
	const metasParaAporte = $derived(
		appState.goals
			.filter((g) => !g.archived && g.type !== 'financiamento')
			.map((g) => ({
				goal: g,
				m: computeMetrics(g, {
					resources: appState.resources,
					resourceMoves: appState.resourceMoves,
					goalCategories: appState.goalCategories,
					installments: appState.installments,
					amortizations: appState.amortizations
				})
			}))
			.filter(({ m }) => m.remaining > 0.005)
	);
	let metaSelecionadaId = $state(null);
	let aporteExtraInput = $state('');
	const metaSelecionada = $derived(metasParaAporte.find((x) => x.goal.id === metaSelecionadaId) || metasParaAporte[0] || null);
	const cenarioAporte = $derived.by(() => {
		if (!metaSelecionada) return null;
		const extra = Number(aporteExtraInput) || 0;
		const { m } = metaSelecionada;
		const novoPace = m.combinedPace + extra;
		const mesesNovos = novoPace > 0 ? m.remaining / novoPace : null;
		const dataNova = mesesNovos !== null ? addMonthsF(new Date(), mesesNovos) : null;
		const mesesAntes =
			m.projectedMonths != null && mesesNovos !== null ? Math.round(m.projectedMonths - mesesNovos) : null;
		return { dataAtual: m.projectedDate, dataNova, semRitmoAtual: m.combinedPace <= 0, mesesAntes };
	});

	// --- Cenário C: renda cai X% ---------------------------------------------
	let rendaCaiInput = $state('');
	const cenarioRenda = $derived.by(() => {
		const pct = Number(rendaCaiInput) || 0;
		const novaReceita = mediaReceitas3Meses * (1 - pct / 100);
		const novoSaldo = novaReceita - mediaDespesas3Meses;
		const saldoAtual = mediaReceitas3Meses - mediaDespesas3Meses;
		return { novaReceita, novoSaldo, saldoAtual };
	});
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Planejamento</p>
		<h1 class="font-display page-title">E se...?</h1>
		<p class="page-sub">Simule decisões antes de tomá-las, com base no seu histórico real dos últimos meses.</p>
	</div>
</div>

<div class="card" style="margin-bottom:16px">
	<div class="feed-list-head">
		<p class="stat-label" style="margin:0"><Wand2 size={14} style="vertical-align:-2px;margin-right:5px" />E se eu gastar menos por mês?</p>
	</div>
	<div class="form-grid">
		<label class="field">
			<span>Quanto a menos por mês?</span>
			<input class="field-input" type="number" min="0" step="10" placeholder="Ex.: 300" bind:value={gastaMenosInput} />
		</label>
	</div>
	{#if gastaMenosValor > 0}
		<div class="week-summary-grid" style="margin-top:14px">
			<div class="week-summary-item">
				<p class="week-summary-label">Hoje</p>
				<p class="week-summary-value privacy-value">{fmtMoney(cenarioGastarMenos.guardadoAnoHoje)}/ano</p>
			</div>
			<div class="week-summary-item">
				<p class="week-summary-label">Com a decisão</p>
				<p class="week-summary-value privacy-value">{fmtMoney(cenarioGastarMenos.guardadoAnoNovo)}/ano</p>
			</div>
			<div class="week-summary-item">
				<p class="week-summary-label">Diferença</p>
				<p class="week-summary-value money-in privacy-value">+{fmtMoney(cenarioGastarMenos.economiaAno)}/ano</p>
			</div>
		</div>
		{#if cenarioGastarMenos.taxaAtual !== null}
			<p class="sim-verdict">Sua taxa de poupança vai de <b>{cenarioGastarMenos.taxaAtual.toFixed(1)}%</b> para <b>{cenarioGastarMenos.taxaNova.toFixed(1)}%</b>.</p>
		{/if}
	{/if}
</div>

<div class="card" style="margin-bottom:16px">
	<div class="feed-list-head">
		<p class="stat-label" style="margin:0"><Wand2 size={14} style="vertical-align:-2px;margin-right:5px" />E se eu aportar mais numa meta?</p>
	</div>
	{#if metasParaAporte.length}
		<div class="form-grid">
			<label class="field">
				<span>Meta</span>
				<select class="field-input" bind:value={metaSelecionadaId}>
					{#each metasParaAporte as { goal } (goal.id)}
						<option value={goal.id}>{goal.name}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Aporte extra por mês</span>
				<input class="field-input" type="number" min="0" step="10" placeholder="Ex.: 500" bind:value={aporteExtraInput} />
			</label>
		</div>
		{#if cenarioAporte && Number(aporteExtraInput) > 0}
			<div class="week-summary-grid" style="margin-top:14px">
				<div class="week-summary-item">
					<p class="week-summary-label">Hoje</p>
					<p class="week-summary-value">{cenarioAporte.semRitmoAtual ? 'sem ritmo definido' : fmtMonthYear(cenarioAporte.dataAtual)}</p>
				</div>
				<div class="week-summary-item">
					<p class="week-summary-label">Com a decisão</p>
					<p class="week-summary-value">{fmtMonthYear(cenarioAporte.dataNova)}</p>
				</div>
				{#if cenarioAporte.mesesAntes !== null && cenarioAporte.mesesAntes > 0}
					<div class="week-summary-item">
						<p class="week-summary-label">Diferença</p>
						<p class="week-summary-value money-in">{cenarioAporte.mesesAntes} {cenarioAporte.mesesAntes === 1 ? 'mês' : 'meses'}</p>
					</div>
				{/if}
			</div>
			{#if cenarioAporte.mesesAntes !== null && cenarioAporte.mesesAntes > 0}
				<p class="sim-verdict">Você chegaria <b>{cenarioAporte.mesesAntes} {cenarioAporte.mesesAntes === 1 ? 'mês' : 'meses'} antes</b> na meta "{metaSelecionada.goal.name}".</p>
			{/if}
		{/if}
	{:else}
		<p class="empty">Nenhuma meta em aberto para simular (financiamentos usam o simulador de amortização, na página do objetivo).</p>
	{/if}
</div>

<div class="card" style="margin-bottom:16px">
	<div class="feed-list-head">
		<p class="stat-label" style="margin:0"><Wand2 size={14} style="vertical-align:-2px;margin-right:5px" />E se minha renda cair?</p>
	</div>
	<div class="form-grid">
		<label class="field">
			<span>Queda de renda (%)</span>
			<input class="field-input" type="number" min="0" max="100" step="1" placeholder="Ex.: 10" bind:value={rendaCaiInput} />
		</label>
	</div>
	{#if Number(rendaCaiInput) > 0}
		<div class="week-summary-grid" style="margin-top:14px">
			<div class="week-summary-item">
				<p class="week-summary-label">Hoje</p>
				<p class="week-summary-value privacy-value" class:down={cenarioRenda.saldoAtual < 0}>{fmtMoney(cenarioRenda.saldoAtual)}/mês</p>
			</div>
			<div class="week-summary-item">
				<p class="week-summary-label">Com a decisão</p>
				<p class="week-summary-value privacy-value" class:down={cenarioRenda.novoSaldo < 0}>{fmtMoney(cenarioRenda.novoSaldo)}/mês</p>
			</div>
			<div class="week-summary-item">
				<p class="week-summary-label">Diferença</p>
				<p class="week-summary-value money-out privacy-value">{fmtMoney(cenarioRenda.novoSaldo - cenarioRenda.saldoAtual)}/mês</p>
			</div>
		</div>
		{#if cenarioRenda.novoSaldo < 0 && cenarioRenda.saldoAtual >= 0}
			<p class="sim-verdict" style="color:var(--expense)">Esse cenário deixaria seu mês negativo.</p>
		{:else if cenarioRenda.novoSaldo < 0}
			<p class="sim-verdict" style="color:var(--expense)">Seu mês já ficaria ainda mais negativo.</p>
		{:else}
			<p class="sim-verdict">Seu mês continuaria positivo, mesmo com a queda.</p>
		{/if}
	{/if}
</div>

<p class="page-sub">
	Quer simular uma amortização de financiamento? Isso já está disponível direto no <a class="link-more" href="/objetivos">objetivo do financiamento</a>, com taxa estimada e comparação de cenários de aporte.
</p>
