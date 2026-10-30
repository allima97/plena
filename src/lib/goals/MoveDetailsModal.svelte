<script>
	import Modal from '$lib/components/Modal.svelte';
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import { goalCategoryName } from '$lib/fin/store.svelte.js';
	import { Pencil, Trash2 } from 'lucide-svelte';

	let { open, move, goalCurrency, onEdit, onDelete, onClose } = $props();

	const categoryName = $derived(move.categoryId ? goalCategoryName(move.categoryId) : '-');
</script>

<Modal {open} {onClose} title={move.description} subtitle={fmtDate(move.date)} maxWidth="440px">
	<div class="details-container">
		<div class="detail-row">
			<span class="detail-label">Valor</span>
			<span class="detail-value" class:positive={move.amount >= 0} class:negative={move.amount < 0}>
				{fmtMoney(move.amount, goalCurrency)}
			</span>
		</div>
		{#if move.baseAmount}
			<div class="detail-row">
				<span class="detail-label">Valor base</span>
				<span class="detail-value">{fmtMoney(move.baseAmount, 'BRL')}</span>
			</div>
		{/if}
		{#if move.exchangeRate}
			<div class="detail-row">
				<span class="detail-label">Câmbio</span>
				<span class="detail-value">{move.exchangeRate}</span>
			</div>
		{/if}
		<div class="detail-row">
			<span class="detail-label">Data</span>
			<span class="detail-value">{fmtDate(move.date)}</span>
		</div>
		<div class="detail-row">
			<span class="detail-label">Categoria</span>
			<span class="detail-value">{categoryName}</span>
		</div>
	</div>
	<div class="modal-footer">
		<button type="button" class="btn btn-ghost" onclick={onEdit}><Pencil size={16} /> Editar</button>
		<button type="button" class="btn btn-danger" onclick={onDelete}><Trash2 size={16} /> Excluir</button>
		<button type="button" class="btn btn-ghost" onclick={onClose}>Cancelar</button>
	</div>
</Modal>

<style>
	.details-container {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 0;
		margin-bottom: 16px;
		border-bottom: 1px solid var(--border-soft);
	}
	.detail-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
	.detail-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-faint);
		flex: none;
	}
	.detail-value {
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
		text-align: right;
	}
	.detail-value.positive {
		color: var(--income);
	}
	.detail-value.negative {
		color: var(--expense);
	}
	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}
	.modal-footer .btn {
		min-height: 40px;
	}
</style>
