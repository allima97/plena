<script>
	import { appState, addPatrimonyItem, updatePatrimonyItem, removePatrimonyItem, upsertPatrimonySnapshot } from '$lib/fin/store.svelte.js';
	import { currentMonthKey, faturaDoCartao } from '$lib/fin/derived.js';
	import { fmtMoney } from '$lib/format.js';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import { Plus, Landmark, TrendingUp, TrendingDown, Wallet, Building2, MoreHorizontal } from 'lucide-svelte';

	const MES_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
	const TIPO_LABELS = { investimento: 'Investimento', imovel: 'Imóvel', outro: 'Outro ativo' };

	let showModal = $state(false);
	let editing = $state(null);
	let deleting = $state(null);
	let menuOpenId = $state(null);

	function blank() {
		return { tipo: 'investimento', nome: '', valor: '' };
	}
	let form = $state(blank());

	function openNew() {
		editing = null;
		form = blank();
		showModal = true;
	}
	function openEdit(item) {
		editing = item;
		form = { tipo: item.tipo, nome: item.nome, valor: item.valor };
		showModal = true;
		menuOpenId = null;
	}
	function submit(e) {
		e.preventDefault();
		if (!form.nome.trim() || !form.valor) return;
		const data = { tipo: form.tipo, nome: form.nome.trim(), valor: Number(form.valor) || 0 };
		if (editing) updatePatrimonyItem(editing.id, data);
		else addPatrimonyItem(data);
		showModal = false;
	}

	function saldoConta(acc) {
		const receitas = appState.transactions.filter((t) => t.contaId === acc.id && t.tipo === 'receita').reduce((s, t) => s + (Number(t.valor) || 0), 0);
		const despesas = appState.transactions.filter((t) => t.contaId === acc.id && t.tipo === 'despesa').reduce((s, t) => s + (Number(t.valor) || 0), 0);
		return (acc.saldoInicial || 0) + receitas - despesas;
	}

	const contas = $derived(appState.accounts.filter((a) => a.tipo === 'conta'));
	const cartoes = $derived(appState.accounts.filter((a) => a.tipo === 'cartao'));

	const contasSaldoTotal = $derived(contas.reduce((s, a) => s + saldoConta(a), 0));

	const cartaoFaturas = $derived(cartoes.map((acc) => ({ acc, valor: faturaDoCartao(appState.transactions, acc) })));
	const cartaoFaturasTotal = $derived(cartaoFaturas.reduce((s, c) => s + c.valor, 0));

	// Dívidas de financiamento: reaproveita o saldo devedor já rastreado nas prestações de cada
	// objetivo do tipo "financiamento" -- não duplica esse dado em um novo cadastro.
	const financiamentos = $derived.by(() => {
		return appState.goals
			.filter((g) => g.type === 'financiamento' && !g.archived)
			.map((g) => {
				// Deduplica por número (guarda contra prestações duplicadas por um envio repetido
				// no formulário) antes de pegar a mais recente, mesma proteção de installmentsWithDelta.
				const byNumber = new Map();
				for (const i of appState.installments) if (i.goalId === g.id) byNumber.set(i.number, i);
				const inst = [...byNumber.values()].sort((a, b) => a.number - b.number);
				const latest = inst.length ? inst[inst.length - 1] : null;
				return { goal: g, saldoDevedor: latest ? latest.saldoDevedor : 0 };
			})
			.filter((f) => f.saldoDevedor > 0.005);
	});
	const financiamentosTotal = $derived(financiamentos.reduce((s, f) => s + f.saldoDevedor, 0));

	const patrimonyItemsTotal = $derived(appState.patrimonyItems.reduce((s, p) => s + (Number(p.valor) || 0), 0));

	const ativosTotal = $derived(contasSaldoTotal + patrimonyItemsTotal);
	const passivosTotal = $derived(financiamentosTotal + cartaoFaturasTotal);
	const patrimonioLiquido = $derived(ativosTotal - passivosTotal);

	const donutSlices = $derived([
		{ label: 'Contas', value: Math.max(contasSaldoTotal, 0), color: '#4a78db' },
		{ label: 'Investimentos', value: Math.max(patrimonyItemsTotal, 0), color: '#23a768' },
		{ label: 'Dívidas', value: Math.max(passivosTotal, 0), color: '#e06b5f' }
	]);

	// Registra (ou atualiza) o retrato do mês corrente sempre que os totais mudam -- constrói o
	// histórico de evolução patrimonial organicamente, conforme o usuário usa o app.
	$effect(() => {
		if (!appState.ready) return;
		upsertPatrimonySnapshot(currentMonthKey(), {
			valor: patrimonioLiquido,
			ativos: ativosTotal,
			passivos: passivosTotal
		});
	});

	const evolucaoData = $derived.by(() => {
		const ordered = [...appState.patrimonySnapshots].sort((a, b) => a.mKey.localeCompare(b.mKey)).slice(-12);
		return ordered.map((s) => {
			const [, m] = s.mKey.split('-');
			return { label: MES_ABBR[Number(m) - 1] || s.mKey, a: s.valor, b: 0, current: s.mKey === currentMonthKey() };
		});
	});
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Patrimônio</p>
		<h1 class="font-display page-title">Seu patrimônio líquido, num só lugar.</h1>
		<p class="page-sub">Contas, investimentos e dívidas reunidos para você ver o quadro completo.</p>
	</div>
	<button class="btn btn-primary" onclick={openNew}><Plus size={16} /> Novo ativo</button>
</div>

