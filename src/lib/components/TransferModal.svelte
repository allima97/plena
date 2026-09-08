<script>
	import Modal from './Modal.svelte';
	import { appState, addTransfer } from '$lib/fin/store.svelte.js';
	import { todayISO } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';
	import { ArrowLeftRight } from 'lucide-svelte';

	let { open, onClose } = $props();

	function blank() {
		return {
			contaOrigemId: appState.accounts[0]?.id || '',
			contaDestinoId: appState.accounts[1]?.id || '',
			valor: '',
			data: todayISO(),
			descricao: ''
		};
	}
	let form = $state(blank());

	$effect(() => {
		if (open) form = blank();
	});

	const contasDestino = $derived(appState.accounts.filter((a) => a.id !== form.contaOrigemId));
	const mesmaConta = $derived(form.contaOrigemId && form.contaOrigemId === form.contaDestinoId);

	function submit(e) {
		e.preventDefault();
		if (!form.valor || !Number(form.valor) || mesmaConta || !form.contaOrigemId || !form.contaDestinoId) return;
		addTransfer({
			contaOrigemId: form.contaOrigemId,
			contaDestinoId: form.contaDestinoId,
			valor: Number(form.valor),
			data: form.data,
			descricao: form.descricao
		});
		showToast({ message: '✓ Transferência registrada.' });
		onClose();
	}
</script>

<Modal {open} {onClose} eyebrow="Movimentação interna" title="Nova transferência" subtitle="Move dinheiro entre suas contas sem contar como receita ou despesa nos relatórios.">
	<form class="transfer-form" onsubmit={submit}>
		<div class="transfer-accounts">
			<div class="field">
				<label for="transfer-origem">De</label>
				<select id="transfer-origem" class="field-input" bind:value={form.contaOrigemId}>
					{#each appState.accounts as acc (acc.id)}
						<option value={acc.id}>{acc.nome}</option>
					{/each}
				</select>
			</div>
			<span class="transfer-arrow"><ArrowLeftRight size={16} /></span>
			<div class="field">
				<label for="transfer-destino">Para</label>
				<select id="transfer-destino" class="field-input" bind:value={form.contaDestinoId}>
					{#each contasDestino as acc (acc.id)}
						<option value={acc.id}>{acc.nome}</option>
					{/each}
				</select>
			</div>
		</div>
		{#if mesmaConta}
			<p class="field-error">Escolha duas contas diferentes.</p>
		{/if}
		<div class="field">
			<label for="transfer-valor">Valor</label>
			<input id="transfer-valor" class="field-input" type="number" step="0.01" min="0" placeholder="R$ 0,00" bind:value={form.valor} required />
		</div>
		<div class="field">
			<label for="transfer-data">Data</label>
			<input id="transfer-data" class="field-input" type="date" bind:value={form.data} />
		</div>
		<div class="field">
			<label for="transfer-desc">Descrição (opcional)</label>
			<input id="transfer-desc" class="field-input" type="text" placeholder="Ex: reforço para a reserva" bind:value={form.descricao} />
		</div>
		<button type="submit" class="btn btn-primary" style="width:100%" disabled={mesmaConta}>Transferir</button>
	</form>
</Modal>
