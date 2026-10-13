<script>
	import Modal from '$lib/components/Modal.svelte';
	import { todayISO, fmtDate } from '$lib/format.js';

	let { open, installment, installmentNumber, onClose, onPaid } = $props();

	let paymentDate = $state(todayISO());
	let paymentMethod = $state('');

	const existingPayment = $derived(installment?.payments?.find((p) => p.installmentNumber === installmentNumber));

	// Calcula a data de vencimento da parcela
	const dueDate = $derived.by(() => {
		if (!installment || !installment.firstDate) return '';
		const [year, month, day] = installment.firstDate.split('-').map(Number);
		const date = new Date(year, month - 1 + (installmentNumber - 1), day);
		const pad = (n) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	});

	function submit(e) {
		e.preventDefault();
		if (!paymentDate || !paymentMethod.trim()) return;
		onPaid(installment, installmentNumber, paymentDate, paymentMethod.trim());
	}

	$effect(() => {
		if (open) {
			paymentDate = existingPayment?.paymentDate || todayISO();
			paymentMethod = existingPayment?.paymentMethod || '';
		}
	});
</script>

<Modal {open} {onClose} title={existingPayment ? 'Editar pagamento' : 'Marcar parcela como paga'} maxWidth="400px">
	<form onsubmit={submit} class="movement-form">
		<p style="margin:0 0 16px 0;color:var(--text-muted)">
			Parcela {installmentNumber}/{installment?.installmentCount} de <strong>{installment?.description || 'sem descrição'}</strong>
		</p>

		<label class="field">
			<span>Data de vencimento</span>
			<input class="field-input" type="date" value={dueDate} disabled style="background:var(--bg-muted)" />
			<span class="field-hint">Vencimento original: {dueDate ? fmtDate(dueDate) : '-'}</span>
		</label>

		<label class="field">
			<span>Data do pagamento</span>
			<input class="field-input" type="date" required bind:value={paymentDate} />
		</label>

		<label class="field">
			<span>Forma de pagamento</span>
			<input class="field-input" required bind:value={paymentMethod} placeholder="ex: Pix, Cartão Nubank, etc." />
		</label>

		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">{existingPayment ? 'Salvar alterações' : 'Marcar como paga'}</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>

<style>
	.movement-form {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.field, .field-input {
		min-width: 0;
		max-width: 100%;
	}
	@media (max-width: 480px) {
		.modal-footer {
			flex-direction: column;
		}
		.modal-footer .btn {
			width: 100%;
			white-space: normal;
		}
	}
</style>
