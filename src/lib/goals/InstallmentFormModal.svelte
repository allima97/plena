<script>
	import Modal from '$lib/components/Modal.svelte';
	import { appState, addInstallment, updateInstallment, removeInstallment } from '$lib/fin/store.svelte.js';
	import { todayISO, fmtMoney } from '$lib/format.js';
	import { showToast } from '$lib/toast.svelte.js';

	let { open, goalId, editing = null, onClose } = $props();

	function blank() {
		const list = appState.installments.filter((i) => i.goalId === goalId).sort((a, b) => a.number - b.number);
		const last = list.length ? list[list.length - 1] : null;
		return {
			number: last ? last.number + 1 : 1,
			date: todayISO(),
			valorPrestacao: last ? last.valorPrestacao : '',
			amortizacao: last ? last.amortizacao : '',
			juros: last ? last.juros : '',
			seguros: last ? last.seguros : '',
			taxas: last ? last.taxas : '',
			encargoLiquido: last ? last.encargoLiquido : '',
			valorDevido: last ? last.valorDevido : '',
			valorDiferenca: '0',
			correcaoMonetaria: last ? last.correcaoMonetaria : '',
			saldoDevedor: last ? last.saldoDevedor - (last.amortizacao || 0) : ''
		};
	}
	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing
			? {
					number: editing.number,
					date: editing.date,
					valorPrestacao: editing.valorPrestacao,
					amortizacao: editing.amortizacao,
					juros: editing.juros,
					seguros: editing.seguros,
					taxas: editing.taxas,
					encargoLiquido: editing.encargoLiquido,
					valorDevido: editing.valorDevido,
					valorDiferenca: editing.valorDiferenca,
					correcaoMonetaria: editing.correcaoMonetaria,
					saldoDevedor: editing.saldoDevedor
				}
			: blank();
	});

	const fields = [
		['valorPrestacao', 'Valor da prestação'],
		['encargoLiquido', 'Encargo líquido'],
		['amortizacao', 'Amortização'],
		['juros', 'Juros'],
		['seguros', 'Seguros'],
		['taxas', 'Taxas'],
		['valorDevido', 'Valor devido'],
		['valorDiferenca', 'Valor da diferença'],
		['correcaoMonetaria', 'Correção monetária'],
		['saldoDevedor', 'Saldo devedor']
	];

	function submit(e) {
		e.preventDefault();
		const n = (v) => {
			const x = parseFloat(v);
			return isFinite(x) ? x : 0;
		};
		const payload = {
			number: Math.round(n(form.number) || 1),
			date: form.date || todayISO(),
			valorPrestacao: n(form.valorPrestacao),
			amortizacao: n(form.amortizacao),
			juros: n(form.juros),
			seguros: n(form.seguros),
			taxas: n(form.taxas),
			encargoLiquido: n(form.encargoLiquido),
			valorDevido: n(form.valorDevido),
			valorDiferenca: n(form.valorDiferenca),
			correcaoMonetaria: n(form.correcaoMonetaria),
			saldoDevedor: n(form.saldoDevedor)
		};
		if (editing) {
			updateInstallment(editing.id, payload);
			showToast({ message: '✓ Prestação atualizada.' });
		} else {
			const created = addInstallment(goalId, payload);
			showToast({
				message: `✓ Prestação nº ${payload.number} registrada — saldo devedor atualizado para ${fmtMoney(payload.saldoDevedor)}.`,
				actionLabel: 'DESFAZER',
				onAction: () => removeInstallment(created.id)
			});
		}
		onClose();
	}
</script>

<Modal {open} {onClose} title={editing ? 'Editar prestação' : 'Registrar prestação'} maxWidth="560px">
	<form onsubmit={submit} class="movement-form">
		<div class="form-grid">
			<label class="field"><span>Número da prestação</span><input class="field-input" type="number" step="1" bind:value={form.number} /></label>
			<label class="field"><span>Data</span><input class="field-input" type="date" bind:value={form.date} /></label>
		</div>
		<div class="form-grid">
			{#each fields as [key, label] (key)}
				<label class="field"><span>{label}</span><input class="field-input" type="number" step="0.01" bind:value={form[key]} /></label>
			{/each}
		</div>
		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">{editing ? 'Salvar' : 'Registrar'}</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
