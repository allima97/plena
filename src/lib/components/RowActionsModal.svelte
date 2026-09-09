<script>
	import Modal from './Modal.svelte';

	/**
	 * Modal genérico de detalhes + ações de uma linha/card de lista (usado no
	 * lugar de botões "Editar/Duplicar/Excluir" sempre visíveis em cada item).
	 * details: [{ label, value, tone: 'positive' | 'negative' }] -- visão geral do item, antes das ações.
	 * actions: [{ label, icon (componente lucide-svelte), onClick, variant: 'default' | 'danger' }]
	 */
	let { open, onClose, eyebrow, title, subtitle, details = [], actions = [] } = $props();

	function run(action) {
		onClose();
		action.onClick();
	}
</script>

<Modal {open} {onClose} {eyebrow} {title} {subtitle} maxWidth="380px">
	{#if details.length}
		<div class="row-details">
			{#each details as d (d.label)}
				<div class="row-details-item">
					<span class="row-details-k">{d.label}</span>
					<span class="row-details-v" class:positive={d.tone === 'positive'} class:negative={d.tone === 'negative'}>{d.value}</span>
				</div>
			{/each}
		</div>
	{/if}
	<div class="row-actions-list" class:with-details={details.length}>
		{#each actions as action (action.label)}
			<button type="button" class="row-action-btn" class:danger={action.variant === 'danger'} onclick={() => run(action)}>
				{#if action.icon}
					<span class="row-action-icon"><svelte:component this={action.icon} size={16} /></span>
				{/if}
				{action.label}
			</button>
		{/each}
	</div>
</Modal>

<style>
	.row-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 14px;
		margin-bottom: 6px;
		border-bottom: 1px solid var(--border-soft);
	}
	.row-details-item {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.row-details-k {
		font-size: 12px;
		font-weight: 600;
		color: var(--ink-faint);
		flex: none;
	}
	.row-details-v {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink);
		text-align: right;
	}
	.row-details-v.positive {
		color: var(--income);
	}
	.row-details-v.negative {
		color: var(--expense);
	}
	.row-actions-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row-actions-list.with-details {
		margin-top: 2px;
	}
	.row-action-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		text-align: left;
		padding: 12px 14px;
		border-radius: 12px;
		border: none;
		background: none;
		color: var(--ink);
		font-size: 14px;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
	}
	.row-action-btn:hover {
		background: var(--surface-2);
	}
	.row-action-icon {
		display: flex;
		color: var(--ink-faint);
		flex: none;
	}
	.row-action-btn.danger {
		color: var(--expense);
	}
	.row-action-btn.danger .row-action-icon {
		color: var(--expense);
	}
	.row-action-btn.danger:hover {
		background: var(--expense-soft);
	}
</style>
