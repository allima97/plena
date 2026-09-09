<script>
	import { appState, addPatrimonyItem, updatePatrimonyItem, removePatrimonyItem, upsertPatrimonySnapshot, addPatrimonyItemMove, removePatrimonyItemMove } from '$lib/fin/store.svelte.js';
	import { currentMonthKey, faturaDoCartao, saldoContaAte } from '$lib/fin/derived.js';
	import { monthKey } from '$lib/format.js';
	import { fmtMoney, todayISO } from '$lib/format.js';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import RowActionsModal from '$lib/components/RowActionsModal.svelte';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DonutChart from '$lib/components/charts/DonutChart.svelte';
	import { Plus, Landmark, TrendingUp, TrendingDown, Wallet, Building2, Pencil, Trash2, History } from 'lucide-svelte';

	const MES_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
	const TIPO_LABELS = { investimento: 'Investimento', imovel: 'Imóvel', outro: 'Outro ativo' };

	let showModal = $state(false);
	let editing = $state(null);
	let deleting = $state(null);
	let rowActions = $state({ open: false, title: '', subtitle: '', actions: [] });

	// Histórico de aportes/valorização por ativo (P4.4).
	let historyModal = $state({ open: false, item: null });
	function blankMove() {
		return { tipo: 'valorizacao', sinal: '1', valor: '', data: todayISO(), descricao: '' };
	}
	let moveForm = $state(blankMove());
	function openHistory(item) {
		historyModal = { open: true, item };
		moveForm = blankMove();
	}
	function openPatrimonyItemActions(item) {
		rowActions = {
			open: true,
			title: item.nome,
			subtitle: TIPO_LABELS[item.tipo] || 'Outro',
			actions: [
				{ label: 'Histórico', icon: History, onClick: () => openHistory(item) },
				{ label: 'Editar', icon: Pencil, onClick: () => openEdit(item) },
				{ label: 'Excluir', icon: Trash2, variant: 'danger', onClick: () => (deleting = item) }
			]
		};
	}
	const historyMoves = $derived(
		historyModal.item
			? appState.patrimonyItemMoves.filter((m) => m.itemId === historyModal.item.id).sort((a, b) => (a.data < b.data ? 1 : -1))
			: []
	);
	function submitMove(e) {
		e.preventDefault();
		if (!moveForm.valor) return;
		const sinal = Number(moveForm.sinal) < 0 ? -1 : 1;
		const valor = Math.abs(Number(moveForm.valor) || 0) * sinal;
		addPatrimonyItemMove(historyModal.item.id, { tipo: moveForm.tipo, valor, data: moveForm.data || todayISO(), descricao: moveForm.descricao.trim() });
		historyModal = { ...historyModal, item: { ...historyModal.item, valor: historyModal.item.valor + valor } };
		moveForm = blankMove();
	}

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
		// Saldo real de hoje: nunca inclui lançamento com data futura -- ver saldoContaAte em derived.js.
		return saldoContaAte(appState.transactions, acc, todayISO());
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
	const dividaPctAtivos = $derived(ativosTotal > 0 ? Math.round((passivosTotal / ativosTotal) * 100) : null);

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

	const snapshotsOrdenados = $derived([...appState.patrimonySnapshots].sort((a, b) => a.mKey.localeCompare(b.mKey)).slice(-12));
	const evolucaoData = $derived(
		snapshotsOrdenados.map((s) => {
			const [, m] = s.mKey.split('-');
			return { label: MES_ABBR[Number(m) - 1] || s.mKey, a: s.valor, b: 0, current: s.mKey === currentMonthKey() };
		})
	);

	// Variação no período (P4.1): quebra o quanto o patrimônio líquido mudou entre o primeiro e
	// o último retrato salvo em Aportes (metas + ativos) / Valorização (ativos) / Redução de
	// dívidas / Saldo em contas (resíduo -- receitas menos despesas do período), para sempre
	// fechar exatamente com a variação total, sem número solto sem explicação.
	let variacaoAberta = $state(false);
	let tabelaMensalAberta = $state(false);
	// Tabela mensal (P4.3): valores exatos mês a mês, já que as barras do gráfico não têm
	// rótulo numérico -- o usuário só via a forma, não os números do mockup do doc.
	const tabelaMensal = $derived(
		snapshotsOrdenados
			.map((s, i) => ({ mKey: s.mKey, valor: s.valor, variacao: i > 0 ? s.valor - snapshotsOrdenados[i - 1].valor : null }))
			.reverse()
	);

	const variacaoPeriodo = $derived.by(() => {
		if (snapshotsOrdenados.length < 2) return null;
		const primeiro = snapshotsOrdenados[0];
		const ultimo = snapshotsOrdenados[snapshotsOrdenados.length - 1];
		const totalVariacao = ultimo.valor - primeiro.valor;
		const reducaoDividas = primeiro.passivos - ultimo.passivos;

		const aportesMetas = appState.resourceMoves.filter((m) => m.amount > 0 && monthKey(m.date) >= primeiro.mKey && monthKey(m.date) <= ultimo.mKey).reduce((s, m) => s + m.amount, 0);
		const movesPeriodo = appState.patrimonyItemMoves.filter((m) => monthKey(m.data) >= primeiro.mKey && monthKey(m.data) <= ultimo.mKey);
		const aportesAtivos = movesPeriodo.filter((m) => m.tipo === 'aporte').reduce((s, m) => s + m.valor, 0);
		const valorizacao = movesPeriodo.filter((m) => m.tipo === 'valorizacao').reduce((s, m) => s + m.valor, 0);
		const aportes = aportesMetas + aportesAtivos;
		const saldoContas = totalVariacao - reducaoDividas - aportes - valorizacao;

		return { desde: primeiro.mKey, totalVariacao, aportes, valorizacao, reducaoDividas, saldoContas };
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
		{#if dividaPctAtivos !== null && passivosTotal > 0}
			<p class="patrimony-debt-ratio">Sua dívida representa <b>{dividaPctAtivos}%</b> dos seus ativos.</p>
		{/if}
		{#if evolucaoData.length > 1}
			<div class="patrimony-evolution">
				<p class="stat-label" style="margin:0 0 6px">Evolução patrimonial</p>
				<BarChart data={evolucaoData} height={140} colorA="#c7d7f5" colorAActive="#4a78db" />
				{#if variacaoPeriodo}
					<p class="patrimony-variacao-headline" class:negative={variacaoPeriodo.totalVariacao < 0}>
						{variacaoPeriodo.totalVariacao >= 0 ? '+' : ''}{fmtMoney(variacaoPeriodo.totalVariacao)} desde {variacaoPeriodo.desde}
					</p>
					<button class="score-tip-toggle" onclick={() => (variacaoAberta = !variacaoAberta)}>
						{variacaoAberta ? 'Ocultar detalhamento' : 'Ver de onde veio essa variação'}
					</button>
					{#if variacaoAberta}
						<div class="week-summary-grid" style="margin-top:10px">
							<div class="week-summary-item">
								<p class="week-summary-label">Aportes</p>
								<p class="week-summary-value privacy-value">+{fmtMoney(variacaoPeriodo.aportes)}</p>
							</div>
							<div class="week-summary-item">
								<p class="week-summary-label">Valorização</p>
								<p class="week-summary-value privacy-value" class:down={variacaoPeriodo.valorizacao < 0}>{variacaoPeriodo.valorizacao >= 0 ? '+' : ''}{fmtMoney(variacaoPeriodo.valorizacao)}</p>
							</div>
							<div class="week-summary-item">
								<p class="week-summary-label">Redução de dívidas</p>
								<p class="week-summary-value privacy-value" class:down={variacaoPeriodo.reducaoDividas < 0}>{variacaoPeriodo.reducaoDividas >= 0 ? '+' : ''}{fmtMoney(variacaoPeriodo.reducaoDividas)}</p>
							</div>
							<div class="week-summary-item">
								<p class="week-summary-label">Saldo em contas</p>
								<p class="week-summary-value privacy-value" class:down={variacaoPeriodo.saldoContas < 0}>{variacaoPeriodo.saldoContas >= 0 ? '+' : ''}{fmtMoney(variacaoPeriodo.saldoContas)}</p>
							</div>
						</div>
					{/if}
				{/if}
				<button class="score-tip-toggle" style="margin-top:8px" onclick={() => (tabelaMensalAberta = !tabelaMensalAberta)}>
					{tabelaMensalAberta ? 'Ocultar valores por mês' : 'Ver valores por mês'}
				</button>
				{#if tabelaMensalAberta}
					<div class="patrimony-move-list">
						{#each tabelaMensal as row (row.mKey)}
							<div class="patrimony-row">
								<span class="patrimony-row-name">{row.mKey}</span>
								<div class="patrimony-row-actions">
									{#if row.variacao !== null}
										<span class="patrimony-delta privacy-value" class:negative={row.variacao < 0}>{row.variacao >= 0 ? '+' : ''}{fmtMoney(row.variacao)}</span>
									{/if}
									<span class="patrimony-row-value privacy-value" class:negative={row.valor < 0}>{fmtMoney(row.valor)}</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
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
				<div
					class="patrimony-row"
					role="button"
					tabindex="0"
					onclick={() => openPatrimonyItemActions(item)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openPatrimonyItemActions(item);
						}
					}}
				>
					<span class="patrimony-row-name">{item.nome} <span class="patrimony-row-tag">{TIPO_LABELS[item.tipo] || 'Outro'}</span></span>
					<div class="patrimony-row-actions">
						<span class="patrimony-row-value privacy-value">{fmtMoney(item.valor)}</span>
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

<RowActionsModal
	open={rowActions.open}
	onClose={() => (rowActions = { ...rowActions, open: false })}
	title={rowActions.title}
	subtitle={rowActions.subtitle}
	actions={rowActions.actions}
/>

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

<Modal open={historyModal.open} onClose={() => (historyModal = { ...historyModal, open: false })} title={`Histórico -- ${historyModal.item?.nome || ''}`} maxWidth="480px">
	<form onsubmit={submitMove} class="movement-form">
		<div class="form-grid">
			<label class="field">
				<span>Tipo</span>
				<select class="field-input" bind:value={moveForm.tipo}>
					<option value="aporte">Aporte</option>
					<option value="valorizacao">Valorização/desvalorização</option>
				</select>
			</label>
			<label class="field">
				<span>Sinal</span>
				<select class="field-input" bind:value={moveForm.sinal}>
					<option value="1">Positivo (+)</option>
					<option value="-1">Negativo (-)</option>
				</select>
			</label>
		</div>
		<div class="form-grid">
			<label class="field"><span>Data</span><input class="field-input" type="date" bind:value={moveForm.data} /></label>
			<label class="field"><span>Valor</span><input class="field-input" type="number" step="0.01" min="0" required bind:value={moveForm.valor} /></label>
		</div>
		<label class="field"><span>Descrição (opcional)</span><input class="field-input" placeholder="Ex.: Rendimento do mês" bind:value={moveForm.descricao} /></label>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Registrar</button>
		</div>
	</form>

	{#if historyMoves.length}
		<div class="patrimony-move-list">
			{#each historyMoves as m (m.id)}
				<div class="patrimony-row">
					<span class="patrimony-row-name">
						{m.tipo === 'aporte' ? 'Aporte' : 'Valorização'}{m.descricao ? ` -- ${m.descricao}` : ''}
						<span class="patrimony-row-tag">{m.data}</span>
					</span>
					<div class="patrimony-row-actions">
						<span class="patrimony-row-value privacy-value" class:negative={m.valor < 0}>{m.valor >= 0 ? '+' : ''}{fmtMoney(m.valor)}</span>
						<button class="btn btn-ghost sm" onclick={() => removePatrimonyItemMove(m.id)}>Remover</button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty" style="margin-top:14px">Nenhum evento registrado ainda.</p>
	{/if}
</Modal>
