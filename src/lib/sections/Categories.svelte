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
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Plus } from 'lucide-svelte';

	let tipoAtivo = $state('despesa');
	let novaCategoria = $state('');
	let novaSub = $state({});
	let renomeando = $state(null);
	let deletando = $state(null);

	const categorias = $derived(appState.categories.filter((c) => c.tipo === tipoAtivo));

	function criar(e) {
		e.preventDefault();
		if (!novaCategoria.trim()) return;
		addCategory(tipoAtivo, novaCategoria);
		novaCategoria = '';
	}

	function criarSub(catId) {
		const nome = (novaSub[catId] || '').trim();
		if (!nome) return;
		addSubcategory(catId, nome);
		novaSub = { ...novaSub, [catId]: '' };
	}
</script>

<div class="page-head">
	<div>
		<h1 class="font-display page-title">Categorias</h1>
		<p class="page-sub">Organize receitas e despesas do seu jeito.</p>
	</div>
</div>

<div class="segmented" style="max-width:280px;margin-bottom:20px">
	<button type="button" class:active={tipoAtivo === 'despesa'} class="despesa" onclick={() => (tipoAtivo = 'despesa')}>Despesas</button>
	<button type="button" class:active={tipoAtivo === 'receita'} class="receita" onclick={() => (tipoAtivo = 'receita')}>Receitas</button>
</div>

<form onsubmit={criar} class="report-row" style="margin-bottom:18px">
	<input class="field-input" style="flex:1;min-width:200px" placeholder={`Nova categoria de ${tipoAtivo}`} bind:value={novaCategoria} />
	<button class="btn btn-primary" type="submit"><Plus size={16} /> Adicionar</button>
</form>

<div class="cat-list">
	{#each categorias as cat (cat.id)}
		<div class="card cat-card">
			<div class="cat-card-head">
				<span class="tag" class:receita={cat.tipo === 'receita'} class:despesa={cat.tipo === 'despesa'}>{cat.tipo}</span>
				{#if renomeando === cat.id}
					<input
						class="field-input"
						style="flex:1"
						value={cat.nome}
						onblur={(e) => { renameCategory(cat.id, e.target.value); renomeando = null; }}
						onkeydown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
					/>
				{:else}
					<p class="template-name" style="flex:1;font-size:14px" ondblclick={() => (renomeando = cat.id)}>{cat.nome}</p>
				{/if}
				<button class="btn btn-ghost sm" onclick={() => (renomeando = cat.id)}>Renomear</button>
				<button class="btn btn-danger sm" onclick={() => (deletando = cat)}>Excluir</button>
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

			<div class="report-row" style="margin-top:10px">
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
	{:else}
		<p class="empty">Nenhuma categoria de {tipoAtivo} ainda.</p>
	{/each}
</div>

<ConfirmDialog
	open={deletando !== null}
	title="Excluir categoria?"
	message={`"${deletando?.nome}" e suas subcategorias serão removidas.`}
	confirmLabel="Excluir"
	onCancel={() => (deletando = null)}
	onConfirm={() => {
		removeCategory(deletando.id);
		deletando = null;
	}}
/>
