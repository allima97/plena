<script>
	import { goto } from '$app/navigation';
	import { appState } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import { Search, ReceiptText, WalletCards, Tags, Target } from 'lucide-svelte';

	let { open, onClose } = $props();
	let query = $state('');
	let inputEl = $state(null);

	$effect(() => {
		if (open) {
			query = '';
			queueMicrotask(() => inputEl?.focus());
		}
	});

	function norm(s) {
		return (s || '')
			.toString()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	const q = $derived(norm(query));

	const movimentacoes = $derived(
		q.length < 2
			? []
			: [...appState.transactions]
					.filter((tr) => norm(tr.descricao).includes(q))
					.sort((a, b) => b.data.localeCompare(a.data))
					.slice(0, 6)
	);
	const contas = $derived(q.length < 2 ? [] : appState.accounts.filter((a) => norm(a.nome).includes(q)).slice(0, 6));
	const categorias = $derived.by(() => {
		if (q.length < 2) return [];
		const out = [];
		for (const c of appState.categories) {
			if (norm(c.nome).includes(q)) out.push({ key: c.id, id: c.id, nome: c.nome });
			for (const s of c.secundarios || []) {
				if (norm(s.nome).includes(q)) out.push({ key: `${c.id}:${s.id}`, id: s.id, nome: `${c.nome} · ${s.nome}` });
			}
		}
		return out.slice(0, 6);
	});
	const objetivos = $derived(q.length < 2 ? [] : appState.goals.filter((g) => norm(g.name).includes(q)).slice(0, 6));

	const totalResults = $derived(movimentacoes.length + contas.length + categorias.length + objetivos.length);

	function pick(href) {
		onClose();
		goto(href);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') onClose();
	}
</script>

{#if open}
	<div class="modal-backdrop search-backdrop" onclick={onClose} onkeydown={handleKeydown} role="presentation" tabindex="-1">
		<div class="search-panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Busca global">
			<div class="search-input-row">
				<Search size={18} />
				<input bind:this={inputEl} bind:value={query} type="text" placeholder="Buscar movimentações, contas, categorias, objetivos…" onkeydown={handleKeydown} />
				<span class="search-kbd">Esc</span>
			</div>
			<div class="search-results">
				{#if q.length < 2}
					<p class="empty">Digite ao menos 2 letras para buscar.</p>
				{:else if !totalResults}
					<p class="empty">Nada encontrado para "{query}".</p>
				{:else}
					{#if movimentacoes.length}
						<p class="search-group-label">Movimentações · {movimentacoes.length}</p>
						{#each movimentacoes as tr (tr.id)}
							<button class="search-result-item" onclick={() => pick(`/movimentacoes?open=${tr.id}`)}>
								<span class="search-result-icon"><ReceiptText size={15} /></span>
								<span class="search-result-main">
									<span class="search-result-name">{tr.descricao || 'Lançamento'}</span>
									<span class="search-result-meta">{fmtDate(tr.data)}</span>
								</span>
								<span class="privacy-value" class:money-in={tr.tipo === 'receita'} class:money-out={tr.tipo === 'despesa'}>{fmtMoney(tr.valor)}</span>
							</button>
						{/each}
					{/if}
					{#if contas.length}
						<p class="search-group-label">Contas · {contas.length}</p>
						{#each contas as acc (acc.id)}
							<button class="search-result-item" onclick={() => pick(`/contas?open=${acc.id}`)}>
								<span class="search-result-icon"><WalletCards size={15} /></span>
								<span class="search-result-main"><span class="search-result-name">{acc.nome}</span></span>
							</button>
						{/each}
					{/if}
					{#if categorias.length}
						<p class="search-group-label">Categorias · {categorias.length}</p>
						{#each categorias as cat (cat.key)}
							<button class="search-result-item" onclick={() => pick(`/categorias?open=${cat.id}`)}>
								<span class="search-result-icon"><Tags size={15} /></span>
								<span class="search-result-main"><span class="search-result-name">{cat.nome}</span></span>
							</button>
						{/each}
					{/if}
					{#if objetivos.length}
						<p class="search-group-label">Objetivos · {objetivos.length}</p>
						{#each objetivos as g (g.id)}
							<button class="search-result-item" onclick={() => pick(`/objetivos?goal=${g.id}`)}>
								<span class="search-result-icon"><Target size={15} /></span>
								<span class="search-result-main"><span class="search-result-name">{g.name}</span></span>
							</button>
						{/each}
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}
