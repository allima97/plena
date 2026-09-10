<script>
	import {
		appState,
		addCategory,
		renameCategory,
		removeCategory,
		restoreCategory,
		addSubcategory,
		renameSubcategory,
		removeSubcategory,
		setCategoryBudget,
		setBudgetGlobal
	} from '$lib/fin/store.svelte.js';
	import { monthTransactions, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { page } from '$app/state';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Plus, Tag } from 'lucide-svelte';

	const DOT_PALETTE = ['#23a768', '#4a78db', '#e06b5f', '#e0a23f', '#8b78db', '#2fb7c4', '#c4519a', '#6f9e3f'];

	let showModal = $state(false);
	let novaCategoria = $state('');
	let novoTipo = $state('despesa');
	let expandedId = $state(null);
	let novaSub = $state({});
	let renomeando = $state(null);
	let deletando = $state(null);

	const startDay = $derived(appState.settings.monthStartDay || 1);
	const mesTx = $derived(monthTransactions(appState.transactions, currentMonthKey(startDay), startDay));

	function valorDoMes(cat) {
		return mesTx.filter((t) => t.categoriaId === cat.id).reduce((s, t) => s + (Number(t.valor) || 0), 0);
	}

	// Orçamento mensal total (P3.1) -- limite geral de gasto do mês, separado do orçamento por categoria.
	let editandoOrcamentoGlobal = $state(false);
	let orcamentoGlobalInput = $state('');
	const gastoTotalMes = $derived(mesTx.filter((t) => t.tipo === 'despesa' && !t.isTransferencia).reduce((s, t) => s + (Number(t.valor) || 0), 0));
	const pctOrcamentoGlobal = $derived(appState.budgetGlobal ? Math.min(100, Math.round((gastoTotalMes / appState.budgetGlobal) * 100)) : null);
	function abrirOrcamentoGlobal() {
		orcamentoGlobalInput = appState.budgetGlobal || '';
		editandoOrcamentoGlobal = true;
	}
	function salvarOrcamentoGlobal() {
		setBudgetGlobal(orcamentoGlobalInput);
		editandoOrcamentoGlobal = false;
	}

	// Orçamento mensal por categoria (só para despesas): progresso de uso no mês corrente.
	let editandoOrcamento = $state(null);
	let orcamentoInput = $state('');
	function pctOrcamento(cat) {
		if (!cat.orcamentoMensal) return null;
		return Math.min(100, Math.round((valorDoMes(cat) / cat.orcamentoMensal) * 100));
	}
	function corOrcamento(pct) {
		if (pct >= 100) return 'var(--expense)';
		if (pct >= 80) return 'var(--kpi-amber, #a67c1e)';
		return 'var(--income)';
	}
	function abrirOrcamento(cat) {
		editandoOrcamento = cat.id;
		orcamentoInput = cat.orcamentoMensal || '';
	}
	function salvarOrcamento(cat) {
		setCategoryBudget(cat.id, orcamentoInput);
		editandoOrcamento = null;
	}

	function criar(e) {
		e.preventDefault();
		if (!novaCategoria.trim()) return;
		addCategory(novoTipo, novaCategoria);
		novaCategoria = '';
		showModal = false;
	}

	function criarSub(catId) {
		const nome = (novaSub[catId] || '').trim();
		if (!nome) return;
		addSubcategory(catId, nome);
		novaSub = { ...novaSub, [catId]: '' };
	}

	const exemploChip = $derived.by(() => {
		for (const cat of appState.categories) {
			if (cat.secundarios?.length) return { principal: cat.nome, secundario: cat.secundarios[0].nome };
		}
		return { principal: 'Salário', secundario: 'André' };
	});

	// Vindo da busca global (?open=<id>): expande e rola até essa categoria, uma única vez.
	let openedFromSearch = false;
	$effect(() => {
		if (openedFromSearch) return;
		const id = page.url.searchParams.get('open');
		if (!id) return;
		const cat = appState.categories.find((c) => c.id === id || c.secundarios?.some((s) => s.id === id));
		if (cat) {
			openedFromSearch = true;
			expandedId = cat.id;
			queueMicrotask(() => document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
		}
	});
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Organização</p>
		<h1 class="font-display page-title">Categorias que fazem sentido.</h1>
		<p class="page-sub">Crie uma estrutura com principal e secundária para cada receita ou despesa, do seu jeito.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showModal = true)}><Plus size={16} /> Nova categoria</button>
</div>

<!-- Orçamento mensal total: card removido da página de Categorias a pedido do usuário (não fazia sentido aqui). Lógica (setBudgetGlobal, appState.budgetGlobal) segue intacta no store -- o card pode voltar em outro lugar (ex.: Dashboard) mais adiante. -->

<div class="cat-tip-banner">
	<div class="cat-tip-icon"><Tag size={18} /></div>
	<div class="cat-tip-text">
		<p class="cat-tip-eyebrow">Dica de organização</p>
		<h3>Detalhe hoje. Entenda amanhã.</h3>
		<p>Use o campo secundário para diferenciar pessoas, serviços ou objetivos dentro da mesma categoria principal.</p>
	</div>
	<div class="cat-tip-example">
		<p class="ex-label">Exemplo</p>
		<div class="chip-pair">
			<span class="chip-solid">{exemploChip.principal}</span>
			<span class="chip-outline">{exemploChip.secundario}</span>
		</div>
	</div>
</div>

