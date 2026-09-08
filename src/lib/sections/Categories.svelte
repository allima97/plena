<script>
	import {
		appState,
		addCategory,
		renameCategory,
		removeCategory,
		addSubcategory,
		renameSubcategory,
		removeSubcategory
	} from '$lib/fin/store.svelte.js';
	import { monthTransactions, currentMonthKey } from '$lib/fin/derived.js';
	import { fmtMoney } from '$lib/format.js';
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

	const mesTx = $derived(monthTransactions(appState.transactions, currentMonthKey()));

	function valorDoMes(cat) {
		return mesTx.filter((t) => t.categoriaId === cat.id).reduce((s, t) => s + (Number(t.valor) || 0), 0);
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
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Organização</p>
		<h1 class="font-display page-title">Categorias que fazem sentido.</h1>
		<p class="page-sub">Crie uma estrutura com principal e secundária para cada receita ou despesa, do seu jeito.</p>
	</div>
	<button class="btn btn-primary" onclick={() => (showModal = true)}><Plus size={16} /> Nova categoria</button>
</div>

<div class="categories-layout">
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
				<div class="cat-row">
					<div class="cat-row-top" onclick={() => (expandedId = expandedId === cat.id ? null : cat.id)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && (expandedId = expandedId === cat.id ? null : cat.id)}>
						<span class="cat-dot" style="background:{dot}"></span>
						<div class="cat-row-main">
							<span class="cat-row-name">{cat.nome}</span>
							<span class="tag" class:receita={cat.tipo === 'receita'} class:despesa={cat.tipo === 'despesa'}>{cat.tipo}</span>
						</div>
						<div style="text-align:right">
							<p class="cat-row-value privacy-value" class:money-in={cat.tipo === 'receita'} class:money-out={cat.tipo === 'despesa'}>{fmtMoney(valorDoMes(cat))}</p>
							<p class="cat-row-sub">{cat.secundarios?.length || 0} subitem{(cat.secundarios?.length || 0) === 1 ? '' : 'ns'} cadastrado{(cat.secundarios?.length || 0) === 1 ? '' : 's'}</p>
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

	<div class="tip-panel">
		<div class="tip-panel-icon"><Tag size={18} /></div>
		<p class="tip-panel-eyebrow">Dica de organização</p>
		<h3>Detalhe hoje. Entenda amanhã.</h3>
		<p>Use o campo secundário para diferenciar pessoas, serviços ou objetivos dentro da mesma categoria principal.</p>
		<div class="tip-example">
			<p class="ex-label">Exemplo</p>
			<div class="chip-pair">
				<span class="chip-solid">{exemploChip.principal}</span>
				<span class="chip-outline">{exemploChip.secundario}</span>
			</div>
		</div>
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
		removeCategory(deletando.id);
		deletando = null;
		expandedId = null;
	}}
/>
