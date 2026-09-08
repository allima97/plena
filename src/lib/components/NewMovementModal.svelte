<script>
	import Modal from './Modal.svelte';
	import { appState, addTransactionSeries, updateTransaction, editSeries } from '$lib/fin/store.svelte.js';
	import { FORMAS_PAGAMENTO_PADRAO } from '$lib/fin/seed.js';
	import { todayISO } from '$lib/format.js';

	/**
	 * mode: 'create' | 'edit-occurrence' | 'edit-series'
	 * transaction: quando mode !== 'create', o lançamento (ou um representante da série) a editar
	 */
	let { open, mode = 'create', transaction = null, onClose } = $props();

	function blank() {
		return {
			tipo: 'despesa',
			valor: '',
			data: todayISO(),
			descricao: '',
			categoriaId: '',
			subcategoriaId: '',
			contaId: appState.accounts[0]?.id || '',
			formaPagamento: FORMAS_PAGAMENTO_PADRAO[0],
			schedule: 'unica',
			parcelas: 2,
			mesesRecorrencia: 12
		};
	}

	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		if (transaction) {
			form = {
				tipo: transaction.tipo,
				valor: transaction.valor,
				data: transaction.data,
				descricao: transaction.descricao,
				categoriaId: transaction.categoriaId || '',
				subcategoriaId: transaction.subcategoriaId || '',
				contaId: transaction.contaId || '',
				formaPagamento: transaction.formaPagamento || FORMAS_PAGAMENTO_PADRAO[0],
				schedule: 'unica',
				parcelas: transaction.parcelaTotal || 2,
				mesesRecorrencia: 12
			};
		} else {
			form = blank();
		}
	});

	const categoriasDoTipo = $derived(appState.categories.filter((c) => c.tipo === form.tipo));
	const categoriaSelecionada = $derived(appState.categories.find((c) => c.id === form.categoriaId));

	function norm(s) {
		return (s || '').toString().trim().toLowerCase();
	}

	// Categorização por regra local: reaproveita conta/categoria/forma de pagamento da última vez
	// que essa descrição foi usada. Só atua em lançamentos novos e quando o usuário ainda não escolheu categoria.
	function handleDescricaoBlur() {
		if (mode !== 'create' || form.categoriaId || !form.descricao.trim()) return;
		const key = norm(form.descricao);
		const match = [...appState.transactions].sort((a, b) => b.data.localeCompare(a.data)).find((tr) => norm(tr.descricao) === key);
		if (match) {
			form = {
				...form,
				tipo: match.tipo,
				categoriaId: match.categoriaId || '',
				subcategoriaId: match.subcategoriaId || '',
				contaId: match.contaId || form.contaId,
				formaPagamento: match.formaPagamento || form.formaPagamento
			};
		}
	}

	const title = $derived(
		mode === 'edit-occurrence'
			? 'Editar lançamento'
			: mode === 'edit-series'
				? 'Editar série'
				: 'Novo lançamento'
	);
	const subtitle = $derived(
		mode === 'edit-occurrence'
			? 'Altera só esta ocorrência — o restante da série continua igual.'
			: mode === 'edit-series'
				? 'Altera todas as ocorrências futuras ainda não pagas desta série.'
				: 'Lançamento único, parcelado ou recorrente.'
	);

	function submit(e) {
		e.preventDefault();
		if (!form.valor || !form.data || !form.categoriaId) return;
		const base = {
			tipo: form.tipo,
			valor: Number(form.valor),
			data: form.data,
			descricao: form.descricao.trim(),
			categoriaId: form.categoriaId,
			subcategoriaId: form.subcategoriaId || null,
			contaId: form.contaId || null,
			formaPagamento: form.formaPagamento
		};
		if (mode === 'edit-occurrence') {
			updateTransaction(transaction.id, base);
		} else if (mode === 'edit-series') {
			editSeries(transaction.seriesId, base);
		} else {
			addTransactionSeries(
				base,
				form.schedule,
				form.schedule === 'parcelado' ? form.parcelas : form.mesesRecorrencia
			);
		}
		onClose();
	}
</script>

<Modal {open} {onClose} {title} {subtitle} maxWidth="560px">
	<form onsubmit={submit} class="movement-form">
		<div class="segmented">
			<button type="button" class:active={form.tipo === 'despesa'} class="despesa" onclick={() => (form.tipo = 'despesa')}
				>Despesa</button
			>
			<button type="button" class:active={form.tipo === 'receita'} class="receita" onclick={() => (form.tipo = 'receita')}
				>Receita</button
			>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Valor (R$)</span>
				<input class="field-input" type="number" step="0.01" min="0" required bind:value={form.valor} />
			</label>
			<label class="field">
				<span>Data</span>
				<input class="field-input" type="date" required bind:value={form.data} />
			</label>
		</div>

		<label class="field">
			<span>Descrição</span>
			<input class="field-input" type="text" placeholder="Ex.: Mercado do mês" bind:value={form.descricao} onblur={handleDescricaoBlur} />
		</label>

		<div class="form-grid">
			<label class="field">
				<span>Categoria</span>
				<select class="field-input" required bind:value={form.categoriaId}>
					<option value="" disabled>Selecione</option>
					{#each categoriasDoTipo as c (c.id)}
						<option value={c.id}>{c.nome}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Subcategoria</span>
				<select class="field-input" bind:value={form.subcategoriaId} disabled={!categoriaSelecionada?.secundarios?.length}>
					<option value="">Nenhuma</option>
					{#each categoriaSelecionada?.secundarios || [] as s (s.id)}
						<option value={s.id}>{s.nome}</option>
					{/each}
				</select>
			</label>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Conta / cartão</span>
				<select class="field-input" bind:value={form.contaId}>
					<option value="">Sem conta</option>
					{#each appState.accounts as a (a.id)}
						<option value={a.id}>{a.nome}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Forma de pagamento</span>
				<select class="field-input" bind:value={form.formaPagamento}>
					{#each FORMAS_PAGAMENTO_PADRAO as f}
						<option value={f}>{f}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if mode === 'create'}
			<div class="field">
				<span>Repetição</span>
				<div class="segmented schedule-segmented">
					<button type="button" class:active={form.schedule === 'unica'} onclick={() => (form.schedule = 'unica')}
						>Única</button
					>
					<button type="button" class:active={form.schedule === 'parcelado'} onclick={() => (form.schedule = 'parcelado')}
						>Parcelado</button
					>
					<button type="button" class:active={form.schedule === 'recorrente'} onclick={() => (form.schedule = 'recorrente')}
						>Recorrente</button
					>
				</div>
			</div>
			{#if form.schedule === 'parcelado'}
				<label class="field">
					<span>Número de parcelas</span>
					<input class="field-input" type="number" min="2" max="360" bind:value={form.parcelas} />
					<span class="field-hint">Gera {form.parcelas} lançamentos mensais, um por mês a partir da data acima.</span>
				</label>
			{:else if form.schedule === 'recorrente'}
				<label class="field">
					<span>Repetir por quantos meses</span>
					<input class="field-input" type="number" min="1" max="360" bind:value={form.mesesRecorrencia} />
					<span class="field-hint">Gera uma ocorrência mensal ativa, que você pode pausar ou cancelar quando quiser.</span>
				</label>
			{/if}
		{/if}

		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
