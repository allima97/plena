<script>
 import { tick } from 'svelte';
 import { salesTypeSettings, withSalesTypeSettings, salesPlanWithTypeSettings } from './sales-type-settings.js';
 import Modal from '$lib/components/Modal.svelte';
 import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
 import { showToast } from '$lib/toast.svelte.js';
 import { Plus, Settings2, Tags, Pencil, Trash2, ArrowLeft } from 'lucide-svelte';
 import { appState, saveSale, removeSale, saveSalesPlan, saveSaleType } from '$lib/fin/store.svelte.js';
 import { forSection } from './sales.js';
 import { todayISO, fmtMoney, fmtDate } from '$lib/format.js';
 import { saleTypesCatalog, TIERS, emptyPlan, monthSummary, dailyPaceKPI } from './sales.js';
 import { filterSalesRows, salesTablePage } from './sales-table.js';

 /** @type {{ sectionId?: string, onBack?: () => void }} */
 let { sectionId = 'default', onBack = null } = $props();

 // Scope sales data to this section
 const scopedSales = $derived(forSection(sectionId, { sales: appState.sales, salesPlans: appState.salesPlans, salesTypes: appState.salesTypes }));

 let managingTypes = $state(false);
 const newTypeDraft = () => ({ name: '', rates: { below: null, target: null, super: null }, hasTarget: false, target: null });
 let typeDraft = $state(newTypeDraft());
 let deletingType = $state(null);
 const types = $derived(saleTypesCatalog(scopedSales.salesTypes, scopedSales.sales, scopedSales.salesPlans));
 const activeTypes = $derived(types.filter(t => !t.deleted));
 function typeName(id) { return types.find(t => t.id === id)?.name || id; }
 function openConfig() {
  config = structuredClone($state.snapshot(rawPlan || emptyPlan(month, [])));
  config.commissionBase ??= 'net';
  config.typeTargets ??= {};
  error = '';
 }
 function editType(type) {
  const settings = salesTypeSettings(type, month, rawPlan);
  typeDraft = { ...type, rates: { ...settings.rates }, hasTarget: settings.hasTarget, target: settings.target };
  error = '';
 }
 function submitType(e) {
  e.preventDefault();
  try {
   const { rates, hasTarget, target, ...type } = typeDraft;
   saveSaleType(withSalesTypeSettings({ ...type, sectionId }, month, { rates: { ...rates }, hasTarget, target: hasTarget ? target : null }));
   typeDraft = newTypeDraft(); error = ''; showToast({ message: 'Tipo, comissões e meta específica salvos.' });
  } catch(e) { error = e.message; }
 }
 let month = $state(todayISO().slice(0,7));
 let editing = $state(null);
 let config = $state(null);
 let error = $state('');

 let deleting = $state(null);
 // For new plans, id = 'sectionId:YYYY-MM'; for migrated plans (legacy), id = 'YYYY-MM'
 const planId = $derived(sectionId === 'default' ? month : `${sectionId}:${month}`);
 const rawPlan = $derived(
  scopedSales.salesPlans.find(p => p.id === planId) ||
  scopedSales.salesPlans.find(p => p.id === month) // fallback: plano migrado
 );
 const plan = $derived(salesPlanWithTypeSettings(rawPlan, scopedSales.salesTypes));
 const summary = $derived(monthSummary(scopedSales.sales, month, plan));
 const tableScope = $derived(`${sectionId}:${month}`);
 let tableFilters = $state({ scope: '', type: '', query: '', page: 0 });
 const currentFilters = $derived(tableFilters.scope === tableScope ? tableFilters : { scope: tableScope, type: '', query: '', page: 0 });
 const filterTypes = $derived(types.filter(t => !t.deleted || summary.items.some(s => s.type === t.id)));
 const selectedType = $derived(filterTypes.some(t => t.id === currentFilters.type) ? currentFilters.type : '');
 const tableRows = $derived(filterSalesRows(summary.items, { type: selectedType, query: currentFilters.query }, types).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '') || String(b.id).localeCompare(String(a.id))));
 const tablePage = $derived(salesTablePage(tableRows, currentFilters.page));
 let ledgerElement = $state(null);
 function updateTableFilters(patch) {
  tableFilters = { ...currentFilters, type: selectedType, ...patch, scope: tableScope, page: 0 };
 }
 async function changeTablePage(delta) {
  tableFilters = { ...currentFilters, type: selectedType, scope: tableScope, page: tablePage.page + delta };
  await tick();
  const direction = delta > 0 ? 'next' : 'previous';
  const focusTarget = ledgerElement?.querySelector(`[data-page-direction="${direction}"]:not(:disabled)`) || ledgerElement?.querySelector('.sales-pagination button:not(:disabled)');
  focusTarget?.focus({ preventScroll: true });
  ledgerElement?.scrollIntoView({ block: 'start' });
 }
 const goalPercent = $derived(plan?.target > 0 ? Math.max(0, summary.goalBase / plan.target * 100) : 0);
 const goalFill = $derived(Math.min(100, goalPercent));
 const superPercent = $derived(plan?.superTarget > 0 ? Math.max(0, summary.goalBase / plan.superTarget * 100) : 0);
 const superFill = $derived(Math.min(100, superPercent));
 const superPercentLabel = $derived(new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, roundingMode: 'floor' }).format(superPercent));
 const goalColor = $derived(`hsl(${goalFill * 1.2} 65% 38%)`);
 const percentLabel = $derived(new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, roundingMode: 'floor' }).format(goalPercent));
 // Daily pace KPI — only meaningful in the current month
 const dailyKPI = $derived(plan?.target > 0 ? dailyPaceKPI(plan.target, summary.goalBase, month) : null);
 // Type-level KPIs for types that have a typeTarget set
 const typeKPIs = $derived(
  plan?.typeTargets
   ? Object.entries(plan.typeTargets)
     .filter(([, v]) => v !== null && v !== '' && Number(v) > 0)
     .map(([typeId, target]) => {
      const sold = summary.byType?.[typeId] ?? 0;
      const tgt = Number(target);
      const pct = Math.min(100, Math.max(0, sold / tgt * 100));
      const tName = types.find(t => t.id === typeId)?.name || typeId;
      return { typeId, typeName: tName, sold, target: tgt, pct, remaining: Math.max(0, tgt - sold), done: sold >= tgt };
     })
   : []
 );
 // Distribuição percentual de vendas por tipo (sempre pelo bruto)
 const typeDistribution = $derived(
  summary.total > 0
   ? Object.entries(summary.byType ?? {})
     .map(([typeId, amount]) => ({
      typeId,
      typeName: types.find(t => t.id === typeId)?.name ?? typeId,
      amount,
      pct: Math.round(amount / summary.total * 1000) / 10
     }))
     .sort((a, b) => b.pct - a.pct)
   : []
 );
 function submitSale(e) {
  e.preventDefault();
  try { saveSale({ ...editing, sectionId }); editing = null; error = ''; showToast({ message: 'Venda salva.' }); } catch(e) { error = e.message; }
 }
 function submitPlan(e) {
  e.preventDefault();
  try { saveSalesPlan({ ...config, sectionId, id: planId }); config = null; error = ''; showToast({ message: 'Metas mensais salvas.' }); } catch(e) { error = e.message; }
 }