<div class="card">
	<div class="cat-list-head">
		<div>
			<p class="page-eyebrow" style="margin-bottom:2px">Estrutura atual</p>
			<p class="font-display" style="margin:0;font-size:18px">Principal e secundária</p>
		</div>
		<span class="badge badge-gray">{appState.categories.length} categoria{appState.categories.length === 1 ? '' : 's'}</span>
	</div>

	<div class="cat-rows">
		{#each appState.categories as cat, i (cat.id)}
			{@const dot = DOT_PALETTE[i % DOT_PALETTE.length]}
			<div class="cat-row" id="cat-{cat.id}">
				<div class="cat-row-top" onclick={() => (expandedId = expandedId === cat.id ? null : cat.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (expandedId = expandedId === cat.id ? null : cat.id)}>
					<span class="cat-dot" style="background:{dot}"></span>
					<div class="cat-row-main">
						<span class="cat-row-name">{cat.nome}</span>
						<span class="tag" class:receita={cat.tipo === 'receita'} class:despesa={cat.tipo === 'despesa'}>{cat.tipo}</span>
					</div>
					<div style="text-align:right;min-width:130px">
						<p class="cat-row-value privacy-value" class:money-in={cat.tipo === 'receita'} class:money-out={cat.tipo === 'despesa'}>{fmtMoney(valorDoMes(cat))}</p>
						{#if cat.tipo === 'despesa' && cat.orcamentoMensal}
							{@const pct = pctOrcamento(cat)}
							<div class="mini-progress-track" style="margin-top:6px">
								<div class="mini-progress-fill" style={`width:${pct}%; background:${corOrcamento(pct)}`}></div>
							</div>
							<p class="cat-row-sub">{pct}% de {fmtMoney(cat.orcamentoMensal)}</p>
						{:else}
							<p class="cat-row-sub">{cat.secundarios?.length || 0} subitem{(cat.secundarios?.length || 0) === 1 ? '' : 'ns'} cadastrado{(cat.secundarios?.length || 0) === 1 ? '' : 's'}</p>
						{/if}
					</div>
				</div>

				{#if expandedId === cat.id}
					<div class="cat-row-body">
						<div class="report-row">
							{#if renomeando === cat.id}
								<input
									class="field-input"
									style="flex:1"
									value={cat.nome}
									onblur={(e) => { renameCategory(cat.id, e.target.value); renomeando = null; }}
									onkeydown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
								/>
							{:else}
								<button class="btn btn-ghost sm" onclick={() => (renomeando = cat.id)}>Renomear</button>
							{/if}
							<button class="btn btn-danger sm" onclick={() => (deletando = cat)}>Excluir categoria</button>
						</div>

						{#if cat.tipo === 'despesa'}
							<div class="report-row">
								{#if editandoOrcamento === cat.id}
									<input
										class="field-input"
										style="flex:1"
										type="number"
										min="0"
										step="0.01"
										placeholder="Ex.: 500"
										bind:value={orcamentoInput}
										onkeydown={(e) => { if (e.key === 'Enter') salvarOrcamento(cat); }}
									/>
									<button class="btn sm" onclick={() => salvarOrcamento(cat)}>Salvar</button>
								{:else}
									<span class="cat-row-sub" style="flex:1">
										Orçamento mensal: {cat.orcamentoMensal ? fmtMoney(cat.orcamentoMensal) : 'não definido'}
									</span>
									<button class="btn btn-ghost sm" onclick={() => abrirOrcamento(cat)}>{cat.orcamentoMensal ? 'Editar' : 'Definir'} orçamento</button>
								{/if}
							</div>
						{/if}

						{#if cat.secundarios?.length}
							<div class="sub-list">
								{#each cat.secundarios as sub (sub.id)}
									<span class="badge badge-gray sub-chip">
										{sub.nome}
										<button class="sub-remove" onclick={() => removeSubcategory(cat.id, sub.id)} aria-label="Remover subcategoria">×</button>
									</span>
								{/each}
							</div>
						{/if}

						<div class="report-row">
							<input
								class="field-input"
								style="flex:1"
								placeholder="Nova subcategoria"
								value={novaSub[cat.id] || ''}
								oninput={(e) => (novaSub = { ...novaSub, [cat.id]: e.target.value })}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criarSub(cat.id); } }}
							/>
							<button class="btn sm" onclick={() => criarSub(cat.id)}>Adicionar</button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<p class="empty">Nenhuma categoria ainda.</p>
		{/each}
	</div>
</div>

<Modal open={showModal} onClose={() => (showModal = false)} title="Nova categoria" maxWidth="440px">
	<form onsubmit={criar} class="movement-form">
		<div class="segmented">
			<button type="button" class:active={novoTipo === 'despesa'} class="despesa" onclick={() => (novoTipo = 'despesa')}>Despesa</button>
			<button type="button" class:active={novoTipo === 'receita'} class="receita" onclick={() => (novoTipo = 'receita')}>Receita</button>
		</div>
		<label class="field"><span>Nome da categoria</span><input class="field-input" required bind:value={novaCategoria} /></label>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Adicionar</button>
			<button type="button" class="btn btn-ghost" onclick={() => (showModal = false)}>Cancelar</button>
		</div>
	</form>
</Modal>

<ConfirmDialog
	open={deletando !== null}
	title="Excluir categoria?"
	message={`"${deletando?.nome}" e suas subcategorias serão removidas.`}
	confirmLabel="Excluir"
	onCancel={() => (deletando = null)}
	onConfirm={() => {
		const snapshot = { ...deletando };
		removeCategory(deletando.id);
		showToast({ message: `Categoria "${snapshot.nome}" excluída.`, actionLabel: 'DESFAZER', onAction: () => restoreCategory(snapshot) });
		deletando = null;
		expandedId = null;
	}}
/>
