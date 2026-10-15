<script>
 import Modal from '$lib/components/Modal.svelte';
 import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
 import { showToast } from '$lib/toast.svelte.js';
 import { Plus, Settings2, Tags, Pencil, Trash2, ArrowLeft } from 'lucide-svelte';
 import { appState, saveSale, removeSale, saveSalesPlan, saveSaleType } from '$lib/fin/store.svelte.js';
 import { forSection } from './sales.js';
 import { todayISO, fmtMoney, fmtDate } from '$lib/format.js';
 import { saleTypesCatalog, TIERS, emptyPlan, monthSummary, dailyPaceKPI } from './sales.js';

 /** @type {{ sectionId?: string, onBack?: () => void }} */
 let { sectionId = 'default', onBack = null } = $props();

 // Scope sales data to this section
 const scopedSales = $derived(forSection(sectionId, { sales: appState.sales, salesPlans: appState.salesPlans, salesTypes: appState.salesTypes }));

 let managingTypes = $state(false);
 let typeDraft = $state({ name: '' });
 let deletingType = $state(null);
 const types = $derived(saleTypesCatalog(scopedSales.salesTypes, scopedSales.sales, scopedSales.salesPlans));
 const activeTypes = $derived(types.filter(t => !t.deleted));
 const configTypes = $derived(types.filter(t => !t.deleted || Object.hasOwn(config?.rates || {}, t.id) || summary.items.some(s => s.type === t.id)));
 function typeName(id) { return types.find(t => t.id === id)?.name || id; }
 function openConfig() {
  config = structuredClone($state.snapshot(plan || emptyPlan(month, [])));
  config.commissionBase ??= 'net';
  config.typeTargets ??= {};
  for (const type of types.filter(t => !t.deleted || summary.items.some(s => s.type === t.id))) {
   if (!Object.hasOwn(config.rates, type.id)) config.rates[type.id] = { below: null, target: null, super: null };
   if (!Object.hasOwn(config.typeTargets, type.id)) config.typeTargets[type.id] = '';
  }
  error = '';
 }
 function submitType(e) {
  e.preventDefault();
  try { saveSaleType({ ...typeDraft, sectionId }); typeDraft = { name: '' }; error = ''; showToast({ message: 'Tipo salvo.' }); } catch(e) { error = e.message; }
 }
 let month = $state(todayISO().slice(0,7));
 let editing = $state(null);
 let config = $state(null);
 let error = $state('');

 let deleting = $state(null);
 const planId = $derived(sectionId === 'default' ? month : `${sectionId}:${month}`);
 const plan = $derived(scopedSales.salesPlans.find(p => p.id === planId));
 const summary = $derived(monthSummary(scopedSales.sales, month, plan));
 const goalPercent = $derived(plan?.target > 0 ? Math.max(0, summary.net / plan.target * 100) : 0);
 const goalFill = $derived(Math.min(100, goalPercent));
 const goalColor = $derived(`hsl(${goalFill * 1.2} 65% 38%)`);
 const percentLabel = $derived(new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, roundingMode: 'floor' }).format(goalPercent));
 // Daily pace KPI — only meaningful in the current month
 const dailyKPI = $derived(plan?.target > 0 ? dailyPaceKPI(plan.target, summary.net, month) : null);
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
 function submitSale(e) {
  e.preventDefault();
  try { saveSale({ ...editing, sectionId }); editing = null; error = ''; showToast({ message: 'Venda salva.' }); } catch(e) { error = e.message; }
 }
 function submitPlan(e) {
  e.preventDefault();
  try { saveSalesPlan({ ...config, sectionId, id: planId }); config = null; error = ''; showToast({ message: 'Metas e comissões salvas.' }); } catch(e) { error = e.message; }
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
 <label class="field"><span>Mês </span><input class="field-input" type="month" bind:value={month} required disabled={!!editing || !!config} /></label>
 <button class="btn btn-primary" disabled={!month || !appState.ready || managingTypes || !activeTypes.length} onclick={() => { editing = { date: month === todayISO().slice(0,7) ? todayISO() : `${month}-01`, total: 0, fees: 0, type: activeTypes[0]?.id || '', orderNumber: '' }; error = ''; }}><Plus size={16} /> Nova venda</button>
</div>

<div class="sales-settings-actions">
 <button class="btn btn-ghost" disabled={!month || !appState.ready || managingTypes} onclick={() => { openConfig(); }}><Settings2 size={16} /> Metas e comissões</button>
<button class="btn btn-ghost" disabled={!appState.ready || !!editing || !!config} onclick={() => { managingTypes = !managingTypes; error = ''; }}><Tags size={16} /> Tipos de venda</button>
</div>
{#if managingTypes}
 <Modal open={managingTypes} onClose={() => { managingTypes = false; error = ''; }} title="Tipos de venda" eyebrow="Organização" maxWidth="640px">
  <p>Personalize os tipos para seu comércio. Ao excluir um tipo, ele deixa de aparecer em novas vendas; o histórico e as comissões são preservados.</p>
  {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="toolbar" onsubmit={submitType}>
   <label class="field"><span>Nome do tipo</span><input class="field-input" required maxlength="80" placeholder="Ex.: Roupas, Alimentos, Consultoria" bind:value={typeDraft.name} /></label>
   <button class="btn btn-primary">{typeDraft.id ? 'Salvar nome' : 'Incluir tipo'}</button>
   {#if typeDraft.id}<button type="button" class="btn btn-ghost" onclick={() => typeDraft = { name: '' }}>Cancelar edição</button>{/if}
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
        <button class="btn btn-ghost sm" aria-label={`Editar tipo ${type.name}`} onclick={() => { typeDraft = { ...type }; error = ''; }}><Pencil size={14} /> Editar</button>
        <button class="btn btn-danger sm" aria-label={`Excluir tipo ${type.name}`} onclick={() => deletingType = type}><Trash2 size={14} /> Excluir</button>
       </div></td>
      </tr>
     {:else}<tr><td colspan="2" class="empty">Nenhum tipo cadastrado. Inclua um tipo acima para começar.</td></tr>{/each}
    </tbody>
   </table>
  </div>
 </Modal>
{/if}
<p class="field-hint sales-explanation">Meta calculada sobre o valor líquido das vendas do mês. Comissão = {plan?.commissionBase === 'gross' ? 'valor total (com taxas)' : '(valor total − taxas)'} × percentual do tipo na faixa atingida.</p>


{#if config}
 <Modal open={!!config} onClose={() => { config = null; error = ''; }} title="Metas e comissões" subtitle={month} maxWidth="760px">
 {#if error}<p role="alert" class="field-error">{error}</p>{/if}
 <form class="movement-form" onsubmit={submitPlan}>
  <p>Percentuais aplicados a todas as vendas deste mês. Alterações recalculam a comissão mensal. Valores em reais (R$).</p>
  <label class="field"><span>Receber comissão sobre
   </span><select class="field-input" bind:value={config.commissionBase} required>
    <option value="net">Valor líquido (sem taxas)</option>
    <option value="gross">Valor total (com taxas)</option>
   </select>
  </label>
  <p>A escolha vale para as comissões deste mês. A meta e a supermeta continuam considerando o valor líquido das vendas.</p>
  <div class="form-grid"><label class="field"><span>Meta líquida (R$)</span><input class="field-input" type="number" min="0.01" step="0.01" required bind:value={config.target} /></label><label class="field"><span>Supermeta líquida (R$)</span><input class="field-input" type="number" min="0.02" step="0.01" required bind:value={config.superTarget} /></label></div>
  <h3 class="config-section-title">Meta por tipo <span class="field-hint" style="display:inline">(opcional)</span></h3>
  <p class="field-hint">Defina uma meta líquida por tipo para acompanhar o KPI individual. Deixe em branco para não exibir o KPI.</p>
  <div class="table-wrap"><table class="list type-target-table"><thead><tr><th>Tipo</th><th>Meta líquida (R$)</th></tr></thead><tbody>
  {#each configTypes as type}<tr><td>{type.name}{type.deleted ? " (excluído)" : ""}</td><td><input class="field-input" aria-label={`Meta de ${type.name}`} type="number" min="0" step="0.01" placeholder="Sem meta" bind:value={config.typeTargets[type.id]} /></td></tr>{/each}
  </tbody></table></div>
  <h3 class="config-section-title">Comissões por tipo e faixa</h3>
  <div class="table-wrap"><table class="list rates-table"><thead><tr><th>Tipo</th>{#each Object.values(TIERS) as label}<th>{label} (%)</th>{/each}</tr></thead><tbody>
  {#each configTypes as type}<tr><td data-label="Tipo">{type.name}{type.deleted ? " (excluído)" : ""}</td>{#each Object.entries(TIERS) as [tier, label]}<td data-label={`${label} (%)`}><input class="field-input" aria-label={`${type.name}: ${label} (%)`} type="number" min="0" max="100" step="0.01" required bind:value={config.rates[type.id][tier]} /></td>{/each}</tr>{/each}
  </tbody></table></div>
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
 {#each [['Total vendido', summary.total], ['Taxas', summary.fees], ['Vendas líquidas', summary.net], ['Comissão mês', summary.commission]] as [label, value]}<div class="stat-card"><p class="stat-label">{label}</p><strong class="font-display stat-value privacy-value">{value === null ? 'A configurar' : fmtMoney(value)}</strong></div>{/each}
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
  </div>
 {/if}
 <section class="card sales-goal" aria-label="Atingimento da meta mensal">
  <div class="sales-goal-head">
   <div><p class="stat-label">Meta do mês</p><p class="sales-goal-value privacy-value">{fmtMoney(plan.target)}</p></div>
   <div class="sales-goal-percent"><strong style:color={goalColor}>{percentLabel}%</strong><span class="field-hint">{goalPercent >= 100 ? 'Meta atingida' : 'da meta atingida'}</span></div>
  </div>
  <div class="goal-progress-track" role="progressbar" aria-label="Atingimento da meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow={goalFill} aria-valuetext={`${percentLabel}% da meta atingida`}>
   <div class="goal-progress-fill" style:width={`${goalFill}%`} style:background={goalColor}></div>
  </div>
  <p class="stat-sub">Vendas líquidas: <span class="privacy-value">{fmtMoney(summary.net)}</span>{#if goalPercent < 100} · Faltam <span class="privacy-value">{fmtMoney(Math.max(0, plan.target - summary.net))}</span>{/if}</p>
 </section>
{/if}
<div class="card sales-list"><div class="table-wrap"><table class="list"><thead><tr><th>Pedido</th><th>Data venda</th><th>Tipo</th><th>Valor total</th><th>Taxas</th><th>Líquido</th><th>Comissão (%)</th><th>Comissão mês</th><th>Ações</th></tr></thead><tbody>
 {#each [...summary.items].sort((a,b) => b.date.localeCompare(a.date)) as sale (sale.id)}
 <tr><td data-label="Pedido">{sale.orderNumber || '—'}</td><td data-label="Data venda">{fmtDate(sale.date)}</td><td data-label="Tipo">{typeName(sale.type)}</td><td data-label="Valor total" class="num privacy-value">{fmtMoney(sale.total)}</td><td data-label="Taxas" class="num privacy-value">{fmtMoney(sale.fees)}</td><td data-label="Líquido" class="num privacy-value">{fmtMoney(sale.total-sale.fees)}</td><td data-label="Comissão (%)" class="num">{sale.rate === null ? '—' : `${sale.rate}%`}</td><td data-label="Comissão mês" class="num privacy-value">{sale.commission === null ? '—' : fmtMoney(sale.commission)}</td><td class="actions-cell"><div class="actions-row"><button class="btn btn-ghost sm" disabled={managingTypes} onclick={() => { editing = { id: sale.id, date: sale.date, total: sale.total, fees: sale.fees, type: sale.type, orderNumber: sale.orderNumber ?? '' }; error = ''; }}>Editar</button><button class="btn btn-ghost sm" onclick={() => deleting = sale.id}>Excluir</button></div></td></tr>
 {:else}<tr><td colspan="9" class="empty">Nenhuma venda neste mês. Cadastre sua primeira venda.</td></tr>{/each}
 </tbody></table></div></div>
<ConfirmDialog open={!!deleting} title="Excluir venda?" message="A venda será excluída e a comissão do mês será recalculada." confirmLabel="Excluir venda" onCancel={() => deleting = null} onConfirm={() => { removeSale(deleting); deleting = null; showToast({ message: 'Venda excluída.' }); }} />
<ConfirmDialog open={!!deletingType} title="Excluir tipo de venda?" message={`O tipo “${deletingType?.name || ''}” deixará de aparecer em novas vendas. O histórico e as comissões serão preservados.`} confirmLabel="Excluir tipo" onCancel={() => deletingType = null} onConfirm={() => { saveSaleType({ ...deletingType, deleted: true }); deletingType = null; typeDraft = { name: '' }; showToast({ message: 'Tipo excluído. Histórico preservado.' }); }} />
<style>
 .sales-page-head { display:flex; flex-direction:column; gap:8px; margin-bottom:4px; }
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

 .sales-goal { padding:20px; margin:20px 0; }
 .sales-goal-head { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:16px; }
 .sales-goal-value { font-size:20px; font-weight:700; margin:8px 0 0; overflow-wrap:anywhere; }
 .sales-goal-percent { display:flex; flex-direction:column; text-align:right; gap:4px; }
 .sales-goal-percent strong { font-size:24px; font-variant-numeric:tabular-nums; }
 .sales-goal .goal-progress-track { height:10px; }

 .toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:16px 0; }
 .toolbar .field { flex:1; min-width:160px; }
 .editor { padding:20px; margin:16px 0; }
 .totals { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin:20px 0; }
 .stat-value { display:block; overflow-wrap:anywhere; }
 .sales-list { padding:20px; margin-top:20px; min-width:0; }
 .sales-explanation { margin-top:16px; line-height:1.6; }
 .rates-table input { min-width:0; }
 .rates-table { min-width:0; }
 .type-target-table input { min-width:0; max-width:160px; }
 .config-section-title { font-size:14px; font-weight:700; margin:24px 0 6px; }

 .kpi-row { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; margin:20px 0; }
 .kpi-card { padding:18px 20px; }
 .kpi-value { display:block; font-size:22px; margin:6px 0 10px; overflow-wrap:anywhere; }
 .kpi-sub { font-size:12px; color:var(--text-2); margin:6px 0 0; line-height:1.5; }
 .kpi-progress-track { height:6px; background:var(--surface-3,#f0e8de); border-radius:99px; overflow:hidden; margin:8px 0 2px; }
 .kpi-progress-fill { height:100%; border-radius:99px; transition:width .4s ease; }
 @media(max-width:480px) { .kpi-row { grid-template-columns:1fr; } }
 @media(max-width:760px) {
  .totals { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .totals .stat-card { min-width:0; padding:16px; }
  .totals .stat-value { font-size:18px; line-height:1.25; margin-top:8px; }
  .sales-goal-value { font-size:18px; }
  .sales-goal-percent strong { font-size:20px; }
  .sales-list { padding:0; background:transparent; border:0; box-shadow:none; }
  .rates-table input { width:110px; flex-shrink:0; }
  .toolbar .btn { flex:1; }
 }
 @media(max-width:380px) { .totals { grid-template-columns:1fr; } }
</style>
