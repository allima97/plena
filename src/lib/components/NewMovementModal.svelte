<script>
	import Modal from './Modal.svelte';
	import { appState, addTransactionSeries, updateTransaction, editSeries, removeTransaction, seriesOf } from '$lib/fin/store.svelte.js';
	import { FORMAS_PAGAMENTO_PADRAO } from '$lib/fin/seed.js';
	import { todayISO, fmtMoney } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { Pencil, Copy, Trash2 } from 'lucide-svelte';

	/**
	 * mode: 'create' | 'edit-occurrence' | 'edit-series'
	 * transaction: quando mode !== 'create', o lançamento (ou um representante da série) a editar
	 * onDuplicate/onDelete/onEditSeries/onManageSeries: ações opcionais disponíveis na visualização
	 * de uma ocorrência (mode 'edit-occurrence'), antes de destravar os campos para editar.
	 */
	let { open, mode = 'create', transaction = null, onClose, onDuplicate = null, onDelete = null, onEditSeries = null, onManageSeries = null } = $props();

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
	// Ao abrir para ver/editar uma ocorrência (mode 'edit-occurrence'), o modal começa travado
	// (só visualização) -- "Editar" destrava os campos e vira "Salvar", como um app normal.
	// 'create' e 'edit-series' continuam sempre editáveis, sem essa etapa de visualização.
	let locked = $state(false);

	function loadFromTransaction() {
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
	}

	$effect(() => {
		if (!open) return;
		loadFromTransaction();
		locked = mode === 'edit-occurrence';
	});

	function unlock() {
		locked = false;
	}
	function cancelEdit() {
		loadFromTransaction();
		locked = true;
	}
	function handleDuplicateClick() {
		onDuplicate?.(transaction);
	}
	function handleDeleteClick() {
		onDelete?.(transaction);
		onClose();
	}
	function handleEditSeriesClick() {
		onEditSeries?.(transaction);
	}
	function handleManageSeriesClick(action) {
		onManageSeries?.(transaction.seriesId, action);
		onClose();
	}

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
			? locked
				? 'Visualização do lançamento — toque em Editar para alterar.'
				: 'Altera só esta ocorrência — o restante da série continua igual.'
			: mode === 'edit-series'
				? 'Altera todas as ocorrências futuras ainda não pagas desta série.'
				: 'Lançamento único, parcelado ou recorrente.'
	);

	function submit(e) {
		e.preventDefault();
		if (locked) return;
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
			const snapshot = { ...transaction };
			updateTransaction(transaction.id, base);
			showToast({ message: '✓ Lançamento atualizado.', actionLabel: 'DESFAZER', onAction: () => updateTransaction(snapshot.id, snapshot) });
		} else if (mode === 'edit-series') {
			const snapshot = seriesOf(transaction.seriesId).map((t) => ({ ...t }));
			editSeries(transaction.seriesId, base);
			showToast({
				message: '✓ Série atualizada.',
				actionLabel: 'DESFAZER',
				onAction: () => snapshot.forEach((t) => updateTransaction(t.id, t))
			});
		} else {
			const created = addTransactionSeries(
				base,
				form.schedule,
				form.schedule === 'parcelado' ? form.parcelas : form.mesesRecorrencia
			);
			const tipoLabel = base.tipo === 'receita' ? 'Receita' : 'Despesa';
			const seriesLabel = created.length > 1 ? ` (${created.length}x)` : '';
			showToast({
				message: `✓ ${tipoLabel} de ${fmtMoney(base.valor)} registrada${seriesLabel}.`,
				actionLabel: 'DESFAZER',
				onAction: () => created.forEach((tx) => removeTransaction(tx.id))
			});
		}
		onClose();
	}
</script>