<div class="patrimony-hero-row">
	<div class="card patrimony-hero-card">
		<p class="stat-label" style="margin:0">Patrimônio líquido</p>
		<p class="patrimony-hero-value privacy-value" class:negative={patrimonioLiquido < 0}>{fmtMoney(patrimonioLiquido)}</p>
		<div class="patrimony-hero-split">
			<span class="patrimony-hero-chip good"><TrendingUp size={14} /> Ativos <b class="privacy-value">{fmtMoney(ativosTotal)}</b></span>
			<span class="patrimony-hero-chip bad"><TrendingDown size={14} /> Dívidas <b class="privacy-value">{fmtMoney(passivosTotal)}</b></span>
		</div>
		{#if evolucaoData.length > 1}
			<div class="patrimony-evolution">
				<p class="stat-label" style="margin:0 0 6px">Evolução patrimonial</p>
				<BarChart data={evolucaoData} height={140} colorA="#c7d7f5" colorAActive="#4a78db" />
			</div>
		{/if}
	</div>
	<div class="card patrimony-donut-card">
		<p class="stat-label" style="margin:0 0 12px">Composição</p>
		<DonutChart slices={donutSlices} centerLabel="Líquido" centerValue={fmtMoney(patrimonioLiquido)} />
		<div class="patrimony-donut-legend">
			{#each donutSlices as s (s.label)}
				<span class="patrimony-legend-item"><span class="patrimony-legend-dot" style="background:{s.color}"></span>{s.label}</span>
			{/each}
		</div>
	</div>
</div>

<div class="patrimony-grid">
	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0"><Wallet size={14} style="vertical-align:-2px;margin-right:5px" />Contas e cartões</p>
		</div>
		{#if contas.length || cartoes.length}
			{#each contas as acc (acc.id)}
				<div class="patrimony-row">
					<span class="patrimony-row-name">{acc.nome}</span>
					<span class="patrimony-row-value privacy-value">{fmtMoney(saldoConta(acc))}</span>
				</div>
			{/each}
			{#each cartaoFaturas as c (c.acc.id)}
				<div class="patrimony-row">
					<span class="patrimony-row-name">{c.acc.nome} <span class="patrimony-row-tag">fatura</span></span>
					<span class="patrimony-row-value privacy-value negative">−{fmtMoney(c.valor)}</span>
				</div>
			{/each}
		{:else}
			<p class="empty">Nenhuma conta cadastrada ainda.</p>
		{/if}
	</div>

	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0"><Building2 size={14} style="vertical-align:-2px;margin-right:5px" />Investimentos e outros ativos</p>
		</div>
		{#if appState.patrimonyItems.length}
			{#each appState.patrimonyItems as item (item.id)}
				<div class="patrimony-row">
					<span class="patrimony-row-name">{item.nome} <span class="patrimony-row-tag">{TIPO_LABELS[item.tipo] || 'Outro'}</span></span>
					<div class="patrimony-row-actions">
						<span class="patrimony-row-value privacy-value">{fmtMoney(item.valor)}</span>
						<div class="account-menu-wrap">
							<button class="account-menu-btn" onclick={() => (menuOpenId = menuOpenId === item.id ? null : item.id)} aria-label="Mais opções">
								<MoreHorizontal size={16} />
							</button>
							{#if menuOpenId === item.id}
								<div class="menu-backdrop" onclick={() => (menuOpenId = null)} role="presentation"></div>
								<div class="account-menu">
									<button onclick={() => openEdit(item)}>Editar</button>
									<button class="danger" onclick={() => { deleting = item; menuOpenId = null; }}>Excluir</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{:else}
			<p class="empty">Nenhum ativo cadastrado ainda. Adicione investimentos, imóveis ou outros bens.</p>
		{/if}
	</div>

	<div class="card">
		<div class="feed-list-head">
			<p class="stat-label" style="margin:0"><Landmark size={14} style="vertical-align:-2px;margin-right:5px" />Dívidas de financiamento</p>
			<a class="link-more" href="/objetivos">Ver objetivos ↗</a>
		</div>
		{#if financiamentos.length}
			{#each financiamentos as f (f.goal.id)}
				<div class="patrimony-row">
					<span class="patrimony-row-name">{f.goal.name}</span>
					<span class="patrimony-row-value privacy-value negative">−{fmtMoney(f.saldoDevedor)}</span>
				</div>
			{/each}
		{:else}
			<p class="empty">Nenhum financiamento em aberto.</p>
		{/if}
	</div>
</div>

<Modal open={showModal} onClose={() => (showModal = false)} title={editing ? 'Editar ativo' : 'Novo ativo'} maxWidth="440px">
	<form onsubmit={submit} class="movement-form">
		<label class="field"><span>Nome</span><input class="field-input" placeholder="Ex.: Tesouro Selic, apartamento..." required bind:value={form.nome} /></label>
		<div class="form-grid">
			<label class="field">
				<span>Tipo</span>
				<select class="field-input" bind:value={form.tipo}>
					<option value="investimento">Investimento</option>
					<option value="imovel">Imóvel</option>
					<option value="outro">Outro ativo</option>
				</select>
			</label>
			<label class="field"><span>Valor atual</span><input class="field-input" type="number" step="0.01" min="0" required bind:value={form.valor} /></label>
		</div>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancelar</button>
		</div>
	</form>
</Modal>

<ConfirmDialog
	open={deleting !== null}
	title="Excluir ativo?"
	message={`"${deleting?.nome}" será removido do seu patrimônio.`}
	confirmLabel="Excluir"
	onCancel={() => (deleting = null)}
	onConfirm={() => {
		removePatrimonyItem(deleting.id);
		deleting = null;
	}}
/>
