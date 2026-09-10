<script>
	import Modal from './Modal.svelte';
	import { appState } from '$lib/fin/store.svelte.js';
	import { fmtMoney, fmtDate, todayISO } from '$lib/format.js';
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';

	let { open, onClose } = $props();

	let cursor = $state(new Date());
	let selectedDate = $state(null);

	$effect(() => {
		if (open) {
			cursor = new Date();
			selectedDate = todayISO();
		}
	});

	const MES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
	const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

	function isoOf(year, month, day) {
		const pad = (n) => String(n).padStart(2, '0');
		return `${year}-${pad(month + 1)}-${pad(day)}`;
	}

	// Um lançamento por dia (exclui transferência -- ela não é receita nem despesa real, só
	// move dinheiro entre contas próprias) -- mesma fonte de dados da timeline do Dashboard.
	const eventosPorDia = $derived.by(() => {
		const map = new Map();
		for (const t of appState.transactions) {
			if (t.isTransferencia) continue;
			if (!map.has(t.data)) map.set(t.data, []);
			map.get(t.data).push(t);
		}
		return map;
	});

	const dias = $derived.by(() => {
		const year = cursor.getFullYear();
		const month = cursor.getMonth();
		const firstDow = new Date(year, month, 1).getDay();
		const totalDias = new Date(year, month + 1, 0).getDate();
		const out = [];
		for (let i = 0; i < firstDow; i++) out.push(null);
		for (let d = 1; d <= totalDias; d++) {
			const iso = isoOf(year, month, d);
			const eventos = eventosPorDia.get(iso) || [];
			const temReceita = eventos.some((e) => e.tipo === 'receita');
			const temDespesaPendente = eventos.some((e) => e.tipo === 'despesa' && e.statusPagamento === 'pendente');
			const temDespesaPaga = eventos.some((e) => e.tipo === 'despesa' && e.statusPagamento !== 'pendente');
			out.push({ dia: d, iso, eventos, temReceita, temDespesaPendente, temDespesaPaga });
		}
		return out;
	});

	function prevMonth() {
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
	}
	function nextMonth() {
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
	}

	const eventosDoDiaSelecionado = $derived(selectedDate ? eventosPorDia.get(selectedDate) || [] : []);
	const totalDoDia = $derived(eventosDoDiaSelecionado.reduce((s, t) => s + (t.tipo === 'receita' ? Number(t.valor) || 0 : -(Number(t.valor) || 0)), 0));
</script>

<Modal {open} {onClose} maxWidth="560px" eyebrow="Visão mensal" title="Calendário financeiro" subtitle="Veja de relance quais dias têm receitas, despesas e vencimentos pendentes.">
	<div class="fin-cal">
		<div class="fin-cal-head">
			<button type="button" class="icon-btn" onclick={prevMonth} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
			<p class="fin-cal-month">{MES_NOMES[cursor.getMonth()]} {cursor.getFullYear()}</p>
			<button type="button" class="icon-btn" onclick={nextMonth} aria-label="Próximo mês"><ChevronRight size={16} /></button>
		</div>
		<div class="fin-cal-grid fin-cal-weekdays">
			{#each DIAS_SEMANA as w, i (i)}<span>{w}</span>{/each}
		</div>
		<div class="fin-cal-grid">
			{#each dias as d, i (i)}
				{#if d === null}
					<span class="fin-cal-cell empty"></span>
				{:else}
					<button type="button" class="fin-cal-cell" class:today={d.iso === todayISO()} class:selected={d.iso === selectedDate} onclick={() => (selectedDate = d.iso)}>
						<span class="fin-cal-daynum">{d.dia}</span>
						{#if d.eventos.length}
							<span class="fin-cal-dots">
								{#if d.temDespesaPendente}<span class="fin-cal-dot amber"></span>{/if}
								{#if d.temReceita}<span class="fin-cal-dot green"></span>{/if}
								{#if d.temDespesaPaga}<span class="fin-cal-dot red"></span>{/if}
							</span>
						{/if}
					</button>
				{/if}
			{/each}
		</div>

		{#if selectedDate}
			<div class="fin-cal-day-panel">
				<p class="stat-label" style="margin:0 0 8px">{fmtDate(selectedDate)}</p>
				{#if eventosDoDiaSelecionado.length}
					{#each eventosDoDiaSelecionado as t (t.id)}
						<div class="fin-cal-event">
							<span class="fin-cal-event-desc">{t.descricao || 'Lançamento'}{t.statusPagamento === 'pendente' ? ' · pendente' : ''}</span>
							<span class="privacy-value" class:money-in={t.tipo === 'receita'} class:money-out={t.tipo === 'despesa'}>{t.tipo === 'receita' ? '+' : '−'} {fmtMoney(t.valor)}</span>
						</div>
					{/each}
					<div class="fin-cal-event fin-cal-event-total">
						<span class="fin-cal-event-desc">Total do dia</span>
						<span class="privacy-value" class:money-in={totalDoDia > 0} class:money-out={totalDoDia < 0}>{fmtMoney(totalDoDia)}</span>
					</div>
				{:else}
					<p class="empty">Nenhum lançamento neste dia.</p>
				{/if}
			</div>
		{/if}
	</div>
</Modal>
