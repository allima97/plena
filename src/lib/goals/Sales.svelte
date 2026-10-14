<script>
 import { appState, saveSale, removeSale, saveSalesPlan, saveSaleType } from '$lib/fin/store.svelte.js';
 import { todayISO, fmtMoney, fmtDate } from '$lib/format.js';
 import { saleTypesCatalog, TIERS, emptyPlan, monthSummary } from './sales.js';
 let managingTypes = $state(false);
 let typeDraft = $state({ name: '' });
 let deletingType = $state(null);
 const types = $derived(saleTypesCatalog(appState.salesTypes, appState.sales, appState.salesPlans));
 const activeTypes = $derived(types.filter(t => !t.deleted));
 const configTypes = $derived(types.filter(t => !t.deleted || Object.hasOwn(config?.rates || {}, t.id) || summary.items.some(s => s.type === t.id)));
 function typeName(id) { return types.find(t => t.id === id)?.name || id; }
 function openConfig() {
  config = structuredClone($state.snapshot(plan || emptyPlan(month, [])));
  config.commissionBase ??= 'net';
  for (const type of types.filter(t => !t.deleted || summary.items.some(s => s.type === t.id))) {
   if (!Object.hasOwn(config.rates, type.id)) config.rates[type.id] = { below: null, target: null, super: null };
  }
  error = '';
 }
 function submitType(e) {
  e.preventDefault();
  try { saveSaleType(typeDraft); typeDraft = { name: '' }; error = ''; message = 'Tipo salvo.'; } catch(e) { error = e.message; }
 }
 let month = $state(todayISO().slice(0,7));
 let editing = $state(null);
 let config = $state(null);
 let error = $state('');
 let message = $state('');
 let deleting = $state(null);
 const plan = $derived(appState.salesPlans.find(p => p.id === month));
 const summary = $derived(monthSummary(appState.sales, month, plan));
 function submitSale(e) {
  e.preventDefault();
  try { saveSale(editing); editing = null; error = ''; message = 'Venda salva.'; } catch(e) { error = e.message; }
 }
 function submitPlan(e) {
  e.preventDefault();
  try { saveSalesPlan(config); config = null; error = ''; message = 'Metas e comissões salvas.'; } catch(e) { error = e.message; }
 }
</script>
<div class="page-head"><div><h1 class="font-display page-title">Controle de Vendas</h1><p class="page-sub">Acompanhe suas vendas, metas e comissão mensal.</p></div></div>
<div class="toolbar">
 <label>Mês <input type="month" bind:value={month} required disabled={!!editing || !!config} /></label>
 <button class="btn btn-ghost" disabled={!month || !appState.ready || managingTypes} onclick={() => { openConfig(); }}>Metas e comissões</button>
 <button class="btn btn-primary" disabled={!month || !appState.ready || managingTypes || !activeTypes.length} onclick={() => { editing = { date: month === todayISO().slice(0,7) ? todayISO() : `${month}-01`, total: 0, fees: 0, type: activeTypes[0]?.id || '' }; error = ''; }}>Nova venda</button>
