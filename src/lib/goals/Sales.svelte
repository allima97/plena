<script>
	import { moneyInput } from '$lib/money-input.js';
 import { templateSuggestedProductRate } from './sales-templates.js';
 import { tick, onDestroy } from 'svelte';
 import { isTourismSection, startTourismTour } from './tourism-tour.js';
 import './tourism-tour.css';
 import { getNavigationContext } from '$lib/navigation-context.js';
 import { salesTypeSettings, withSalesTypeSettings, salesPlanWithTypeSettings } from './sales-type-settings.js';
 import Modal from '$lib/components/Modal.svelte';
 import SalesReports from './SalesReports.svelte';
 import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
 import { showToast } from '$lib/toast.svelte.js';
 import { Plus, Pencil, Trash2, ArrowLeft, CircleHelp } from 'lucide-svelte';
 import { appState, saveSale, removeSale, saveSalesPlan, saveSaleType } from '$lib/fin/store.svelte.js';
 import { forSection } from './sales.js';
 import { todayISO, fmtMoney, fmtDate, monthLabel } from '$lib/format.js';
 import { saleTypesCatalog, TIERS, emptyPlan, monthSummary, dailyPaceKPI } from './sales.js';
 import { filterSalesRows, salesTablePage } from './sales-table.js';

 /** @type {{ sectionId?: string, onBack?: () => void }} */
 let { sectionId = 'default', onBack = null } = $props();
 const navigation = getNavigationContext();

 // Scope sales data to this section
 const scopedSales = $derived(forSection(sectionId, { sales: appState.sales, salesPlans: appState.salesPlans, salesTypes: appState.salesTypes }));

 let managingTypes = $state(false);
 let typeFormOpen = $state(false);
 let reportsOpen = $state(false);
 const newTypeDraft = () => ({ name: '', rates: { below: null, target: null, super: null }, hasTarget: false, target: null, productRate: null, scaleStepBelow: null, scaleStepAbove: null });
 let typeDraft = $state(newTypeDraft());
 let deletingType = $state(null);
 const types = $derived(saleTypesCatalog(scopedSales.salesTypes, scopedSales.sales, scopedSales.salesPlans));
 const activeTypes = $derived(types.filter(t => !t.deleted));
 const tourismSection = $derived(isTourismSection(appState.salesSections.find(s => s.id === sectionId), scopedSales.salesTypes));
 let tourOpen = $state(false);
 let tour = null;
 let tourPanel = '';
 async function prepareTourStep(step) {
  if (step.panel !== tourPanel) {
   config = null; editing = null; reportsOpen = false; managingTypes = false;
   typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; tourPanel = step.panel;
   if (step.panel === 'plan') openConfig();
   if (step.panel === 'types' || step.panel === 'type') {
    managingTypes = true;
    typeFormOpen = true;
    if (step.panel === 'type') {
     const type = activeTypes.find(t => salesTypeSettings(t, month, rawPlan).hasTarget) || activeTypes[0];
     if (type) editType(type);
    }
   }
   if (step.panel === 'sale') editing = { date: month === todayISO().slice(0,7) ? todayISO() : `${month}-01`, total: 0, fees: 0, type: activeTypes[0]?.id || '', orderNumber: '' };
   if (step.panel === 'reports') reportsOpen = true;
  }
  await tick();
 }
 function startHelpTour() {
  if (!tourismSection || tourOpen || !appState.ready || editing || config || managingTypes || reportsOpen) return;
  tourOpen = true;
  tour = startTourismTour({ theme: 'plena', prepare: prepareTourStep,
   onClose: async () => {
    config = null; editing = null; reportsOpen = false; managingTypes = false;
    typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; tourPanel = ''; tourOpen = false; tour = null;
    await tick();
   },
   returnFocus: () => document.querySelector('[data-tourism="help"]')
  });
 }
 onDestroy(() => tour?.close());
 function typeName(id) { return types.find(t => t.id === id)?.name || id; }
 function openConfig() {
  if (rawPlan) {
   // Mês já tem plano: editar normalmente
   config = structuredClone($state.snapshot(rawPlan));
   configIsTemplate = false;
   configTemplateMonth = '';
  } else {
   // Sem plano para este mês: herdar do plano mais recente cadastrado
   const templatePlan = [...scopedSales.salesPlans]
    .filter((p) => p.id !== planId)
    .sort((a, b) => b.id.split(':').at(-1).localeCompare(a.id.split(':').at(-1)))[0];
   if (templatePlan) {
    config = structuredClone($state.snapshot(templatePlan));
    config.id = planId;
    configIsTemplate = true;
    configTemplateMonth = templatePlan.id.split(':').at(-1);
   } else {
    config = emptyPlan(month, []);
    configIsTemplate = false;
    configTemplateMonth = '';
   }
  }
  config.commissionBase ??= 'net';
  config.typeTargets ??= {};
  error = '';
 }
 function editType(type) {
  const settings = salesTypeSettings(type, month, rawPlan);
  typeDraft = { ...type, rates: { ...settings.rates }, hasTarget: settings.hasTarget, target: settings.target, productRate: settings.productRate ?? templateSuggestedProductRate(type), scaleStepBelow: settings.scaleStepBelow ?? null, scaleStepAbove: settings.scaleStepAbove ?? null };
  typeFormOpen = true;
  error = '';
 }
 function submitType(e) {
  e.preventDefault();
  try {
   const { rates, hasTarget, target, productRate, scaleStepBelow, scaleStepAbove, ...type } = typeDraft;
   saveSaleType(withSalesTypeSettings({ ...type, sectionId }, month, { rates: { ...rates }, hasTarget, target: hasTarget ? target : null, productRate: hasTarget ? productRate : null, scaleStepBelow, scaleStepAbove }));
   typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; showToast({ message: 'Tipo, comissões e meta específica salvos.' });
  } catch(e) { error = e.message; }
 }
 let month = $state(todayISO().slice(0,7));
 let editing = $state(null);
 let config = $state(null);
 let error = $state('');
 let configIsTemplate = $state(false);
 let configTemplateMonth = $state('');

 let deleting = $state(null);
 const canCreateSale = $derived(!!month && appState.ready && !tourOpen && !managingTypes && !reportsOpen && !!activeTypes.length && !editing && !config && !deleting && !deletingType);
 function openNewSale() {
  if (!canCreateSale) return;
  editing = { date: month === todayISO().slice(0,7) ? todayISO() : `${month}-01`, total: 0, fees: 0, type: activeTypes[0].id, orderNumber: '' };
  error = '';
 }
 $effect(() => {
  navigation.saleAction = { onClick: openNewSale, disabled: !canCreateSale };
  return () => { navigation.saleAction = null; };
 });
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
 const commissionKPIs = $derived(typeKPIs.filter(kpi => summary.typeCommissions[kpi.typeId]?.productRate !== null));
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
     .sort((a, b) => b.amount - a.amount || a.typeName.localeCompare(b.typeName, 'pt-BR'))
   : []
 );
 function submitSale(e) {
  e.preventDefault();
  try { saveSale({ ...editing, sectionId }); editing = null; error = ''; showToast({ message: 'Venda salva.' }); } catch(e) { error = e.message; }
 }
 function submitPlan(e) {
  e.preventDefault();
  try { saveSalesPlan({ ...config, sectionId, id: planId }); config = null; configIsTemplate = false; configTemplateMonth = ''; error = ''; showToast({ message: 'Metas mensais salvas.' }); } catch(e) { error = e.message; }
 }
