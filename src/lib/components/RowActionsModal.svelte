<script>
	import Modal from './Modal.svelte';

	/**
	 * Modal genérico de ações de uma linha/card de lista (usado no lugar de
	 * botões "Editar/Duplicar/Excluir" sempre visíveis em cada item).
	 * actions: [{ label, icon (componente lucide-svelte), onClick, variant: 'default' | 'danger' }]
	 */
	let { open, onClose, eyebrow, title, subtitle, actions = [] } = $props();

	function run(action) {
		onClose();
		action.onClick();
	}
</script>

<Modal {open} {onClose} {eyebrow} {title} {subtitle} maxWidth="380px">
	<div class="row-actions-list">
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
	.row-actions-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
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
