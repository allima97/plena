<script>
	import Modal from '$lib/components/Modal.svelte';
	import { appState, addGoal, updateGoal } from '$lib/fin/store.svelte.js';
	import { GOAL_TYPE_OPTIONS } from './constants.js';
	import { CURRENCY_OPTIONS, currencyLabel } from '$lib/currency.js';

	let { open, editing = null, onClose, onSaved } = $props();

	function blank() {
		return {
			type: 'outro',
			name: '',
			currency: 'BRL',
			referenceRate: '',
			targetDate: '',
			contractNumber: '',
			initialTermMonths: '',
			remainingTermMonths: '',
			linkToBalance: false,
			targetAmount: '',
			notes: ''
		};
	}
	let form = $state(blank());

	$effect(() => {
		if (!open) return;
		form = editing
			? {
					type: editing.type,
					name: editing.name,
					currency: editing.currency || 'BRL',
					referenceRate: editing.referenceRate ?? '',
					targetDate: editing.targetDate || '',
					contractNumber: editing.contractNumber || '',
					initialTermMonths: editing.initialTermMonths || '',
					remainingTermMonths: editing.remainingTermMonths || '',
					linkToBalance: !!editing.linkToBalance,
					targetAmount: editing.targetAmount,
					notes: editing.notes || ''
				}
			: blank();
	});

	// Moeda padrão do sistema (Configurações) -- quando o objetivo é numa moeda diferente,
	// pedimos um câmbio de referência pra poder converter o ritmo mensal recomendado desse
	// objetivo pra essa moeda nos totais gerais (ex.: "Quanto posso gastar" no Dashboard).
	const moedaPadrao = $derived(appState.settings.moedaPadrao || 'BRL');
	const moedaDiferente = $derived((form.currency || 'BRL') !== moedaPadrao);

	function submit(e) {
		e.preventDefault();
		if (!form.name.trim()) return;
		const currency = (form.currency || 'BRL').trim() || 'BRL';
		const payload = {
			type: form.type,
			name: form.name.trim(),
			currency,
			referenceRate: currency !== moedaPadrao && form.referenceRate ? Number(form.referenceRate) || null : null,
			targetDate: form.targetDate || '',
			contractNumber: form.type === 'financiamento' ? form.contractNumber || '' : '',
			initialTermMonths: form.type === 'financiamento' && form.initialTermMonths ? Number(form.initialTermMonths) || null : null,
			remainingTermMonths: form.type === 'financiamento' && form.remainingTermMonths ? Number(form.remainingTermMonths) || null : null,
			linkToBalance: form.type === 'financiamento' ? !!form.linkToBalance : false,
			targetAmount: Number(form.targetAmount) || 0,
			notes: (form.notes || '').trim()
		};
		let goal;
		if (editing) {
			updateGoal(editing.id, payload);
			goal = { ...editing, ...payload };
		} else {
			goal = addGoal(payload);
		}
		onSaved?.(goal);
		onClose();
	}
</script>

<Modal {open} {onClose} title={editing ? 'Editar objetivo' : 'Novo objetivo'} maxWidth="520px">
	<form onsubmit={submit} class="movement-form">
		<div class="field">
			<span>Tipo</span>
			<div class="goal-type-grid">
				{#each GOAL_TYPE_OPTIONS as opt (opt.value)}
					<button type="button" class="goal-type-btn" class:active={form.type === opt.value} onclick={() => (form.type = opt.value)}>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		<label class="field"><span>Nome do objetivo</span><input class="field-input" required bind:value={form.name} /></label>

		<div class="form-grid">
			<label class="field">
				<span>Moeda do objetivo</span>
				<select class="field-input" bind:value={form.currency}>
					{#each CURRENCY_OPTIONS as opt (opt.code)}
						<option value={opt.code}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="field"><span>Valor alvo ({form.currency || 'BRL'})</span><input class="field-input" type="number" step="0.01" bind:value={form.targetAmount} /></label>
		</div>

		{#if moedaDiferente}
			<label class="field">
				<span>Câmbio de referência (1 {form.currency} = quantos {moedaPadrao}?)</span>
				<input class="field-input" type="number" step="0.0001" min="0" placeholder="ex: 6.15" bind:value={form.referenceRate} />
				<span class="field-hint">
					Usado só pra converter o ritmo mensal recomendado deste objetivo pra {currencyLabel(moedaPadrao)} nos totais gerais
					(como "Quanto posso gastar"). Atualize de vez em quando conforme o câmbio mudar — não precisa ser exato.
				</span>
			</label>
		{/if}

		<div class="form-grid">
			<label class="field"><span>Prazo (opcional)</span><input class="field-input" type="date" bind:value={form.targetDate} /></label>
		</div>

		{#if form.type === 'financiamento'}
			<div class="form-grid">
				<label class="field">
					<span style="min-height:3em; display:block">Prazo inicial do contrato (nº de parcelas)</span>
					<input class="field-input" type="number" min="1" step="1" placeholder="ex: 313" bind:value={form.initialTermMonths} />
				</label>
				<label class="field">
					<span style="min-height:3em; display:block">Parcelas restantes atualmente</span>
					<input class="field-input" type="number" min="0" step="1" placeholder="ex: 267" bind:value={form.remainingTermMonths} />
				</label>
			</div>
			<p class="movement-meta" style="margin:-6px 0 0">
				Use estes dois campos quando o prazo restante não bater com "parcelas pagas − prazo inicial" por causa de amortizações extras que reduziram o prazo.
			</p>
			<div class="form-grid">
				<label class="field"><span>Número do contrato</span><input class="field-input" bind:value={form.contractNumber} /></label>
				<label class="field checkbox-field">
					<span>&nbsp;</span>
					<label class="checkbox-row"><input type="checkbox" bind:checked={form.linkToBalance} /> Meta = saldo devedor atual</label>
				</label>
			</div>
		{/if}

		<label class="field"><span>Observações</span><textarea class="field-input" rows="2" bind:value={form.notes}></textarea></label>

		<div class="modal-footer">
			<button type="submit" class="btn btn-primary">Salvar</button>
			<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
		</div>
	</form>
</Modal>
