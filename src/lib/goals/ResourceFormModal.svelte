<script>
	import Modal from '$lib/components/Modal.svelte';
	import { addResource, updateResource } from '$lib/fin/store.svelte.js';
	import { RESOURCE_GROUPS } from './constants.js';

	let { open, goalId, editing = null, onClose } = $props();

	function blank() {
		return { name: '', group: 'outros', balance: '' };
	}
	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing ? { name: editing.name, group: editing.group || 'outros', balance: '' } : blank();
	});

	function submit(e) {
		e.preventDefault();
		if (!form.name.trim()) return;
		if (editing) {
			updateResource(editing.id, { name: form.name.trim(), group: form.group });
		} else {
			addResource(goalId, { name: form.name.trim(), group: form.group }, Number(form.balance) || 0);
		}
		onClose();
	}
</script>

<Modal {open} {onClose} title={editing ? 'Editar recurso' : 'Novo recurso'} maxWidth="440px">
	<form onsubmit={submit} class="movement-form">
		<label class="field"><span>Nome</span><input class="field-input" required placeholder="Ex.: FGTS, Aplicação, Conta em EUR" bind:value={form.name} /></label>
		<label class="field">
			<span>Categoria</span>
			<select class="field-input" bind:value={form.group}>
				{#each RESOURCE_GROUPS as g (g.value)}
					<option value={g.value}>{g.label}</option>
				{/each}
			</select>
		</label>
		{#if !editing}
			<label class="field"><span>Saldo inicial (opcional)</span><input class="field-input" type="number" step="0.01" placeholder="0,00" bind:value={form.balance} /></label>
		{/if}
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">{editing ? 'Salvar' : 'Adicionar'}</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
