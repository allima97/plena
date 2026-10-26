<script>
 import { onMount } from 'svelte';
 import Modal from '$lib/components/Modal.svelte';
 import { fmtMoney, todayISO } from '$lib/format.js';
 import { buildSalesReport, REPORT_PERIODS } from './sales-reports.js';
 import './sales-reports.css';
 let { sales = [], plans = [], initialYear, sectionName, onClose } = $props();
 let selectedYear = $state('');
 let period = $state('year');
 let content = $state(null);
 const year = $derived(selectedYear || initialYear);
 const report = $derived(buildSalesReport(sales, plans, { year, period, currentMonth: todayISO().slice(0, 7) }));
 const percent = value => value === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, roundingMode: 'floor' }).format(value)}%`;
 const fill = value => Math.min(100, Math.max(0, value ?? 0));
 const color = value => `hsl(${fill(value) * 1.2} 65% 38%)`;
 onMount(() => {
  content?.querySelector('select')?.focus();
  const trapFocus = event => {
   if (event.key !== 'Tab') return;
   const dialog = content?.closest('[role="dialog"]');
   const fields = [...(dialog?.querySelectorAll('button:not(:disabled), select:not(:disabled)') || [])];
   const first = fields[0], last = fields.at(-1);
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
   if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  document.addEventListener('keydown', trapFocus);
  return () => { document.removeEventListener('keydown', trapFocus); document.querySelector('#sales-reports-button')?.focus({ preventScroll: true }); };
 });
</script>
<Modal open={true} {onClose} title="Relatórios de vendas" subtitle={sectionName} eyebrow="Desempenho" maxWidth="800px">
 <div class="sales-report" bind:this={content}>
  <p class="sales-report-intro">Compare seus resultados mês a mês e acompanhe a evolução das suas metas.</p>
  <div class="sales-report-filters" data-tourism="report-filters">
   <label>Ano<select class="field-input" aria-label="Ano do relatório" value={year} onchange={event => { selectedYear = event.currentTarget.value; period = 'year'; }}><option value="all">Todo o histórico</option>{#each report.years as option}<option value={option}>{option}</option>{/each}</select></label>
   <label>Período<select class="field-input" aria-label="Período do relatório" bind:value={period} disabled={year === 'all'}>{#each REPORT_PERIODS as [value, label]}<option {value}>{label}</option>{/each}</select></label>
  </div>
  <div class="sales-report-summary" data-tourism="report-summary" role="status" aria-live="polite">
   <div class="sales-report-stat"><span>Total vendido no período</span><strong class="privacy-value">{fmtMoney(report.sold)}</strong></div>
   <div class="sales-report-stat"><span>Atingimento das metas</span><strong>{percent(report.percent)}</strong></div>
   <div class="sales-report-stat"><span>Meses com meta batida</span><strong>{report.achieved} de {report.evaluated}</strong></div>
  </div>
  <p class="sales-report-note">O percentual do período considera a soma das metas cadastradas e as vendas desses meses. Meses futuros não entram no resumo.</p>
  <div class="sales-report-list">
   {#each report.months as row (row.month)}
    <article class="sales-report-month" data-tourism="report-month" aria-label={`Desempenho de ${row.label}`}>
     <div class="sales-report-row-head"><strong class="sales-report-month-name">{row.label}{#if row.current}<span class="sales-report-current">Em andamento</span>{/if}</strong><div class="sales-report-status"><strong class="sales-report-percent">{percent(row.percent)}</strong><span class="sales-report-badge {row.status}">{row.statusLabel}</span></div></div>
     <div class="sales-report-track" role={row.percent === null ? undefined : 'progressbar'} aria-label={row.percent === null ? undefined : `Meta de ${row.label}`} aria-valuemin={row.percent === null ? undefined : 0} aria-valuemax={row.percent === null ? undefined : 100} aria-valuenow={row.percent === null ? undefined : fill(row.percent)} aria-valuetext={row.percent === null ? undefined : `${percent(row.percent)} · ${row.statusLabel}`}><div class="sales-report-fill" style:width={`${fill(row.percent)}%`} style:background={color(row.percent)}></div></div>
     <div class="sales-report-amounts"><span>Vendido: <span class="privacy-value">{fmtMoney(row.sold)}</span></span><span>Meta: <span class="privacy-value">{row.target === null ? 'não definida' : fmtMoney(row.target)}</span></span></div>
    </article>
   {:else}<p class="sales-report-empty">Nenhuma venda ou meta registrada neste período.</p>{/each}
  </div>
 </div>
 {#snippet footer()}<button class="btn btn-ghost" onclick={onClose}>Fechar relatório</button>{/snippet}
</Modal>
