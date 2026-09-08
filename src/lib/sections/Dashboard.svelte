<script>
	import { appState, setAlertThresholds } from '$lib/fin/store.svelte.js';
	import { totals, monthTransactions, committedThisMonth, upcomingDue, pausedSeries, nextScheduleDate, byCategory, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney, monthLabel } from '$lib/format.js';
	import NewMovementModal from '$lib/components/NewMovementModal.svelte';
	import { Bell, CalendarDays, Plus } from 'lucide-svelte';

	let showNew = $state(false);

	const mKey = $derived(currentMonthKey());
	const mesTx = $derived(monthTransactions(appState.transactions, mKey));
	const t = $derived(totals(mesTx));
	const geral = $derived(totals(appState.transactions));
	const comprometido = $derived(committedThisMonth(appState.transactions, mKey));
	const alertas = $derived(upcomingDue(appState.transactions, appState.alertThresholds));
	const pausadas = $derived(pausedSeries(appState.transactions));
	const template = $derived(appState.reportTemplates.find((tp) => tp.id === appState.reportSchedule.templateId));
	const topDespesas = $derived(byCategory(mesTx, appState.categories, 'despesa').slice(0, 5));
	const maxDespesa = $derived(Math.max(1, ...topDespesas.map((c) => c.total)));

	function updateThreshold(key, value) {
		setAlertThresholds({ [key]: Math.max(1, Number(value) || 1) });
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Visão geral</h1>
		<p class="page-sub">{monthLabel(mKey)}</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showNew = true)}><Plus size={16} /> Novo lançamento</button>
</div>

<div class="grid-cards">
	<div class="stat-card">
		<p class="stat-label">Saldo total</p>
		<p class="font-display stat-value">{fmtMoney(geral.saldo)}</p>
		<p class="stat-sub">Considerando todos os lançamentos</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Receitas do mês</p>
		<p class="font-display stat-value money-in">{fmtMoney(t.receitas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Despesas do mês</p>
		<p class="font-display stat-value money-out">{fmtMoney(t.despesas)}</p>
	</div>
	<div class="stat-card">
		<p class="stat-label">Comprometido no mês</p>
		<p class="font-display stat-value">{fmtMoney(comprometido)}</p>
		<p class="stat-sub">Parcelamentos + recorrências ativas</p>
	</div>
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

{#if topDespesas.length}
	<div class="card">
		<p class="stat-label" style="margin-bottom:16px">Maiores despesas do mês por categoria</p>
		<div class="bar-list">
			{#each topDespesas as c (c.nome)}
				<div class="bar-row">
					<span class="bar-label">{c.nome}</span>
					<div class="bar-track">
						<div class="bar-fill" style="width:{(c.total / maxDespesa) * 100}%"></div>
					</div>
					<span class="bar-value">{fmtMoney(c.total)}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<NewMovementModal open={showNew} onClose={() => (showNew = false)} />
