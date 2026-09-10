<script>
	import { appState, addTransaction, removeTransaction } from '$lib/fin/store.svelte.js';
	import { todayISO, fmtMoney } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { X, Check, Wand2 } from 'lucide-svelte';

	let { open, onClose } = $props();

	function blank() {
		return {
			valor: '',
			descricao: '',
			tipo: 'despesa',
			contaId: appState.accounts[0]?.id || '',
			categoriaId: '',
			subcategoriaId: ''
		};
	}
	let form = $state(blank());
	let valorEl = $state(null);

	$effect(() => {
		if (open) {
			form = blank();
			queueMicrotask(() => valorEl?.focus());
		}
	});

	function norm(s) {
		return (s || '').toString().trim().toLowerCase();
	}

	// "Últimos usados": descrições distintas mais recentes, com seus dados associados.
	const recentes = $derived.by(() => {
		const seen = new Map();
		for (const tr of [...appState.transactions].sort((a, b) => b.data.localeCompare(a.data))) {
			const key = norm(tr.descricao);
			if (!key || seen.has(key)) continue;
			seen.set(key, tr);
			if (seen.size >= 6) break;
		}
		return [...seen.values()];
	});

	function applyRecent(tr) {
		form = {
			...form,
			descricao: tr.descricao,
			tipo: tr.tipo,
			contaId: tr.contaId || form.contaId,
			categoriaId: tr.categoriaId || '',
			subcategoriaId: tr.subcategoriaId || ''
		};
		queueMicrotask(() => valorEl?.focus());
	}

	// Inteligência de preenchimento: em vez de aplicar em silêncio no blur, mostra uma sugestão
	// visível ("Mercado → Despesa · Nubank · Alimentação") que o usuário confirma com um clique --
	// mais transparente que preencher os campos sem avisar.
	const sugestao = $derived.by(() => {
		if (form.categoriaId || !form.descricao.trim()) return null;
		const key = norm(form.descricao);
		if (!key) return null;
		const match = [...appState.transactions].sort((a, b) => b.data.localeCompare(a.data)).find((tr) => norm(tr.descricao) === key);
		if (!match || (!match.categoriaId && !match.contaId)) return null;
		const conta = appState.accounts.find((a) => a.id === match.contaId);
		const cat = appState.categories.find((c) => c.id === match.categoriaId);
		const partes = [match.tipo === 'receita' ? 'Receita' : 'Despesa', conta?.nome, cat?.nome].filter(Boolean);
		return { match, label: partes.join(' · ') };
	});

	function usarSugestao() {
		if (!sugestao) return;
		const match = sugestao.match;
		form = {
			...form,
			tipo: match.tipo,
			contaId: match.contaId || form.contaId,
			categoriaId: match.categoriaId || '',
			subcategoriaId: match.subcategoriaId || ''
		};
	}

	const categoriasDoTipo = $derived(appState.categories.filter((c) => c.tipo === form.tipo));

	function submit(e) {
		e.preventDefault();
		if (!form.valor || !Number(form.valor)) return;
		const created = addTransaction({
			tipo: form.tipo,
			valor: Number(form.valor),
			data: todayISO(),
			descricao: form.descricao.trim(),
			categoriaId: form.categoriaId,
			subcategoriaId: form.subcategoriaId,
			contaId: form.contaId,
			formaPagamento: null,
			statusPagamento: 'pago'
		});
		showToast({
			message: `✓ ${form.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${fmtMoney(created.valor)} registrada.`,
			actionLabel: 'DESFAZER',
			onAction: () => removeTransaction(created.id)
		});
		onClose();
	}
</script>

{#if open}
	<div class="modal-backdrop" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()} role="presentation" tabindex="-1">
		<div class="modal-card quick-add-card" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Lançamento rápido">
			<div class="modal-head">
				<div>
					<p class="modal-eyebrow">Lançamento rápido</p>
					<h2 class="font-display modal-title">Novo lançamento</h2>
				</div>
				<button class="icon-btn" onclick={onClose} aria-label="Fechar"><X size={18} /></button>
			</div>
			<form class="quick-add-form" onsubmit={submit}>
				<div class="quick-add-type">
					<button type="button" class="quick-add-type-btn" class:active={form.tipo === 'despesa'} onclick={() => (form = { ...form, tipo: 'despesa', categoriaId: '' })}>Despesa</button>
					<button type="button" class="quick-add-type-btn" class:active={form.tipo === 'receita'} onclick={() => (form = { ...form, tipo: 'receita', categoriaId: '' })}>Receita</button>
				</div>
				<input bind:this={valorEl} class="quick-add-value" type="number" step="0.01" min="0" placeholder="R$ 0,00" bind:value={form.valor} required />
				<input class="field-input" type="text" placeholder="Descrição (ex: Mercado)" bind:value={form.descricao} />
				{#if sugestao}
					<button type="button" class="quick-add-suggestion" onclick={usarSugestao}>
						<Wand2 size={13} />
						<span><b>{form.descricao}</b> → {sugestao.label}</span>
						<span class="quick-add-suggestion-cta">Usar</span>
					</button>
				{/if}
				<div class="quick-add-row">
					<select class="field-input" bind:value={form.contaId}>
						{#each appState.accounts as acc (acc.id)}
							<option value={acc.id}>{acc.nome}</option>
						{/each}
					</select>
					<select class="field-input" bind:value={form.categoriaId}>
						<option value="">Sem categoria</option>
						{#each categoriasDoTipo as cat (cat.id)}
							<option value={cat.id}>{cat.nome}</option>
						{/each}
					</select>
				</div>
				{#if recentes.length}
					<div class="quick-add-recent">
						<span>Últimos usados:</span>
						{#each recentes as tr (tr.id)}
							<button type="button" class="quick-add-chip" onclick={() => applyRecent(tr)}>{tr.descricao}</button>
						{/each}
					</div>
				{/if}
				<button type="submit" class="btn btn-primary quick-add-submit"><Check size={16} /> Salvar</button>
			</form>
		</div>
	</div>
{/if}
