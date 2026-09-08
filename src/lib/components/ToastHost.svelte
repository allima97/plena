<script>
	import { toastState, dismissToast, runToastAction } from '$lib/toast.svelte.js';
	import { X } from 'lucide-svelte';
</script>

<div class="toast-host">
	{#each toastState.items as t (t.id)}
		<div class="toast" role="status">
			<p class="toast-message">{t.message}</p>
			{#if t.actionLabel}
				<button class="toast-action" onclick={() => runToastAction(t.id)}>{t.actionLabel}</button>
			{/if}
			<button class="toast-close" onclick={() => dismissToast(t.id)} aria-label="Fechar"><X size={14} /></button>
		</div>
	{/each}
</div>
