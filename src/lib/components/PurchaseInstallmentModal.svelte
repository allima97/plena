<script>
	import Modal from '$lib/components/Modal.svelte';
	import { appState, addPurchaseInstallment, updatePurchaseInstallment } from '$lib/fin/store.svelte.js';
	import { todayISO } from '$lib/format.js';

	let { open, editing = null, onClose, onSaved } = $props();

	function blank() {
		return {
			description: '',
			totalValue: '',
			installmentCount: '',
			firstDate: todayISO(),
			paymentMethod: '',
			paidUpTo: null
		};
	}

	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing
			? {
					description: editing.description || '',
					totalValue: editing.totalValue,
					installmentCount: editing.installmentCount,
					firstDate: editing.firstDate,
					paymentMethod: editing.paymentMethod || '',
					paidUpTo: editing.paidUpTo || null
				}
			: blank();
	});

	function submit(e) {
		e.preventDefault();
		if (!form.totalValue || !form.installmentCount || !form.firstDate) return;

		const payload = {
			description: form.description.trim(),
			totalValue: Number(form.totalValue) || 0,
			installmentCount: Number(form.installmentCount) || 1,
			firstDate: form.firstDate,
			paymentMethod: form.paymentMethod.trim(),
			paidUpTo: form.paidUpTo ? Number(form.paidUpTo) : null
		};

		let installment;
		if (editing) {
			updatePurchaseInstallment(editing.id, payload);
			installment = { ...editing, ...payload };
		} else {
			installment = addPurchaseInstallment(payload);
		}
		onSaved?.(installment);
		onClose();
	}

	// Preview das datas das parcelas
	const previewDates = $derived.by(() => {
		if (!form.firstDate || !form.installmentCount) return [];
		const count = Number(form.installmentCount) || 1;
		const dates = [];
		const [year, month, day] = form.firstDate.split('-').map(Number);
		for (let i = 0; i < count; i++) {
			const date = new Date(year, month - 1 + i, day);
			const pad = (n) => String(n).padStart(2, '0');
			dates.push(`${date.getDate()}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`);
		}
		return dates;
	});

	const installmentValue = $derived.by(() => {
		const total = Number(form.totalValue) || 0;
		const count = Number(form.installmentCount) || 1;
		return count > 0 ? total / count : 0;
	});
</script>

<Modal {open} {onClose} title={editing ? 'Editar parcelamento' : 'Novo parcelamento'} maxWidth="520px">
	<form onsubmit={submit} class="movement-form">
		<label class="field">
			<span>Descrição</span>
			<input class="field-input" bind:value={form.description} placeholder="ex: TV 55 polegadas" />
		</label>

		<div class="form-grid">
			<label class="field">
				<span>Valor total (R$)</span>
				<input class="field-input" type="number" step="0.01" min="0" required bind:value={form.totalValue} placeholder="ex: 1000.00" />
			</label>
			<label class="field">
				<span>Número de parcelas</span>
				<input class="field-input" type="number" min="1" step="1" required bind:value={form.installmentCount} placeholder="ex: 10" />
			</label>
		</div>

		<div class="form-grid">
			<label class="field">
				<span>Vencimento da 1ª parcela</span>
				<input class="field-input" type="date" required bind:value={form.firstDate} />
			</label>
			<label class="field">
				<span>Forma de pagamento</span>
				<input class="field-input" bind:value={form.paymentMethod} placeholder="ex: 10x no cartão Latam Pass" />
			</label>
		</div>

		{#if previewDates.length > 0}
			<div class="preview-section">
				<p class="preview-label">Preview das parcelas:</p>
				<div class="preview-dates">
					{#each previewDates as date, i (i)}
						<span class="preview-date">{i + 1}x: {date}</span>
					{/each}
				</div>
				<p class="preview-value">Valor de cada parcela: <strong>R$ {installmentValue.toFixed(2)}</strong></p>
			</div>
		{/if}

		{#if editing}
			<label class="field checkbox-field">
				<span>&nbsp;</span>
				<label class="checkbox-row">
					<input type="checkbox" bind:checked={form.paidUpTo} />
					Marcar como quitado (todas as parcelas já foram pagas)
				</label>
			</label>
		{/if}

		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>

<style>
	.preview-section {
		background: var(--bg-muted);
		padding: 12px;
		border-radius: 6px;
		margin: 8px 0;
	}

	.preview-label {
		font-size: 13px;
		font-weight: 500;
		margin: 0 0 8px 0;
	}

	.preview-dates {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.preview-date {
		font-size: 12px;
		background: var(--card-bg);
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.preview-value {
		font-size: 13px;
		margin: 0;
	}
</style>