</script>
<div class="page-head sales-page-head">
 {#if onBack}
  <button class="btn btn-ghost back-btn" onclick={onBack}><ArrowLeft size={16} /> Todas as seções</button>
 {/if}
 <div>
  <p class="page-eyebrow">Vendas</p>
  <h1 class="font-display page-title">{sectionId === 'default' ? 'Vendas' : (appState.salesSections.find(s => s.id === sectionId)?.name ?? 'Seção')}</h1>
  <p class="page-sub">Acompanhe suas vendas, metas e comissão mensal.</p>
 </div>
</div>
<div class="sales-primary-actions">
 <label class="field"><span>Mês </span><input class="field-input" type="month" bind:value={month} onchange={e => tableFilters = { scope: `${sectionId}:${e.currentTarget.value}`, type: '', query: '', page: 0 }} required disabled={!!editing || !!config} /></label>
 <button class="btn btn-primary" disabled={!month || !appState.ready || managingTypes || !activeTypes.length} onclick={() => { editing = { date: month === todayISO().slice(0,7) ? todayISO() : `${month}-01`, total: 0, fees: 0, type: activeTypes[0]?.id || '', orderNumber: '' }; error = ''; }}><Plus size={16} /> Nova venda</button>
</div>

<div class="sales-settings-actions">
 <button class="btn btn-ghost" disabled={!month || !appState.ready || managingTypes} onclick={() => { openConfig(); }}><Settings2 size={16} /> Metas mensais</button>
<button class="btn btn-ghost" disabled={!appState.ready || !!editing || !!config} onclick={() => { managingTypes = !managingTypes; typeDraft = newTypeDraft(); error = ''; }}><Tags size={16} /> Tipos de venda</button>
</div>
{#if managingTypes}
 <Modal open={managingTypes} onClose={() => { managingTypes = false; typeDraft = newTypeDraft(); error = ''; }} title="Tipos de venda" eyebrow="Organização" maxWidth="700px">
  <p>Personalize os tipos para seu comércio. Ao excluir um tipo, ele deixa de aparecer em novas vendas; o histórico e as comissões são preservados.</p>
  {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitType}>
   <label class="field"><span>Nome do tipo</span><input class="field-input" required maxlength="80" placeholder="Ex.: Roupas, Alimentos, Consultoria" bind:value={typeDraft.name} /></label>
   <p class="field-hint">Configuração para {month.split('-').reverse().join('/')}. As faixas usam a meta mensal do controle. Alterações preservam os meses anteriores.</p>
   <fieldset class="type-rate-card"><legend>Comissionamento do produto</legend><div class="type-rate-grid">
    {#each Object.entries(TIERS) as [tier, label]}<label class="field"><span>{label} (%)</span><input class="field-input" aria-label={`${label} (%)`} type="number" min="0" max="100" step="0.01" required bind:value={typeDraft.rates[tier]} /></label>{/each}
   </div></fieldset>
   <label class="field"><span>Possui meta específica?</span><select class="field-input" bind:value={typeDraft.hasTarget}><option value={false}>Não</option><option value={true}>Sim</option></select></label>
   {#if typeDraft.hasTarget}<label class="field"><span>Meta específica mensal (R$)</span><input class="field-input" type="number" min="0.01" step="0.01" required bind:value={typeDraft.target} /></label>{/if}
   <div class="modal-footer"><button class="btn btn-primary">{typeDraft.id ? 'Salvar tipo' : 'Incluir tipo'}</button>
   {#if typeDraft.id}<button type="button" class="btn btn-ghost" onclick={() => typeDraft = newTypeDraft()}>Cancelar edição</button>{/if}</div>
  </form>
  <div class="types-list-head"><h3>Tipos cadastrados</h3><span class="badge badge-gray">{activeTypes.length}</span></div>
  <div class="table-wrap types-table-wrap">
   <table class="list types-table" aria-label="Tipos de venda cadastrados">
    <thead><tr><th scope="col">Tipo de venda</th><th scope="col" class="types-actions-heading">Ações</th></tr></thead>
    <tbody>
     {#each [...activeTypes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) as type (type.id)}
      <tr class="type-row" class:editing-type={typeDraft.id === type.id}>
       <td data-label="Tipo de venda" class="type-name">{type.name}</td>
       <td class="actions-cell"><div class="actions-row">
        <button class="btn btn-ghost sm" aria-label={`Editar tipo ${type.name}`} onclick={() => editType(type)}><Pencil size={14} /> Editar</button>
        <button class="btn btn-danger sm" aria-label={`Excluir tipo ${type.name}`} onclick={() => deletingType = type}><Trash2 size={14} /> Excluir</button>
       </div></td>
      </tr>
     {:else}<tr><td colspan="2" class="empty">Nenhum tipo cadastrado. Inclua um tipo acima para começar.</td></tr>{/each}
    </tbody>
   </table>
  </div>
 </Modal>
{/if}
<p class="field-hint sales-explanation">Meta calculada sobre o total vendido do mês. Comissão = {plan?.commissionBase === 'gross' ? 'valor total (com taxas)' : '(valor total − taxas)'} × percentual do tipo na faixa atingida.</p>


{#if config}
 <Modal open={!!config} onClose={() => { config = null; error = ''; }} title="Metas mensais" subtitle={month} maxWidth="760px">
 {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitPlan}>
  <p>Defina a meta e a supermeta deste mês. Cadastre os percentuais de comissão e a meta específica de cada produto em Tipos de venda. Valores em reais (R$).</p>
  <label class="field"><span>Receber comissão sobre
   </span><select class="field-input" bind:value={config.commissionBase} required>
    <option value="net">Valor líquido (sem taxas)</option>
    <option value="gross">Valor total (com taxas)</option>
   </select>
  </label>
  <p>A base escolhida vale para o cálculo da comissão. A meta e a supermeta acompanham o total vendido, antes das taxas.</p>
  <div class="form-grid"><label class="field"><span>Meta (R$)</span><input class="field-input" type="number" min="0.01" step="0.01" required bind:value={config.target} /></label><label class="field"><span>Supermeta (R$)</span><input class="field-input" type="number" min="0.02" step="0.01" required bind:value={config.superTarget} /></label></div>
  <div class="modal-footer"><button class="btn btn-primary">Salvar configuração</button><button type="button" class="btn btn-ghost" onclick={() => { config = null; error = ''; }}>Cancelar</button></div>
 </form>
 </Modal>
{/if}
{#if editing}
 <Modal open={!!editing} onClose={() => { editing = null; error = ''; }} title={editing.id ? 'Editar venda' : 'Nova venda'} eyebrow="Controle de vendas">
 {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitSale}>
 <div class="form-grid">
  <label class="field"><span>Data da venda</span><input class="field-input" type="date" required bind:value={editing.date} /></label>
  <label class="field"><span>Tipo</span><select class="field-input" bind:value={editing.type}>{#each types.filter(t => !t.deleted || t.id === editing.type) as type}<option value={type.id}>{type.name}{type.deleted ? " (excluído)" : ""}</option>{/each}</select></label>
  <label class="field"><span>Valor total (R$)</span><input class="field-input" type="number" min="0.01" step="0.01" required bind:value={editing.total} /></label>
  <label class="field"><span>Valor das taxas (R$)</span><input class="field-input" type="number" min="0" max={editing.total} step="0.01" required bind:value={editing.fees} /></label>
  <label class="field"><span>Pedido <span class="field-hint" style="display:inline">(opcional)</span></span><input class="field-input" type="text" maxlength="80" placeholder="Ex.: 1234" bind:value={editing.orderNumber} /></label>
  </div><div class="modal-footer"><button class="btn btn-primary">Salvar venda</button><button type="button" class="btn btn-ghost" onclick={() => { editing = null; error = ''; }}>Cancelar</button></div>
 </form>
 </Modal>
{/if}
{#if !plan}<p class="card editor">Configure as metas e os percentuais deste mês para calcular a comissão.</p>{/if}
<div class="totals">
 {#each [['Total vendido', summary.total], ['Taxas', summary.fees], ['Vendas líquidas', summary.net]] as [label, value]}<div class="stat-card"><p class="stat-label">{label}</p><strong class="font-display stat-value privacy-value">{value === null ? 'A configurar' : fmtMoney(value)}</strong></div>{/each}
</div>
{#if plan}
 {#if dailyKPI && dailyKPI.isCurrentMonth}
  <div class="kpi-row">
   <section class="card kpi-card kpi-daily" aria-label="Ritmo diário necessário">
    <p class="stat-label">Valor diário necessário</p>
    <strong class="font-display kpi-value privacy-value">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(dailyKPI.dailyNeeded)}</strong>
    <p class="kpi-sub">{dailyKPI.onTrack ? '✓ No ritmo para atingir a meta' : `Faltam ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(dailyKPI.remaining)} em ${dailyKPI.daysLeft} dia${dailyKPI.daysLeft !== 1 ? 's' : ''}`}</p>
   </section>
   {#each typeKPIs as kpi (kpi.typeId)}
    <section class="card kpi-card kpi-type" aria-label={`Meta de ${kpi.typeName}`}>
     <p class="stat-label">{kpi.typeName}</p>
     <strong class="font-display kpi-value privacy-value">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(kpi.sold)}</strong>
     <div class="kpi-progress-track" role="progressbar" aria-label={`Meta ${kpi.typeName}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={kpi.pct}>
      <div class="kpi-progress-fill" style:width={`${kpi.pct}%`} style:background={kpi.done ? 'hsl(140 55% 38%)' : 'hsl(30 70% 42%)'}></div>
     </div>
     <p class="kpi-sub">{kpi.done ? `✓ Meta atingida (${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(kpi.target)})` : `Meta: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(kpi.target)} · Falta ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(kpi.remaining)}`}</p>
    </section>
   {/each}
   <section class="card kpi-card kpi-commission" aria-label="Comissão do mês">
    <p class="stat-label">Comissão mês</p>
    <strong class="font-display kpi-value privacy-value">{summary.commission === null ? 'A configurar' : fmtMoney(summary.commission)}</strong>
    {#if summary.commission === null}<p class="kpi-sub">Configure os percentuais de comissão</p>{/if}
   </section>
  </div>
  {#if typeDistribution.length > 0}
   <div class="types-row">
    <section class="card kpi-card kpi-types-dist" aria-label="Distribuição por tipo de venda">
     <p class="stat-label">Tipos de vendas</p>
     <div class="types-dist-list">
      {#each typeDistribution as t, i (t.typeId)}
       <div class="types-dist-item">
        <div class="types-dist-header">
         <span class="types-dist-name">{t.typeName}</span>
         <span class="types-dist-pct">{new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(t.pct)}%</span>
        </div>
        <div class="kpi-progress-track types-dist-bar">
         <div class="kpi-progress-fill" style:width={`${t.pct}%`} style:background={`hsl(${(140 + i * 30) % 360} 55% 38%)`}></div>
        </div>
       </div>
      {/each}
     </div>
    </section>
   </div>
  {/if}
 {/if}
 <section class="card sales-goal" aria-label="Atingimento da meta mensal">
  <div class="sales-goal-head">
   <div><p class="stat-label">Meta do mês</p><p class="sales-goal-value privacy-value">{fmtMoney(plan.target)}</p></div>
   <div class="sales-goal-percent"><strong style:color={goalColor}>{percentLabel}%</strong><span class="field-hint">{goalPercent >= 100 ? 'Meta atingida' : 'da meta atingida'}</span></div>
  </div>
  <div class="goal-progress-track" role="progressbar" aria-label="Atingimento da meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow={goalFill} aria-valuetext={`${percentLabel}% da meta atingida`}>
   <div class="goal-progress-fill" style:width={`${goalFill}%`} style:background={goalColor}></div>
  </div>
  <p class="stat-sub">Total vendido: <span class="privacy-value">{fmtMoney(summary.goalBase)}</span>{#if goalPercent < 100} · Faltam <span class="privacy-value">{fmtMoney(Math.max(0, plan.target - summary.goalBase))}</span>{/if}</p>
  {#if summary.tier === 'target' || summary.tier === 'super'}
   <div class="super-goal">
    <div class="sales-goal-head">
     <div><p class="stat-label">Supermeta</p><p class="sales-goal-value privacy-value">{fmtMoney(plan.superTarget)}</p></div>
     <div class="sales-goal-percent"><strong>{superPercentLabel}%</strong><span class="field-hint">{summary.tier === 'super' ? 'Supermeta atingida' : 'da supermeta atingida'}</span></div>
    </div>
    <div class="goal-progress-track" role="progressbar" aria-label="Atingimento da supermeta" aria-valuemin="0" aria-valuemax="100" aria-valuenow={superFill} aria-valuetext={`${superPercentLabel}% da supermeta atingida`}>
     <div class="goal-progress-fill" style:width={`${superFill}%`} style:background={`hsl(${superFill * 1.2} 65% 38%)`}></div>
    </div>
    <p class="stat-sub">Total vendido: <span class="privacy-value">{fmtMoney(summary.goalBase)}</span>{#if summary.tier !== 'super'} · Faltam <span class="privacy-value">{fmtMoney(Math.max(0, plan.superTarget - summary.goalBase))}</span>{/if}</p>
   </div>
  {/if}
 </section>
{/if}
{#snippet salesPagination(position)}
 <nav class="sales-pagination" aria-label={`Paginação das vendas — ${position}`}>
  <span class="list-nav-range">Vendas {tablePage.start + 1}–{tablePage.end} de {tablePage.total}</span>
  <div class="sales-page-controls">
   <button type="button" class="list-nav-btn" data-page-direction="previous" aria-label="Página anterior" disabled={tablePage.page === 0} onclick={() => changeTablePage(-1)}>Anterior</button>
   <span class="sales-page-label">Página <strong>{tablePage.page + 1}</strong> de <strong>{tablePage.totalPages}</strong></span>
   <button type="button" class="list-nav-btn" data-page-direction="next" aria-label="Próxima página" disabled={tablePage.page >= tablePage.totalPages - 1} onclick={() => changeTablePage(1)}>Próxima</button>
  </div>
 </nav>
{/snippet}
<section class="card sales-list" aria-label="Vendas do mês">
 <div class="sales-table-filters">
  <label class="field"><span>Filtrar por tipo</span><select class="field-input" aria-label="Filtrar por tipo" value={selectedType} onchange={e => updateTableFilters({ type: e.currentTarget.value })}><option value="">Todos os tipos</option>{#each filterTypes as type (type.id)}<option value={type.id}>{type.name}{type.deleted ? ' (excluído)' : ''}</option>{/each}</select></label>
  <label class="field"><span>Buscar nas vendas</span><input class="field-input" type="search" aria-label="Buscar nas vendas" aria-describedby="sales-table-status" placeholder="Pedido, tipo, data ou valor" autocomplete="off" value={currentFilters.query} oninput={e => updateTableFilters({ query: e.currentTarget.value })} /></label>
  <button type="button" class="btn btn-ghost" disabled={!selectedType && !currentFilters.query} onclick={() => updateTableFilters({ type: '', query: '' })}>Limpar filtros</button>
 </div>
 <p id="sales-table-status" class="field-hint sales-table-status" role="status" aria-live="polite">Resultados: {tablePage.total} de {summary.items.length} venda{summary.items.length === 1 ? '' : 's'} no mês{#if tablePage.total}{` · exibindo ${tablePage.start + 1}–${tablePage.end}`}{/if}</p>
 <div class="sales-table-results" bind:this={ledgerElement}>
 {#if tablePage.total}{@render salesPagination('superior')}{/if}
 <div class="table-wrap"><table class="list"><thead><tr><th scope="col">Pedido</th><th scope="col">Data venda</th><th scope="col">Tipo</th><th scope="col" class="num">Valor total</th><th scope="col" class="num">Taxas</th><th scope="col" class="num">Líquido</th><th scope="col" class="num">Comissão (%)</th><th scope="col" class="num">Comissão mês</th><th scope="col" class="th-actions">Ações</th></tr></thead><tbody>
 {#each tablePage.items as sale (sale.id)}
 <tr><td data-label="Pedido">{sale.orderNumber || '—'}</td><td data-label="Data venda">{fmtDate(sale.date)}</td><td data-label="Tipo">{typeName(sale.type)}</td><td data-label="Valor total" class="num privacy-value">{fmtMoney(sale.total)}</td><td data-label="Taxas" class="num privacy-value">{fmtMoney(sale.fees)}</td><td data-label="Líquido" class="num privacy-value">{fmtMoney(sale.total-sale.fees)}</td><td data-label="Comissão (%)" class="num">{sale.rate === null ? '—' : `${sale.rate}%`}</td><td data-label="Comissão mês" class="num privacy-value">{sale.commission === null ? '—' : fmtMoney(sale.commission)}</td><td class="actions-cell"><div class="actions-row"><button class="btn btn-ghost tbl-icon-btn" disabled={managingTypes} aria-label="Editar venda" onclick={() => { editing = { id: sale.id, date: sale.date, total: sale.total, fees: sale.fees, type: sale.type, orderNumber: sale.orderNumber ?? '' }; error = ''; }}><Pencil size={14} /></button><button class="btn btn-danger tbl-icon-btn" aria-label="Excluir venda" onclick={() => deleting = sale.id}><Trash2 size={14} /></button></div></td></tr>
 {:else}<tr><td colspan="9" class="empty">{summary.items.length ? 'Nenhuma venda encontrada. Tente outro tipo ou busca.' : 'Nenhuma venda neste mês. Cadastre sua primeira venda.'}</td></tr>{/each}
 </tbody></table></div>
 {#if tablePage.total}{@render salesPagination('inferior')}{/if}
 </div>
</section>
<ConfirmDialog open={!!deleting} title="Excluir venda?" message="A venda será excluída e a comissão do mês será recalculada." confirmLabel="Excluir venda" onCancel={() => deleting = null} onConfirm={() => { removeSale(deleting); deleting = null; showToast({ message: 'Venda excluída.' }); }} />
<ConfirmDialog open={!!deletingType} title="Excluir tipo de venda?" message={`O tipo “${deletingType?.name || ''}” deixará de aparecer em novas vendas. O histórico e as comissões serão preservados.`} confirmLabel="Excluir tipo" onCancel={() => deletingType = null} onConfirm={() => { saveSaleType({ ...deletingType, deleted: true }); deletingType = null; typeDraft = newTypeDraft(); showToast({ message: 'Tipo excluído. Histórico preservado.' }); }} />
<style>
 .sales-table-filters { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto; gap:12px; align-items:end; margin-bottom:12px; }
 .sales-table-filters .field { min-width:0; }
 .sales-table-filters .field-input { width:100%; min-width:0; }
 .sales-table-filters .btn { min-height:44px; }
 .sales-table-status { margin:0 0 12px; }
 .sales-table-results { scroll-margin-top:20px; }
 .sales-pagination { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin:14px 0; }
 .sales-page-controls { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; }
 .sales-page-label { font-size:12px; color:var(--ink-soft); text-align:center; white-space:nowrap; }
 .sales-pagination .list-nav-btn { min-height:40px; }
 @media(max-width:760px) {
  .sales-table-filters { grid-template-columns:minmax(0,1fr); }
  .sales-table-results { scroll-margin-top:100px; }
  .sales-pagination { flex-direction:column; align-items:stretch; }
  .sales-pagination .list-nav-range { text-align:center; }
  .sales-page-controls { gap:8px; }
  .sales-pagination .list-nav-btn { padding:8px 10px; }
 }
 .sales-page-head { display:flex; flex-direction:column; gap:8px; margin-bottom:4px; align-items:flex-start; }
 .back-btn { align-self:flex-start; padding:6px 10px; gap:6px; font-size:13px; }
 .sales-primary-actions, .sales-settings-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; max-width:520px; margin:16px 0; align-items:end; }
 .sales-primary-actions .field { min-width:0; }
 .sales-primary-actions .field-input, .sales-primary-actions .btn { width:100%; min-width:0; height:44px; min-height:44px; box-sizing:border-box; }
 .sales-settings-actions .btn { min-width:0; min-height:44px; padding:8px; gap:6px; }
 @media(max-width:480px) {
  .sales-primary-actions, .sales-settings-actions { gap:8px; }
  .sales-primary-actions .field-input { padding-inline:10px; font-size:12px; }
  .sales-primary-actions .btn { padding-inline:10px; }
  .sales-settings-actions .btn { font-size:11px; }
  .sales-settings-actions :global(svg) { flex-shrink:0; }
 }

 .types-list-head { display:flex; align-items:center; gap:10px; margin:24px 0 12px; }
 .types-list-head h3 { margin:0; font-size:14px; font-weight:700; }
 .type-rate-card { border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; margin:0; min-width:0; }
 .type-rate-card legend { font-size:13px; font-weight:600; padding:0 6px; }
 .type-rate-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
 @media(max-width:480px) { .type-rate-grid { grid-template-columns:1fr; } }
 .types-table { min-width:0; table-layout:fixed; }
 .types-table th { background:var(--surface-3); }
 .types-table .types-actions-heading { width:200px; text-align:center; }
 .types-table .type-name { font-weight:600; overflow-wrap:anywhere; }
 .types-table .actions-row { justify-content:center; flex-wrap:nowrap; gap:8px; }
 .types-table .editing-type { background:var(--surface-3); }
 @media(max-width:760px) {
  .types-table { display:table; width:100%; }
  .types-table thead { display:table-header-group; }
  .types-table tbody { display:table-row-group; }
  .types-table tr { display:table-row; margin:0; padding:0; border:0; border-radius:0; background:transparent; }
  .types-table th { padding:10px 6px; }
  .types-table .types-actions-heading { width:128px; }
  .types-table td { display:table-cell; padding:10px 6px; border-bottom:1px solid var(--border-soft); vertical-align:middle; }
  .types-table tr:last-child td { border-bottom:0; }
  .types-table td::before { display:none; }
  .types-table .type-name { text-align:left; }
  .types-table .actions-cell { display:table-cell; padding:10px 6px; }
  .types-table .actions-row { gap:4px; }
  .types-table .actions-row .btn { min-height:40px; padding:8px; font-size:11px; flex:0 0 auto; }
  .types-table .actions-row :global(svg) { display:none; }
 }

 .super-goal { margin-top:20px; padding-top:20px; border-top:1px solid var(--border-soft); }
 .sales-goal { padding:20px; margin:20px 0; }
 .sales-goal-head { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:16px; }
 .sales-goal-value { font-size:20px; font-weight:700; margin:8px 0 0; overflow-wrap:anywhere; }
 .sales-goal-percent { display:flex; flex-direction:column; text-align:right; gap:4px; }
 .sales-goal-percent strong { font-size:24px; font-variant-numeric:tabular-nums; }
 .sales-goal .goal-progress-track { height:10px; }

 .editor { padding:20px; margin:16px 0; }
 .totals { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:20px 0; }
 .stat-value { display:block; overflow-wrap:anywhere; }
 .sales-list { padding:20px; margin-top:20px; min-width:0; }
 .sales-explanation { margin-top:16px; line-height:1.6; }

 .kpi-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:20px 0; }
 .kpi-card { padding:18px 20px; }
 .kpi-value { display:block; font-size:22px; margin:6px 0 10px; overflow-wrap:anywhere; }
 .kpi-sub { font-size:12px; color:var(--text-2); margin:6px 0 0; line-height:1.5; }
 .kpi-progress-track { height:6px; background:var(--surface-3,#f0e8de); border-radius:99px; overflow:hidden; margin:8px 0 2px; }
 .kpi-progress-fill { height:100%; border-radius:99px; transition:width .4s ease; }
 /* Types distribution card */
 .types-row { margin:0 0 20px; }
 .types-row .kpi-types-dist { width:100%; box-sizing:border-box; }
 .kpi-types-dist { display:flex; flex-direction:column; }
 .types-dist-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px 24px; margin-top:10px; flex:1; }
 .types-dist-item { }
 .types-dist-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
 .types-dist-name { font-size:12px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:72%; }
 .types-dist-pct { font-size:12px; font-weight:700; color:var(--text-1); flex-shrink:0; }
 .types-dist-bar { height:5px; margin:0; }
 @media(max-width:480px) { .kpi-row { grid-template-columns:1fr; } }
 @media(max-width:760px) {
  .totals { grid-template-columns:minmax(0,1fr); }
  .kpi-row { grid-template-columns:1fr; }
  .totals .stat-card { min-width:0; padding:16px; }
  .totals .stat-value { font-size:18px; line-height:1.25; margin-top:8px; }
  .sales-goal-value { font-size:18px; }
  .sales-goal-percent strong { font-size:20px; }
  .sales-list { padding:0; background:transparent; border:0; box-shadow:none; }
 }

 /* Sales table: column header/data alignment + icon action buttons */
 .sales-list .th-actions { text-align:center; }
 .sales-list .actions-cell { text-align:center; }
 .sales-list .actions-row { justify-content:center; flex-wrap:nowrap; gap:6px; }
 .tbl-icon-btn { min-height:32px; width:32px; padding:0; }
</style>