<Modal {open} {onClose} {title} {subtitle} maxWidth="560px">
	<form onsubmit={submit} class="movement-form">
		<div class="segmented">
			<button type="button" class:active={form.tipo === 'despesa'} class="despesa" disabled={locked} onclick={() => (form.tipo = 'despesa')}
				>Despesa</button
			>
			<button type="button" class:active={form.tipo === 'receita'} class="receita" disabled={locked} onclick={() => (form.tipo = 'receita')}
				>Receita</button
			>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Valor (R$)</span>
				<input class="field-input" type="number" step="0.01" min="0" required disabled={locked} bind:value={form.valor} />
			</label>
			<label class="field">
				<span>Data</span>
				<input class="field-input" type="date" required disabled={locked} bind:value={form.data} />
			</label>
		</div>

		<label class="field">
			<span>Descrição</span>
			<input class="field-input" type="text" placeholder="Ex.: Mercado do mês" disabled={locked} bind:value={form.descricao} onblur={handleDescricaoBlur} />
		</label>

		<div class="form-grid">
			<label class="field">
				<span>Categoria</span>
				<select class="field-input" required disabled={locked} bind:value={form.categoriaId}>
					<option value="" disabled>Selecione</option>
					{#each categoriasDoTipo as c (c.id)}
						<option value={c.id}>{c.nome}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Subcategoria</span>
				<select class="field-input" disabled={locked || !categoriaSelecionada?.secundarios?.length} bind:value={form.subcategoriaId}>
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
				<select class="field-input" disabled={locked} bind:value={form.contaId}>
					<option value="">Sem conta</option>
					{#each appState.accounts as a (a.id)}
						<option value={a.id}>{a.nome}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>Forma de pagamento</span>
				<select class="field-input" disabled={locked} bind:value={form.formaPagamento}>
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

		{#if mode === 'edit-occurrence' && locked && transaction?.seriesId}
			<div class="series-actions-row">
				{#if onEditSeries}
					<button type="button" class="btn btn-ghost sm" onclick={handleEditSeriesClick}>Editar série</button>
				{/if}
				{#if onManageSeries}
					{#if transaction.seriesStatus === 'ativa'}
						<button type="button" class="btn btn-ghost sm" onclick={() => handleManageSeriesClick('pausar')}>Pausar série</button>
					{:else if transaction.seriesStatus === 'pausada'}
						<button type="button" class="btn btn-ghost sm" onclick={() => handleManageSeriesClick('retomar')}>Retomar série</button>
					{/if}
					{#if transaction.seriesStatus !== 'cancelada'}
						<button type="button" class="btn btn-ghost sm" onclick={() => handleManageSeriesClick('cancelar')}>Cancelar série</button>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="modal-footer" class:view-footer={mode === 'edit-occurrence' && locked}>
			{#if mode === 'edit-occurrence' && locked}
				<button type="button" class="btn btn-primary" onclick={unlock}><Pencil size={16} /> Editar</button>
				{#if onDuplicate && !transaction?.isTransferencia}
					<button type="button" class="btn btn-ghost" onclick={handleDuplicateClick}><Copy size={16} /> Duplicar</button>
				{/if}
				{#if onDelete}
					<button type="button" class="btn btn-danger" onclick={handleDeleteClick}><Trash2 size={16} /> Excluir</button>
				{/if}
			{:else if mode === 'edit-occurrence'}
				<button type="button" class="btn btn-ghost" onclick={cancelEdit}>Cancelar</button>
				<button type="submit" class="btn btn-primary">Salvar</button>
			{:else}
				<button type="submit" class="btn btn-primary">Salvar</button>
				<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
			{/if}
		</div>
	</form>
</Modal>

<style>
	/* Rodapé do modo visualização (Editar/Duplicar/Excluir): sempre na ordem do
	   DOM (Editar, Duplicar, Excluir) e sempre na mesma linha, mesmo no mobile
	   -- diferente do rodapé padrão (.modal-footer), que é row-reverse pra
	   destacar a ação primária (Salvar) à direita nos outros modos. */
	.modal-footer.view-footer {
		flex-direction: row;
		flex-wrap: nowrap;
	}
	@media (max-width: 480px) {
		.modal-footer.view-footer .btn {
			flex: 1 1 0;
			gap: 4px;
			padding: 0 8px;
			font-size: 12px;
			white-space: nowrap;
		}
	}
</style>
