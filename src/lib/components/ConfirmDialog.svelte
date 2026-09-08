<script>
	let { open, title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = true, onConfirm, onCancel } = $props();
</script>

{#if open}
	<div class="modal-backdrop" onclick={onCancel} onkeydown={(e) => e.key === "Escape" && onCancel()} role="presentation" tabindex="-1">
		<div class="modal-card confirm-card" onclick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
			<div class="confirm-icon" class:danger>!</div>
			<h3 class="font-display modal-title" style="margin-top:18px">{title}</h3>
			<p class="modal-subtitle">{message}</p>
			<div class="confirm-actions">
				<button class="btn btn-ghost" onclick={onCancel}>{cancelLabel}</button>
				<button class="btn" class:btn-danger-solid={danger} onclick={onConfirm}>{confirmLabel}</button>
			</div>
		</div>
	</div>
{/if}
