<script>
	import Modal from '$lib/components/Modal.svelte';
	import { addAmortization, updateAmortization } from '$lib/fin/store.svelte.js';
	import { AMORT_TIPOS } from './constants.js';
	import { todayISO } from '$lib/format.js';

	let { open, goalId, editing = null, onClose } = $props();

	function blank() {
		return { date: todayISO(), amount: '', tipo: AMORT_TIPOS[0] };
	}
	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing ? { date: editing.date, amount: editing.amount, tipo: editing.tipo } : blank();
	});

	function submit(e) {
		e.preventDefault();
		if (form.amount === '' || !form.date) return;
		const payload = { date: form.date, amount: Math.abs(Number(form.amount) || 0), tipo: form.tipo };
		if (editing) updateAmortization(editing.id, payload);
		else addAmortization(goalId, payload);
		onClose();
	}
</script>

<Modal {open} {onClose} title={editing ? 'Editar amortização' : 'Nova amortização'} maxWidth="420px">
	<form onsubmit={submit} class="movement-form">
		<div class="form-grid">
			<label class="field"><span>Data</span><input class="field-input" type="date" required bind:value={form.date} /></label>
			<label class="field"><span>Valor</span><input class="field-input" type="number" step="0.01" min="0" required bind:value={form.amount} /></label>
		</div>
		<label class="field">
			<span>Tipo de amortização</span>
			<select class="field-input" bind:value={form.tipo}>
				{#each AMORT_TIPOS as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</label>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">{editing ? 'Salvar' : 'Adicionar'}</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
