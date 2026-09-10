<script>
	import Modal from '$lib/components/Modal.svelte';
	import { appState, addResourceMove, updateResourceMove, removeResourceMove, resolveGoalCategoryId, goalCategoryName } from '$lib/fin/store.svelte.js';
	import { todayISO, fmtMoney } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';

	let { open, resourceId, goalId, editing = null, prefill = null, onClose } = $props();

	function blank() {
		return { date: todayISO(), description: '', sign: '1', amount: '', categoryName: '', exchangeRate: '' };
	}
	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing
			? {
					date: editing.date,
					description: editing.description,
					sign: editing.amount < 0 ? '-1' : '1',
					amount: Math.abs(editing.amount),
					categoryName: editing.categoryId ? goalCategoryName(editing.categoryId) : '',
					exchangeRate: editing.exchangeRate ?? ''
				}
			: { ...blank(), ...(prefill || {}) };
	});

	// Objetivo numa moeda diferente da padrão do sistema (ex.: guardar Euros pra uma viagem):
	// pede o câmbio do dia pra guardar o equivalente na moeda padrão só como referência -- não
	// cria lançamento nenhum em Movimentações, o usuário já registra a saída de caixa lá.
	const goal = $derived(appState.goals.find((g) => g.id === goalId));
	const moedaPadrao = $derived(appState.settings.moedaPadrao || 'BRL');
	const moedaObjetivo = $derived(goal?.currency || 'BRL');
	const moedaDiferente = $derived(moedaObjetivo !== moedaPadrao);
	const baseAmountPreview = $derived.by(() => {
		const valor = Number(form.amount) || 0;
		const taxa = Number(form.exchangeRate) || 0;
		return moedaDiferente && valor > 0 && taxa > 0 ? valor * taxa : null;
	});

	function submit(e) {
		e.preventDefault();
		const description = form.description.trim();
		if (!description || form.amount === '') return;
		const sign = Number(form.sign) < 0 ? -1 : 1;
		const amount = Math.abs(Number(form.amount) || 0) * sign;
		const categoryId = resolveGoalCategoryId(form.categoryName);
		const exchangeRate = moedaDiferente && form.exchangeRate ? Number(form.exchangeRate) || null : null;
		const baseAmount = exchangeRate ? amount * exchangeRate : null;
		if (editing) {
			updateResourceMove(editing.id, { date: form.date || todayISO(), description, amount, categoryId, exchangeRate, baseAmount });
			showToast({ message: '✓ Lançamento atualizado.' });
		} else {
			const created = addResourceMove(resourceId, goalId, { date: form.date || todayISO(), description, amount, categoryId, exchangeRate, baseAmount });
			showToast({
				message: `✓ ${amount >= 0 ? 'Aporte' : 'Retirada'} de ${fmtMoney(Math.abs(amount), moedaObjetivo)} registrado${amount >= 0 ? '' : 'a'}.`,
				actionLabel: 'DESFAZER',
				onAction: () => removeResourceMove(created.id)
			});
		}
		onClose();
	}
</script>

<Modal {open} {onClose} title={editing ? 'Editar lançamento' : 'Novo lançamento'} maxWidth="440px">
	<form onsubmit={submit} class="movement-form">
		<div class="form-grid">
			<label class="field"><span>Data</span><input class="field-input" type="date" bind:value={form.date} /></label>
			<label class="field">
				<span>Tipo</span>
				<select class="field-input" bind:value={form.sign}>
					<option value="1">Entrada</option>
					<option value="-1">Saída</option>
				</select>
			</label>
		</div>
		<label class="field"><span>Descrição</span><input class="field-input" placeholder="Ex.: Rendimento" required bind:value={form.description} /></label>
		<label class="field">
			<span>Categoria</span>
			<input class="field-input" list="goal-category-options" placeholder="Ex.: Aporte, Juros, Rendimentos" bind:value={form.categoryName} />
			<datalist id="goal-category-options">
				{#each appState.goalCategories as c (c.id)}
					<option value={c.name}></option>
				{/each}
			</datalist>
			<span class="field-hint">categorias marcadas para o ritmo entram no cálculo da Média Geral</span>
		</label>
		<label class="field"><span>Valor ({moedaObjetivo})</span><input class="field-input" type="number" step="0.01" min="0" required bind:value={form.amount} /></label>
		{#if moedaDiferente}
			<label class="field">
				<span>Câmbio do dia (1 {moedaObjetivo} = quantos {moedaPadrao}?)</span>
				<input class="field-input" type="number" step="0.0001" min="0" placeholder="ex: 6.15" bind:value={form.exchangeRate} />
				{#if baseAmountPreview !== null}
					<span class="field-hint">≈ {fmtMoney(baseAmountPreview, moedaPadrao)} — só uma referência, não cria lançamento em Movimentações.</span>
				{:else}
					<span class="field-hint">Opcional: preenche só pra guardar de referência quanto isso equivale em {moedaPadrao}.</span>
				{/if}
			</label>
		{/if}
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">{editing ? 'Salvar' : 'Adicionar'}</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
