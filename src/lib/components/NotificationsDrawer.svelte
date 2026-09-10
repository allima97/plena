<script>
	import { goto } from '$app/navigation';
	import { appState, setPaymentStatus } from '$lib/fin/store.svelte.js';
	import { buildAttentionItems } from '$lib/fin/attention.js';
	import { showToast } from '$lib/toast.svelte.js';
	import MoveFormModal from '$lib/goals/MoveFormModal.svelte';
	import { Bell } from 'lucide-svelte';

	let { open, onClose } = $props();
	let aporteModal = $state({ open: false, resourceId: null, goalId: null, prefill: null });

	const items = $derived(
		buildAttentionItems({
			transactions: appState.transactions,
			accounts: appState.accounts,
			goals: appState.goals,
			resources: appState.resources,
			resourceMoves: appState.resourceMoves,
			goalCategories: appState.goalCategories,
			installments: appState.installments,
			amortizations: appState.amortizations,
			alertThresholds: appState.alertThresholds,
			categories: appState.categories,
			startDay: appState.settings.monthStartDay || 1
		})
	);

	function pick(it) {
		if (it.action?.kind === 'pay') {
			const id = it.action.transactionId;
			setPaymentStatus(id, 'pago');
			onClose();
			showToast({
				message: 'Lançamento marcado como pago.',
				actionLabel: 'DESFAZER',
				onAction: () => setPaymentStatus(id, 'pendente')
			});
			return;
		}
		if (it.action?.kind === 'aporte') {
			const { goalId, resourceId, valor } = it.action;
			onClose();
			aporteModal = { open: true, resourceId, goalId, prefill: { description: 'Aporte', amount: Math.round(valor * 100) / 100 } };
			return;
		}
		onClose();
		goto(it.href);
	}

	function handleKeydown(e) {
		if (e.key === 'Escape') onClose();
	}
</script>

{#if open}
	<div class="notif-catcher" onclick={onClose} onkeydown={handleKeydown} role="presentation" tabindex="-1"></div>
	<div class="notif-drawer" role="dialog" aria-modal="true" aria-label="Notificações">
		<div class="notif-drawer-head">
			<p class="stat-label" style="margin:0">Notificações</p>
			<span class="badge" class:badge-red={items.length} class:badge-gray={!items.length}>{items.length}</span>
		</div>
		<div class="notif-drawer-list">
			{#if items.length}
				{#each items as it, i (i)}
					<div class="attention-item notif-drawer-item {it.tone}">
						<span class="attention-dot"></span>
						<p class="notif-drawer-text">{it.text}</p>
						<button class="link-more" onclick={() => pick(it)}>{it.actionLabel} ↗</button>
					</div>
				{/each}
			{:else}
				<div class="notif-drawer-empty">
					<Bell size={22} />
					<p>Tudo em dia por aqui.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<MoveFormModal
	open={aporteModal.open}
	resourceId={aporteModal.resourceId}
	goalId={aporteModal.goalId}
	prefill={aporteModal.prefill}
	onClose={() => (aporteModal = { ...aporteModal, open: false })}
/>