</script>
<div class="page-head sales-page-head">
 {#if onBack}
  <button class="btn btn-ghost back-btn" onclick={onBack}><ArrowLeft size={16} /> Todas as seções</button>
 {/if}
 <div data-tourism="header" class="sales-title-row">
 <div>
  <p class="page-eyebrow">Vendas</p>
  <h1 class="font-display page-title">{sectionId === 'default' ? 'Vendas' : (appState.salesSections.find(s => s.id === sectionId)?.name ?? 'Seção')}</h1>
  <p class="page-sub">Acompanhe suas vendas, metas e comissão mensal.</p>
 </div>
 {#if tourismSection}<button class="btn btn-ghost sales-help-button" data-tourism="help" disabled={!appState.ready || !!editing || !!config || managingTypes || reportsOpen || tourOpen} onclick={startHelpTour}><CircleHelp size={17} /> Tour de ajuda</button>{/if}
 </div>
</div>
<div class="sales-toolbar">
 <label class="field" data-tourism="month"><span>Mês de referência</span><input class="field-input" type="month" bind:value={month} onchange={e => tableFilters = { scope: `${sectionId}:${e.currentTarget.value}`, type: '', query: '', page: 0 }} required disabled={!!editing || !!config} /></label>
 <div class="sales-settings-actions">
 <button class="btn btn-ghost" data-tourism="plan-button" disabled={!month || !appState.ready || managingTypes} onclick={() => { openConfig(); }}>Metas mensais</button>
<button class="btn btn-ghost" data-tourism="types-button" disabled={!appState.ready || !!editing || !!config} onclick={() => { managingTypes = !managingTypes; typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; }}>Tipos de venda</button>
 <button id="sales-reports-button" class="btn btn-ghost sales-report-button" disabled={!appState.ready || !!editing || !!config || managingTypes} onclick={() => reportsOpen = true}>Relatórios</button>
 </div>
</div>
{#if reportsOpen}<SalesReports sales={scopedSales.sales} plans={scopedSales.salesPlans} initialYear={month.slice(0, 4)} sectionName={appState.salesSections.find(section => section.id === sectionId)?.name || 'Vendas'} onClose={() => reportsOpen = false} />{/if}
{#if managingTypes}
 <Modal open={managingTypes} onClose={() => { managingTypes = false; typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; }} title="Tipos de venda" eyebrow="Organização" maxWidth="850px">
  <p>Personalize os tipos para seu comércio. Ao excluir um tipo, ele deixa de aparecer em novas vendas; o histórico e as comissões são preservados.</p>
  {#if error}<p role="alert" class="field-error">{error}</p>{/if}
  {#if !typeFormOpen}
   <button class="btn btn-primary types-new-btn" onclick={() => { typeDraft = newTypeDraft(); typeFormOpen = true; error = ''; }}><Plus size={16} /> Novo tipo de venda</button>
  {:else}
 <form class="movement-form" onsubmit={submitType}>
   <label class="field" data-tourism="type-name"><span>Nome do tipo</span><input class="field-input" required maxlength="80" placeholder="Ex.: Roupas, Alimentos, Consultoria" bind:value={typeDraft.name} /></label>
   <p class="field-hint">Configuração para {month.split('-').reverse().join('/')}. As faixas usam a meta mensal do controle. Alterações preservam os meses anteriores.</p>
   <fieldset class="type-rate-card" data-tourism="type-rates"><legend>Comissão geral das vendas</legend>
   <div class="type-rate-grid">
    {#each Object.entries(TIERS) as [tier, label]}
     {#if tier !== 'below'}<label class="field" data-tourism={tier === 'target' ? 'type-scaling' : undefined}><span>Escalonável {tier === 'target' ? 'antes' : 'após'} · a cada (%)</span><input class="field-input" aria-label={`Escalonável ${tier === 'target' ? 'antes' : 'após'} · a cada (%)`} type="number" min="0.01" max="100000" step="0.01" placeholder="Não usar" bind:value={typeDraft[tier === 'target' ? 'scaleStepBelow' : 'scaleStepAbove']} /></label>{/if}
     <label class="field"><span>{label} (%)</span><input class="field-input" aria-label={`${label} (%)`} type="number" min="0" max="100" step="0.01" required bind:value={typeDraft.rates[tier]} /></label>
    {/each}
   </div>
   <p class="field-hint">Passos independentes, opcionais. Antes: passo 1 dá 80% da meta = 0,80%; 81% = 0,81%. Em 100% salta para Meta batida. Após: passo 1 dá 101% = 1,16%, até o máximo da Supermeta. Cada passo completo soma 0,01 ponto percentual. Vazio mantém o percentual fixo da fase.</p>
   </fieldset>
   <label class="field" data-tourism="type-specific"><span>Possui meta específica?</span><select class="field-input" bind:value={typeDraft.hasTarget}><option value={false}>Não</option><option value={true}>Sim</option></select></label>
   {#if typeDraft.hasTarget}<label class="field"><span>Comissão específica do produto (%)</span><input class="field-input" type="number" min="0" max="100" step="0.01" required placeholder="Ex.: 10" bind:value={typeDraft.productRate} /></label><p class="field-hint">Ao atingir a meta do produto, o complemento é este percentual menos a comissão geral. Ex.: 10% − 0,80% = 9,20% adicionais.</p><label class="field"><span>Meta específica mensal (R$)</span><input class="field-input" type="text" inputmode="decimal" placeholder="0,00" min="0.01" required use:moneyInput={{ value: typeDraft.target, setValue: (value) => typeDraft.target = value }} /></label>{/if}
   <div class="modal-footer"><button class="btn btn-primary">{typeDraft.id ? 'Salvar tipo' : 'Incluir tipo'}</button>
   <button type="button" class="btn btn-ghost" onclick={() => { typeFormOpen = false; typeDraft = newTypeDraft(); error = ''; }}>Cancelar</button></div>
  </form>
  {/if}
  <div class="types-list-head" data-tourism="type-list"><h3>Tipos cadastrados</h3><span class="badge badge-gray">{activeTypes.length}</span></div>
  <div class="table-wrap types-table-wrap">
   <table class="list types-table" aria-label="Tipos de venda cadastrados">
    <thead><tr><th scope="col">Tipo de venda</th><th scope="col" class="types-actions-heading">Ações</th></tr></thead>
    <tbody>
     {#each [...activeTypes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) as type (type.id)}
      <tr class="type-row" class:editing-type={typeDraft.id === type.id}>
       <td data-label="Tipo de venda" class="type-name">{type.name}</td>
       <td class="actions-cell"><div class="actions-row">
        <button class="btn btn-ghost tbl-icon-btn" aria-label={`Editar tipo ${type.name}`} title="Editar" onclick={() => editType(type)}><Pencil size={16} /></button>
        <button class="btn btn-danger tbl-icon-btn" aria-label={`Excluir tipo ${type.name}`} title="Excluir" onclick={() => deletingType = type}><Trash2 size={16} /></button>
       </div></td>
      </tr>
     {:else}<tr><td colspan="2" class="empty">Nenhum tipo cadastrado. Toque em Novo tipo de venda para começar.</td></tr>{/each}
    </tbody>
   </table>
  </div>
 </Modal>
{/if}
<p class="field-hint sales-explanation">Meta calculada sobre o total vendido do mês. Comissão = {plan?.commissionBase === 'gross' ? 'valor total (com taxas)' : '(valor total − taxas)'} × percentual do tipo na faixa atingida.</p>


{#if config}
 <Modal open={!!config} onClose={() => { config = null; configIsTemplate = false; configTemplateMonth = ''; error = ''; }} title="Metas mensais" subtitle={month} maxWidth="760px">
 {#if configIsTemplate}
  <p class="template-notice" role="status">
   ⟳ Pré-preenchido com as configurações de <strong>{monthLabel(configTemplateMonth)}</strong>. Revise e ajuste os valores antes de salvar.
  </p>
 {/if}
 {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitPlan}>
  <p>Defina a meta e a supermeta deste mês. Cadastre os percentuais de comissão e a meta específica de cada produto em Tipos de venda. Valores em reais (R$).</p>
  <label class="field" data-tourism="commission-base"><span>Receber comissão sobre
   </span><select class="field-input" bind:value={config.commissionBase} required>
    <option value="net">Valor líquido (sem taxas)</option>
    <option value="gross">Valor total (com taxas)</option>
   </select>
  </label>
  <p>A base escolhida vale para o cálculo da comissão. A meta e a supermeta acompanham o total vendido, antes das taxas.</p>
  <div class="form-grid" data-tourism="plan-values"><label class="field"><span>Meta (R$)</span><input class="field-input" type="text" inputmode="decimal" placeholder="0,00" min="0.01" required use:moneyInput={{ value: config.target, setValue: (value) => config.target = value }} /></label><label class="field"><span>Supermeta (R$)</span><input class="field-input" type="text" inputmode="decimal" placeholder="0,00" min="0.02" required use:moneyInput={{ value: config.superTarget, setValue: (value) => config.superTarget = value }} /></label></div>
  <div class="modal-footer"><button class="btn btn-primary">Salvar configuração</button><button type="button" class="btn btn-ghost" onclick={() => { config = null; configIsTemplate = false; configTemplateMonth = ''; error = ''; }}>Cancelar</button></div>
 </form>
 </Modal>
{/if}
{#if editing}
 <Modal open={!!editing} onClose={() => { editing = null; error = ''; }} title={editing.id ? 'Editar venda' : 'Nova venda'} eyebrow="Controle de vendas">
 {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitSale}>
 <div class="form-grid" data-tourism="sale-details">
  <label class="field"><span>Data da venda</span><input class="field-input" type="date" required bind:value={editing.date} /></label>
  <label class="field"><span>Tipo</span><select class="field-input" bind:value={editing.type}>{#each types.filter(t => !t.deleted || t.id === editing.type) as type}<option value={type.id}>{type.name}{type.deleted ? " (excluído)" : ""}</option>{/each}</select></label>
  <label class="field" data-tourism="sale-values"><span>Valor total (R$)</span><input class="field-input" type="text" inputmode="decimal" placeholder="0,00" min="0.01" required use:moneyInput={{ value: editing.total, setValue: (value) => editing.total = value }} /></label>
  <label class="field"><span>Valor das taxas (R$)</span><input class="field-input" type="text" inputmode="decimal" placeholder="0,00" min="0" max={editing.total} required use:moneyInput={{ value: editing.fees, setValue: (value) => editing.fees = value }} /></label>
  <label class="field"><span>Pedido <span class="field-hint" style="display:inline">(opcional)</span></span><input class="field-input" type="text" maxlength="80" placeholder="Ex.: 1234" bind:value={editing.orderNumber} /></label>
  </div><div class="modal-footer"><button class="btn btn-primary">Salvar venda</button><button type="button" class="btn btn-ghost" onclick={() => { editing = null; error = ''; }}>Cancelar</button></div>
 </form>
 </Modal>
{/if}
{#if !plan}<p class="card editor">Configure as metas e os percentuais deste mês para calcular a comissão.</p>{/if}
<div class="totals">
 {#each [['Total vendido', summary.total], ['Taxas', summary.fees], ['Vendas líquidas', summary.net]] as [label, value]}<div class="stat-card" data-tourism={label === 'Total vendido' ? 'gross' : label === 'Taxas' ? 'fees' : 'net'}><p class="stat-label">{label}</p><strong class="font-display stat-value privacy-value">{value === null ? 'A configurar' : fmtMoney(value)}</strong></div>{/each}
</div>
{#if plan}
 <section class="card sales-goal" data-tourism="monthly-goal" aria-label="Atingimento da meta mensal">
  <div class="sales-goal-head">
   <div><p class="stat-label">Meta do mês</p><p class="sales-goal-value privacy-value">{fmtMoney(plan.target)}</p></div>
   <div class="sales-goal-percent"><strong style:color={goalColor}>{percentLabel}%</strong><span class="field-hint">{goalPercent >= 100 ? 'Meta atingida' : 'da meta atingida'}</span></div>
  </div>
  <div class="goal-progress-track" role="progressbar" aria-label="Atingimento da meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow={goalFill} aria-valuetext={`${percentLabel}% da meta atingida`}>
   <div class="goal-progress-fill" style:width={`${goalFill}%`} style:background={goalColor}></div>
  </div>
  <p class="stat-sub">Total vendido: <span class="privacy-value">{fmtMoney(summary.goalBase)}</span>{#if goalPercent < 100} · Faltam <span class="privacy-value">{fmtMoney(Math.max(0, plan.target - summary.goalBase))}</span>{/if}</p>
  {#if summary.tier === 'target' || summary.tier === 'super'}
   <div class="super-goal" data-tourism="super-goal">
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
 {#if typeKPIs.length}
  <section class="card type-goals" data-tourism="product-goal" aria-label="Metas por tipo"><h2>Metas por tipo</h2>
   {#each typeKPIs as kpi (kpi.typeId)}
    <div class="type-goal-item"><div class="sales-goal-head"><strong>{kpi.typeName}</strong><span>{new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(kpi.sold / kpi.target * 100)}%</span></div>
    <div class="kpi-progress-track" role="progressbar" aria-label={`Meta ${kpi.typeName}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={kpi.pct}><div class="kpi-progress-fill" style:width={`${kpi.pct}%`} style:background={`hsl(${kpi.pct * 1.2} 65% 38%)`}></div></div>
    <div class="sales-goal-head kpi-sub"><span class="privacy-value">{fmtMoney(kpi.sold)}</span><span>de {fmtMoney(kpi.target)}</span></div>
    </div>
   {/each}
  </section>
 {/if}

 <div class="kpi-row" style:--kpi-columns={Number(!!dailyKPI?.isCurrentMonth) + 1 + commissionKPIs.length + Number(summary.productCommission > 0)}>
  {#if dailyKPI && dailyKPI.isCurrentMonth}
   <section class="card kpi-card kpi-daily" data-tourism="daily" aria-label="Ritmo diário necessário">
    <p class="stat-label">Valor diário necessário</p>
    <strong class="font-display kpi-value privacy-value">{new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(dailyKPI.dailyNeeded)}</strong>
    <p class="kpi-sub">{dailyKPI.onTrack ? '✓ No ritmo para atingir a meta' : `Faltam ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(dailyKPI.remaining)} em ${dailyKPI.daysLeft} dia${dailyKPI.daysLeft !== 1 ? 's' : ''}`}</p>
   </section>
  {/if}
   <section class="card kpi-card kpi-commission" data-tourism="commission" aria-label="Comissão do mês">
    <p class="stat-label">Comissão das vendas</p>
    <strong class="font-display kpi-value privacy-value">{summary.generalCommission === null ? 'A configurar' : fmtMoney(summary.generalCommission)}</strong>
    {#if summary.commission === null}<p class="kpi-sub">Configure os percentuais de comissão</p>{/if}
   </section>
   {#each commissionKPIs as kpi (kpi.typeId)}
    {@const result = summary.typeCommissions[kpi.typeId]}
    <section class="card kpi-card kpi-type" data-tourism="product-commission" aria-label={`Comissão de ${kpi.typeName}`}>
     <p class="stat-label">Comissão · {kpi.typeName}</p>
     <strong class="font-display kpi-value privacy-value">{!kpi.done ? fmtMoney(0) : result.productCommission === null ? 'A configurar' : fmtMoney(result.productCommission)}</strong>
     <p class="kpi-sub">{#if !kpi.done}Meta do produto não atingida{:else if result.generalRate === null}Configure os percentuais de comissão{:else}Meta do produto atingida · {new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(result.productRate)}% − {new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(result.generalRate)}% = {new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(result.extraRate)}% de complemento{/if}</p>
    </section>
   {/each}
   {#if summary.productCommission > 0}
    <section class="card kpi-card kpi-total" data-tourism="commission-total" aria-label="Comissão total de vendas e produtos">
     <p class="stat-label">Vendas + produtos</p>
     <strong class="font-display kpi-value privacy-value">{fmtMoney(summary.commission)}</strong>
     <p class="kpi-sub">Comissão total do mês</p>
    </section>
   {/if}
  </div>
  {#if typeDistribution.length > 0}
   <div class="types-row">
    <section class="card kpi-card kpi-types-dist" data-tourism="distribution" aria-label="Distribuição por tipo de venda">
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
{#snippet salesPagination(position)}
 <nav class="sales-pagination" aria-label={`Paginação das vendas — ${position}`}>
  <span class="list-nav-range">exibindo {tablePage.start + 1}–{tablePage.end}</span>
  <div class="sales-page-controls">
   <button type="button" class="list-nav-btn" data-page-direction="previous" aria-label="Página anterior" disabled={tablePage.page === 0} onclick={() => changeTablePage(-1)}>Anterior</button>
   <span class="sales-page-label">Página <strong>{tablePage.page + 1}</strong> de <strong>{tablePage.totalPages}</strong></span>
   <button type="button" class="list-nav-btn" data-page-direction="next" aria-label="Próxima página" disabled={tablePage.page >= tablePage.totalPages - 1} onclick={() => changeTablePage(1)}>Próxima</button>
  </div>
 </nav>
{/snippet}
<section class="card sales-list" data-tourism="ledger" aria-label="Vendas do mês">
 <div class="sales-table-filters" data-tourism="filters">
  <label class="field"><span>Filtrar por tipo</span><select class="field-input" aria-label="Filtrar por tipo" value={selectedType} onchange={e => updateTableFilters({ type: e.currentTarget.value })}><option value="">Todos os tipos</option>{#each filterTypes as type (type.id)}<option value={type.id}>{type.name}{type.deleted ? ' (excluído)' : ''}</option>{/each}</select></label>
  <label class="field"><span>Buscar nas vendas</span><input class="field-input" type="search" aria-label="Buscar nas vendas" aria-describedby="sales-table-status" placeholder="Pedido, tipo, data ou valor" autocomplete="off" value={currentFilters.query} oninput={e => updateTableFilters({ query: e.currentTarget.value })} /></label>
  <button type="button" class="btn btn-ghost" disabled={!selectedType && !currentFilters.query} onclick={() => updateTableFilters({ type: '', query: '' })}>Limpar filtros</button>
 </div>
 <div class="sales-table-results" bind:this={ledgerElement}>
 <div class="sales-results-summary" data-tourism="results">
 <p id="sales-table-status" class="field-hint sales-table-status" role="status" aria-live="polite">Resultados: {tablePage.total} venda{tablePage.total === 1 ? '' : 's'} no mês</p>
 {#if tablePage.total}{@render salesPagination('superior')}{/if}
 </div>
 <div class="table-wrap"><table class="list"><thead><tr><th scope="col">Pedido</th><th scope="col">Data venda</th><th scope="col">Tipo</th><th scope="col" class="num">Valor total</th><th scope="col" class="num">Taxas</th><th scope="col" class="num">Líquido</th><th scope="col" class="num">Comissão total (%)</th><th scope="col" class="num">Comissão total</th><th scope="col" class="th-actions">Ações</th></tr></thead><tbody>
 {#each tablePage.items as sale (sale.id)}
 <tr data-tourism="sale-row"><td data-label="Pedido">{sale.orderNumber || '—'}</td><td data-label="Data venda">{fmtDate(sale.date)}</td><td data-label="Tipo">{typeName(sale.type)}</td><td data-label="Valor total" class="num privacy-value">{fmtMoney(sale.total)}</td><td data-label="Taxas" class="num privacy-value">{fmtMoney(sale.fees)}</td><td data-label="Líquido" class="num privacy-value">{fmtMoney(sale.total-sale.fees)}</td><td data-label="Comissão total (%)" class="num">{sale.rate === null ? '—' : `${sale.rate}%`}</td><td data-label="Comissão total" class="num privacy-value">{sale.commission === null ? '—' : fmtMoney(sale.commission)}</td><td class="actions-cell"><div class="actions-row"><button class="btn btn-ghost tbl-icon-btn" disabled={managingTypes} aria-label="Editar venda" onclick={() => { editing = { id: sale.id, date: sale.date, total: sale.total, fees: sale.fees, type: sale.type, orderNumber: sale.orderNumber ?? '' }; error = ''; }}><Pencil size={14} /></button><button class="btn btn-danger tbl-icon-btn" aria-label="Excluir venda" onclick={() => deleting = sale.id}><Trash2 size={14} /></button></div></td></tr>
 {:else}<tr><td colspan="9" class="empty">{summary.items.length ? 'Nenhuma venda encontrada. Tente outro tipo ou busca.' : 'Nenhuma venda neste mês. Cadastre sua primeira venda.'}</td></tr>{/each}
 </tbody></table></div>
 {#if tablePage.total}{@render salesPagination('inferior')}{/if}
 </div>
</section>
<div class="sales-floating-actions">
 <button class="btn btn-primary" disabled={!canCreateSale} onclick={openNewSale}><Plus size={16} /> Nova venda</button>
</div>
<ConfirmDialog open={!!deleting} title="Excluir venda?" message="A venda será excluída e a comissão do mês será recalculada." confirmLabel="Excluir venda" onCancel={() => deleting = null} onConfirm={() => { removeSale(deleting); deleting = null; showToast({ message: 'Venda excluída.' }); }} />
<ConfirmDialog open={!!deletingType} title="Excluir tipo de venda?" message={`O tipo “${deletingType?.name || ''}” deixará de aparecer em novas vendas. O histórico e as comissões serão preservados.`} confirmLabel="Excluir tipo" onCancel={() => deletingType = null} onConfirm={() => { saveSaleType({ ...deletingType, deleted: true }); deletingType = null; typeFormOpen = false; typeDraft = newTypeDraft(); showToast({ message: 'Tipo excluído. Histórico preservado.' }); }} />
<style>
 .sales-title-row { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
 .sales-help-button { border:1px solid var(--border); gap:7px; min-height:40px; white-space:nowrap; }
 .sales-table-filters { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2fr) auto; gap:12px; align-items:end; margin-bottom:12px; }
 .sales-table-filters .field { min-width:0; }
 .sales-table-filters .field-input { width:100%; min-width:0; }
 .sales-table-filters .btn { min-height:44px; }
 .sales-results-summary, .sales-pagination { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px; margin:14px 0; text-align:center; }
 .sales-table-status { margin:0; text-align:center; line-height:1.55; }
 .sales-results-summary .sales-pagination { background:transparent; border:0; border-radius:0; padding:0; margin:12px 0 0; }
 .sales-table-results { scroll-margin-top:20px; }
 .sales-pagination { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
 .sales-page-controls { width:100%; max-width:440px; margin-inline:auto; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; }
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
 .sales-toolbar { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:16px 0 20px; }
 .sales-toolbar .field { min-width:170px; gap:4px; }
 .sales-toolbar .field > span { font-size:.68rem; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-faint); font-weight:600; }
 .sales-toolbar .field-input { width:100%; min-width:0; height:auto; min-height:38px; padding:8px 9px; border:1px solid var(--border); border-radius:7px; background:var(--card); font-size:.85rem; font-weight:400; box-sizing:border-box; }
 .sales-settings-actions { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); align-items:end; gap:10px; }
 .sales-settings-actions .btn { min-width:0; height:38px; min-height:38px; padding:0 15px; border:1px solid var(--border); border-radius:8px; background:transparent; color:var(--ink-soft); font-size:.85rem; font-weight:600; box-shadow:none; }
 .sales-settings-actions .btn:hover { color:var(--ink); border-color:var(--ink-faint); }
 @media(max-width:760px) {
  .sales-toolbar { align-items:stretch; }
  .sales-toolbar .field { width:100%; }
  .sales-toolbar .field-input { height:46px; font-size:16px; padding:11px 12px; }
  .sales-settings-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; }
  .sales-report-button { grid-column:1/-1; width:100%; }
  .sales-settings-actions .btn { height:42px; min-height:42px; padding:0 16px; }
 }
 .sales-floating-actions { position:fixed; z-index:40; left:16px; right:16px; bottom:calc(90px + env(safe-area-inset-bottom, 0px)); display:flex; justify-content:center; pointer-events:none; }
 .sales-floating-actions .btn { width:auto; min-height:36px; padding:0 12px; gap:6px; font-size:12px; font-weight:600; border-radius:8px; box-shadow:var(--shadow-card); pointer-events:auto; }
 @media(min-width:640px) { .sales-floating-actions { left:24px; right:24px; } }
 @media(min-width:1024px) { .sales-floating-actions { left:288px; right:40px; bottom:calc(24px + env(safe-area-inset-bottom, 0px)); } }

 .types-list-head { display:flex; align-items:center; gap:10px; margin:24px 0 12px; }
 .types-new-btn { width:100%; justify-content:center; gap:8px; margin:16px 0 4px; }
 .types-list-head h3 { margin:0; font-size:14px; font-weight:700; }
 .type-rate-card .type-rate-grid { margin-top:12px; }
 .type-goals { padding:20px; margin:20px 0; }
 .type-goals h2 { font-size:16px; margin:0 0 18px; }
 .type-goal-item + .type-goal-item { margin-top:20px; }
 .type-goal-item .sales-goal-head { margin-bottom:8px; }
 .type-rate-card { border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; margin:0; min-width:0; }
 .type-rate-card legend { font-size:13px; font-weight:600; padding:0 6px; }
 .type-rate-grid { display:grid; align-items:end; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; }
 @media(max-width:680px) { .type-rate-grid { grid-template-columns:1fr; } }
 .types-table { min-width:0; table-layout:fixed; }
 .types-table th { background:var(--surface-3); }
 .types-table .types-actions-heading { width:120px; text-align:center; }
 .types-table .type-name { font-weight:600; overflow-wrap:anywhere; }
 .types-table .actions-row { justify-content:center; flex-wrap:nowrap; gap:6px; }
 .types-table .editing-type { background:var(--surface-3); }
 .types-table .tbl-icon-btn { min-height:36px; width:36px; padding:0; }
 @media(max-width:760px) {
  .types-table { display:table; width:100%; }
  .types-table thead { display:table-header-group; }
  .types-table tbody { display:table-row-group; }
  .types-table tr { display:table-row; margin:0; padding:0; border:0; border-radius:0; background:transparent; }
  .types-table th { padding:10px 6px; }
  .types-table .types-actions-heading { width:96px; }
  .types-table td { display:table-cell; padding:10px 6px; border-bottom:1px solid var(--border-soft); vertical-align:middle; }
  .types-table tr:last-child td { border-bottom:0; }
  .types-table td::before { display:none; }
  .types-table .type-name { text-align:left; }
  .types-table .actions-cell { display:table-cell; padding:10px 6px; }
  .types-table .actions-row { gap:4px; }
  .types-table .tbl-icon-btn { min-height:40px; width:40px; }
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
 .sales-list { padding:20px; margin-top:20px; margin-bottom:72px; min-width:0; }
 .sales-explanation { margin-top:16px; line-height:1.6; }
 @media(max-width:1023px) { .sales-floating-actions { display:none; } .sales-list { margin-bottom:0; } }

 .kpi-row { display:grid; grid-template-columns:repeat(var(--kpi-columns, 3),minmax(0,1fr)); gap:14px; margin:20px 0; }
 .kpi-total { background:var(--kpi-blue-soft); }
 .kpi-total .kpi-value { color:var(--kpi-blue); }
 .kpi-card { min-width:0; padding:18px 20px; }
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

 .template-notice {
  background: color-mix(in srgb, var(--accent, hsl(215 65% 55%)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, hsl(215 65% 55%)) 40%, transparent);
  border-radius: 6px;
  color: var(--ink);
  font-size: 0.84rem;
  line-height: 1.5;
  margin-bottom: 14px;
  padding: 10px 14px;
 }
</style>
