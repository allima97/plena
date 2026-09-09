<script>
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import { ArrowDownRight, ArrowUpRight, ArrowLeftRight, Repeat, Layers, Pencil, Copy, Trash2, Pause, Play, Ban } from 'lucide-svelte';
	import RowActionsModal from './RowActionsModal.svelte';

	let { t, categoria, subcategoria, conta, onTogglePayment, onEditOccurrence, onEditSeries, onManageSeries, onDuplicate, onDelete } = $props();

	let actionsOpen = $state(false);

	function openActions() {
		actionsOpen = true;
	}
	function togglePaymentClick(e) {
		e.stopPropagation();
		onTogglePayment(t);
	}

	const actions = $derived.by(() => {
		const list = [];
		if (!t.isTransferencia) list.push({ label: 'Editar', icon: Pencil, onClick: () => onEditOccurrence(t) });
		if (t.seriesId) {
			list.push({ label: 'Editar série', icon: Layers, onClick: () => onEditSeries(t) });
			if (t.seriesStatus === 'ativa') list.push({ label: 'Pausar série', icon: Pause, onClick: () => onManageSeries(t.seriesId, 'pausar') });
			else if (t.seriesStatus === 'pausada') list.push({ label: 'Retomar série', icon: Play, onClick: () => onManageSeries(t.seriesId, 'retomar') });
			if (t.seriesStatus !== 'cancelada') list.push({ label: 'Cancelar série', icon: Ban, onClick: () => onManageSeries(t.seriesId, 'cancelar') });
		}
		if (!t.isTransferencia) list.push({ label: 'Duplicar', icon: Copy, onClick: () => onDuplicate(t) });
		list.push({ label: 'Excluir', icon: Trash2, variant: 'danger', onClick: () => onDelete(t) });
		return list;
	});
</script>

<div
	class="movement-row"
	role="button"
	tabindex="0"
	onclick={openActions}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openActions();
		}
	}}
>
	<span class="type-icon" class:income={t.tipo === 'receita' && !t.isTransferencia} class:transfer={t.isTransferencia}>
		{#if t.isTransferencia}<ArrowLeftRight size={16} />{:else if t.tipo === 'receita'}<ArrowUpRight size={16} />{:else}<ArrowDownRight size={16} />{/if}
	</span>

	<div class="movement-info">
		<div class="movement-title-row">
			<p class="movement-desc">{t.descricao || categoria?.nome || 'Lançamento'}</p>
			{#if t.isTransferencia}
				<span class="badge badge-purple">Transferência</span>
			{/if}
			{#if t.seriesId}
				<span class="badge badge-blue">
					{#if t.seriesKind === 'parcelado'}<Layers size={11} /> {t.parcelaAtual}/{t.parcelaTotal}
					{:else}<Repeat size={11} /> recorrente{/if}
				</span>
				<span
					class="badge"
					class:badge-green={t.seriesStatus === 'ativa'}
					class:badge-orange={t.seriesStatus === 'pausada'}
					class:badge-gray={t.seriesStatus === 'cancelada'}
				>
					{t.seriesStatus}
				</span>
			{/if}
			<button
				class="badge status-toggle"
				class:badge-green={t.statusPagamento === 'pago'}
				class:badge-orange={t.statusPagamento !== 'pago'}
				onclick={togglePaymentClick}
				title="Alternar status de pagamento"
			>
				{t.statusPagamento === 'pago' ? 'Pago' : 'Pendente'}
			</button>
		</div>
		<p class="movement-meta">
			{#if t.isTransferencia}
				{conta?.nome || 'Sem conta'}
			{:else}
				{categoria?.nome || 'Sem categoria'}{subcategoria ? ` · ${subcategoria}` : ''} · {conta?.nome || 'Sem conta'}
			{/if}
		</p>
	</div>

	<div class="movement-amount">
		<p class="font-display privacy-value" class:money-in={t.tipo === 'receita'} class:money-out={t.tipo === 'despesa'}>
			{t.tipo === 'receita' ? '+' : '−'} {fmtMoney(t.valor)}
		</p>
		<p class="movement-date">{fmtDate(t.data)}</p>
	</div>
</div>

<RowActionsModal
	open={actionsOpen}
	onClose={() => (actionsOpen = false)}
	title={t.descricao || categoria?.nome || 'Lançamento'}
	subtitle={`${t.tipo === 'receita' ? '+' : '−'} ${fmtMoney(t.valor)} · ${fmtDate(t.data)}`}
	{actions}
/>
