<script>
	import { X } from 'lucide-svelte';

	let { open, onClose, title, subtitle, eyebrow, maxWidth = '520px', children, footer } = $props();

	function stop(e) {
		e.stopPropagation();
	}
</script>

{#if open}
	<div class="modal-backdrop" onclick={onClose} onkeydown={(e) => e.key === "Escape" && onClose()} role="presentation" tabindex="-1">
		<div
			class="modal-card"
			style="max-width:{maxWidth}"
			onclick={stop}
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<div class="modal-head">
				<div>
					{#if eyebrow}<p class="modal-eyebrow">{eyebrow}</p>{/if}
					{#if title}<h2 class="font-display modal-title">{title}</h2>{/if}
					{#if subtitle}<p class="modal-subtitle">{subtitle}</p>{/if}
				</div>
				<button class="icon-btn" onclick={onClose} aria-label="Fechar"><X size={18} /></button>
			</div>
			<div class="modal-body">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="modal-footer">
					{@render footer?.()}
				</div>
			{/if}
		</div>
	</div>
{/if}