</div>
<button class="btn btn-ghost" disabled={!appState.ready || !!editing || !!config} onclick={() => { managingTypes = !managingTypes; error = ''; }}>Gerenciar tipos de venda</button>
{#if managingTypes}
 <section class="card editor">
  <h2>Tipos de venda</h2>
  <p>Personalize os tipos para seu comércio. Ao excluir um tipo, ele deixa de aparecer em novas vendas; o histórico e as comissões são preservados.</p>
  <form class="toolbar" onsubmit={submitType}>
   <label>Nome do tipo<input required maxlength="80" placeholder="Ex.: Roupas, Alimentos, Consultoria" bind:value={typeDraft.name} /></label>
   <button class="btn btn-primary">{typeDraft.id ? 'Salvar nome' : 'Incluir tipo'}</button>
   {#if typeDraft.id}<button type="button" class="btn btn-ghost" onclick={() => typeDraft = { name: '' }}>Cancelar edição</button>{/if}
  </form>
  {#each activeTypes as type (type.id)}
   <div class="toolbar"><span>{type.name}</span><button class="btn btn-ghost sm" onclick={() => typeDraft = { ...type }}>Editar</button><button class="btn btn-ghost sm" onclick={() => deletingType = type}>Excluir</button></div>
  {:else}<p>Nenhum tipo disponível. Inclua um tipo para cadastrar vendas.</p>{/each}
  {#if deletingType}<div role="alert"><p>Excluir o tipo “{deletingType.name}” das novas vendas?</p><button class="btn btn-primary" onclick={() => { saveSaleType({ ...deletingType, deleted: true }); deletingType = null; typeDraft = { name: '' }; message = 'Tipo excluído. Histórico preservado.'; }}>Confirmar exclusão</button> <button class="btn btn-ghost" onclick={() => deletingType = null}>Cancelar</button></div>{/if}
 </section>
{/if}
<p>Meta calculada sobre o valor líquido das vendas do mês. Comissão = {plan?.commissionBase === 'gross' ? 'valor total (com taxas)' : '(valor total − taxas)'} × percentual do tipo na faixa atingida.</p>
{#if message}<p role="status">{message}</p>{/if}
{#if error}<p role="alert" class="error">{error}</p>{/if}
{#if config}
 <form class="card editor" onsubmit={submitPlan}>
  <h2>Metas e comissões · {month}</h2>
  <p>Percentuais aplicados a todas as vendas deste mês. Alterações recalculam a comissão mensal. Valores em reais (R$).</p>
  <label>Receber comissão sobre
   <select bind:value={config.commissionBase} required>
    <option value="net">Valor líquido (sem taxas)</option>
    <option value="gross">Valor total (com taxas)</option>
   </select>
  </label>
  <p>A escolha vale para as comissões deste mês. A meta e a supermeta continuam considerando o valor líquido das vendas.</p>
  <div class="toolbar"><label>Meta líquida (R$)<input type="number" min="0.01" step="0.01" required bind:value={config.target} /></label><label>Supermeta líquida (R$)<input type="number" min="0.02" step="0.01" required bind:value={config.superTarget} /></label></div>
  <div class="table-scroll"><table><thead><tr><th>Tipo</th>{#each Object.values(TIERS) as label}<th>{label} (%)</th>{/each}</tr></thead><tbody>
  {#each configTypes as type}<tr><th>{type.name}{type.deleted ? " (excluído)" : ""}</th>{#each Object.entries(TIERS) as [tier, label]}<td><input aria-label={`${type.name}: ${label} (%)`} type="number" min="0" max="100" step="0.01" required bind:value={config.rates[type.id][tier]} /></td>{/each}</tr>{/each}
  </tbody></table></div>
  <div class="toolbar"><button class="btn btn-primary">Salvar configuração</button><button type="button" class="btn btn-ghost" onclick={() => { config = null; error = ''; }}>Cancelar</button></div>
 </form>
{/if}
{#if editing}
 <form class="card editor" onsubmit={submitSale}>
  <h2>{editing.id ? 'Editar venda' : 'Nova venda'}</h2><div class="toolbar">
  <label>Data da venda<input type="date" required bind:value={editing.date} /></label>
  <label>Tipo<select bind:value={editing.type}>{#each types.filter(t => !t.deleted || t.id === editing.type) as type}<option value={type.id}>{type.name}{type.deleted ? " (excluído)" : ""}</option>{/each}</select></label>
  <label>Valor total (R$)<input type="number" min="0.01" step="0.01" required bind:value={editing.total} /></label>
  <label>Valor das taxas (R$)<input type="number" min="0" max={editing.total} step="0.01" required bind:value={editing.fees} /></label>
  </div><div class="toolbar"><button class="btn btn-primary">Salvar venda</button><button type="button" class="btn btn-ghost" onclick={() => { editing = null; error = ''; }}>Cancelar</button></div>
 </form>
{/if}
{#if !plan}<p class="card editor">Configure as metas e os percentuais deste mês para calcular a comissão.</p>{/if}
<div class="totals">
 {#each [['Total vendido', summary.total], ['Taxas', summary.fees], ['Vendas líquidas', summary.net], ['Comissão mês', summary.commission]] as [label, value]}<div class="card editor"><span>{label}</span><strong class="privacy-value">{value === null ? 'A configurar' : fmtMoney(value)}</strong></div>{/each}
</div>
{#if plan}<p><strong>{TIERS[summary.tier]}</strong> · Meta: {fmtMoney(plan.target)} · Supermeta: {fmtMoney(plan.superTarget)}</p>{/if}
<div class="card table-scroll"><table><thead><tr><th>Data venda</th><th>Tipo</th><th>Valor total</th><th>Taxas</th><th>Líquido</th><th>Comissão (%)</th><th>Comissão mês</th><th>Ações</th></tr></thead><tbody>
 {#each [...summary.items].sort((a,b) => b.date.localeCompare(a.date)) as sale (sale.id)}
 <tr><td>{fmtDate(sale.date)}</td><td>{typeName(sale.type)}</td><td class="privacy-value">{fmtMoney(sale.total)}</td><td class="privacy-value">{fmtMoney(sale.fees)}</td><td class="privacy-value">{fmtMoney(sale.total-sale.fees)}</td><td>{sale.rate === null ? '—' : `${sale.rate}%`}</td><td class="privacy-value">{sale.commission === null ? '—' : fmtMoney(sale.commission)}</td><td><button class="btn btn-ghost sm" disabled={managingTypes} onclick={() => { editing = { id: sale.id, date: sale.date, total: sale.total, fees: sale.fees, type: sale.type }; error = ''; }}>Editar</button><button class="btn btn-ghost sm" onclick={() => deleting = sale.id}>Excluir</button></td></tr>
 {:else}<tr><td colspan="8" class="empty">Nenhuma venda neste mês. Cadastre sua primeira venda.</td></tr>{/each}
 </tbody></table></div>
{#if deleting}<div class="card editor" role="alert"><p>Excluir esta venda? A comissão do mês será recalculada.</p><button class="btn btn-primary" onclick={() => { removeSale(deleting); deleting = null; message = 'Venda excluída.'; }}>Confirmar exclusão</button> <button class="btn btn-ghost" onclick={() => deleting = null}>Cancelar</button></div>{/if}
<style>
 .toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:16px 0; }
 label { display:flex; flex-direction:column; gap:6px; }
 .editor { padding:20px; margin:16px 0; }
 .totals { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }
 strong { display:block; font-size:1.2rem; }
 .table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:12px; border-bottom:1px solid var(--border); } td input { min-width:90px; width:100%; } .error { color:var(--danger,#b42318); }
</style>
