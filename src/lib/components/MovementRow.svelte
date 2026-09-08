<script>
	import { fmtMoney, fmtDate } from '$lib/format.js';
	import { ArrowDownRight, ArrowUpRight, Repeat, Layers } from 'lucide-svelte';

	let { t, categoria, subcategoria, conta, onTogglePayment, onEditOccurrence, onEditSeries, onManageSeries, onDelete } = $props();
</script>

<div class="movement-row">
	<span class="type-icon" class:income={t.tipo === 'receita'}>
		{#if t.tipo === 'receita'}<ArrowUpRight size={16} />{:else}<ArrowDownRight size={16} />{/if}
	</span>

	<div class="movement-info">
		<div class="movement-title-row">
			<p class="movement-desc">{t.descricao || categoria?.nome || 'Lançamento'}</p>
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
				onclick={() => onTogglePayment(t)}
				title="Alternar status de pagamento"
			>
				{t.statusPagamento === 'pago' ? 'Pago' : 'Pendente'}
			</button>
		</div>
		<p class="movement-meta">{categoria?.nome || 'Sem categoria'}{subcategoria ? ` · ${subcategoria}` : ''} · {conta?.nome || 'Sem conta'}</p>
	</div>

	<div class="movement-amount">
		<p class="font-display privacy-value" class:money-in={t.tipo === 'receita'} class:money-out={t.tipo === 'despesa'}>
			{t.tipo === 'receita' ? '+' : '−'} {fmtMoney(t.valor)}
		</p>
		<p class="movement-date">{fmtDate(t.data)}</p>
	</div>

	<div class="movement-actions">
		<button class="btn btn-ghost sm" onclick={() => onEditOccurrence(t)}>Editar</button>
		{#if t.seriesId}
			<button class="btn btn-ghost sm" onclick={() => onEditSeries(t)}>Editar série</button>
			{#if t.seriesStatus === 'ativa'}
				<button class="btn btn-ghost sm" onclick={() => onManageSeries(t.seriesId, 'pausar')}>Pausar</button>
			{:else if t.seriesStatus === 'pausada'}
				<button class="btn btn-ghost sm" onclick={() => onManageSeries(t.seriesId, 'retomar')}>Retomar</button>
			{/if}
			{#if t.seriesStatus !== 'cancelada'}
				<button class="btn btn-ghost sm" onclick={() => onManageSeries(t.seriesId, 'cancelar')}>Cancelar série</button>
			{/if}
		{/if}
		<button class="btn btn-danger sm" onclick={() => onDelete(t)}>Excluir</button>
	</div>
</div>
