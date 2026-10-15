<script>
 import Modal from '$lib/components/Modal.svelte';
 import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
 import { showToast } from '$lib/toast.svelte.js';
 import { Plus, Pencil, Trash2, ShoppingBag, Car, Package, ChevronRight } from 'lucide-svelte';
 import { appState, saveSalesSection } from '$lib/fin/store.svelte.js';
 import { monthSummary, forSection, saleTypesCatalog } from './sales.js';
 import { todayISO, fmtMoney } from '$lib/format.js';
 import Sales from './Sales.svelte';

 /** @type {{ sectionId?: string }} */
 let { sectionId = $bindable(null) } = $props();

 let creating = $state(false);
 let editing = $state(null);
 let deleting = $state(null);
 let draft = $state({ name: '' });
 let formError = $state('');

 const month = todayISO().slice(0, 7);

 const activeSections = $derived(
  appState.salesSections.filter(s => !s.deleted).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
 );

 function sectionSummary(secId) {
  const scoped = forSection(secId, {
   sales: appState.sales,
   salesPlans: appState.salesPlans,
   salesTypes: appState.salesTypes,
  });
  const plan = scoped.salesPlans.find(p => p.id === `${secId}:${month}` || (secId === 'default' && p.id === month));
  return monthSummary(scoped.sales, month, plan);
 }

 function sectionPlan(secId) {
  const scoped = forSection(secId, { salesPlans: appState.salesPlans });
  return scoped.salesPlans.find(p => p.id === `${secId}:${month}` || (secId === 'default' && p.id === month));
 }

 function openCreate() {
  draft = { name: '' };
  formError = '';
  creating = true;
 }

 function submitSection(e) {
  e.preventDefault();
  try {
   if (editing) {
    saveSalesSection({ ...editing, name: draft.name });
    showToast({ message: 'Seção atualizada.' });
    editing = null;
   } else {
    saveSalesSection({ name: draft.name });
    showToast({ message: 'Seção criada.' });
    creating = false;
   }
   draft = { name: '' };
   formError = '';
  } catch(err) { formError = err.message; }
 }

 function startEdit(section) {
  editing = section;
  draft = { name: section.name };
  formError = '';
 }

 function confirmDelete(section) {
  deleting = section;
 }

 function doDelete() {
  saveSalesSection({ ...deleting, deleted: true });
  showToast({ message: 'Seção excluída.' });
  deleting = null;
 }
</script>

{#if sectionId !== null}
 <!-- Seção aberta: renderiza Sales scoped -->
 <Sales {sectionId} onBack={() => sectionId = null} />
{:else}
 <!-- Lista de seções -->
 <div class="page-head">
  <div>
   <p class="page-eyebrow">Objetivos</p>
   <h1 class="font-display page-title">Vendas</h1>
   <p class="page-sub">Gerencie suas seções de vendas, metas e comissões.</p>
  </div>
  <button class="btn btn-primary add-section-btn" disabled={!appState.ready} onclick={openCreate}>
   <Plus size={16} /> Seção Vendas
  </button>
 </div>

 {#if activeSections.length === 0}
  <div class="card empty-state">
   <ShoppingBag size={36} class="empty-icon" />
   <p class="empty-title">Nenhuma seção cadastrada</p>
   <p class="empty-sub">Crie uma seção para começar a acompanhar suas vendas, metas e comissão por tipo de comércio.</p>
   <button class="btn btn-primary" onclick={openCreate}><Plus size={16} /> Criar primeira seção</button>
  </div>
 {:else}
  <div class="sections-grid">
   {#each activeSections as section (section.id)}
    {@const summary = sectionSummary(section.id)}
    {@const plan = sectionPlan(section.id)}
    {@const pct = plan?.target > 0 ? Math.min(100, summary.net / plan.target * 100) : 0}
    {@const color = `hsl(${pct * 1.2} 65% 38%)`}
    <div class="section-card card">
     <div class="section-card-header">
      <div class="section-info">
       <h2 class="section-name">{section.name}</h2>
       {#if plan}
        <span class="section-badge" style:background={`hsl(${pct*1.2} 65% 92%)`} style:color={color}>
         {new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(pct)}% da meta
        </span>
       {:else}
        <span class="section-badge badge-gray">Sem meta</span>
       {/if}
      </div>
      <div class="section-actions">
       <button class="btn btn-ghost sm icon-btn" aria-label="Renomear seção {section.name}" onclick={(e) => { e.stopPropagation(); startEdit(section); }}><Pencil size={14} /></button>
       <button class="btn btn-danger sm icon-btn" aria-label="Excluir seção {section.name}" onclick={(e) => { e.stopPropagation(); confirmDelete(section); }}><Trash2 size={14} /></button>
      </div>
     </div>

     <div class="section-stats">
      <div class="section-stat"><span class="stat-label">Líquido mês</span><strong class="font-display privacy-value">{fmtMoney(summary.net)}</strong></div>
      <div class="section-stat"><span class="stat-label">Comissão</span><strong class="font-display privacy-value">{summary.commission !== null ? fmtMoney(summary.commission) : '—'}</strong></div>
     </div>

     {#if plan}
      <div class="section-progress-track" role="progressbar" aria-label="Meta {section.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
       <div class="section-progress-fill" style:width={`${pct}%`} style:background={color}></div>
      </div>
     {/if}

     <button class="btn btn-ghost section-open-btn" onclick={() => sectionId = section.id}>
      Abrir seção <ChevronRight size={16} />
     </button>
    </div>
   {/each}
  </div>
 {/if}

 <!-- Modal criar/editar seção -->
 {#if creating || editing}
  <Modal open={creating || !!editing} onClose={() => { creating = false; editing = null; formError = ''; }} title={editing ? 'Renomear seção' : 'Nova seção de vendas'} eyebrow="Vendas" maxWidth="480px">
   <p>Dê um nome para identificar este tipo de comércio. Ex.: Roupas, Carros, Consultoria, Alimentos.</p>
   {#if formError}<p role="alert" class="field-error">{formError}</p>{/if}
   <form onsubmit={submitSection}>
    <label class="field">
     <span>Nome da seção</span>
     <input class="field-input" required maxlength="80" placeholder="Ex.: Roupas" bind:value={draft.name} />
    </label>
    <div class="modal-footer">
     <button class="btn btn-primary">{editing ? 'Salvar nome' : 'Criar seção'}</button>
     <button type="button" class="btn btn-ghost" onclick={() => { creating = false; editing = null; formError = ''; }}>Cancelar</button>
    </div>
   </form>
  </Modal>
 {/if}

 <ConfirmDialog
  open={!!deleting}
  title="Excluir seção?"
  message={`A seção "${deleting?.name || ''}" e todos os seus dados (vendas, planos, tipos) serão preservados no histórico mas a seção não aparecerá mais na lista.`}
  confirmLabel="Excluir seção"
  onCancel={() => deleting = null}
  onConfirm={doDelete}
 />
{/if}

<style>
 .page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
 .add-section-btn { align-self:flex-end; white-space:nowrap; }

 .empty-state { padding:48px 24px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:12px; margin-top:24px; }
 .empty-state :global(.empty-icon) { color:var(--text-3,#b0a090); }
 .empty-title { font-size:16px; font-weight:700; margin:0; }
 .empty-sub { font-size:14px; color:var(--text-2); max-width:380px; line-height:1.6; margin:0; }

 .sections-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; margin-top:24px; }

 .section-card { padding:20px; display:flex; flex-direction:column; gap:14px; }
 .section-card-header { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
 .section-info { display:flex; flex-direction:column; gap:6px; min-width:0; }
 .section-name { font-size:18px; font-weight:700; margin:0; overflow-wrap:anywhere; }
 .section-badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:99px; width:fit-content; }
 .badge-gray { background:var(--surface-3); color:var(--text-2); }

 .section-actions { display:flex; gap:6px; flex-shrink:0; }
 .icon-btn { padding:6px; min-height:32px; min-width:32px; }

 .section-stats { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
 .section-stat { display:flex; flex-direction:column; gap:4px; }
 .section-stat .stat-label { font-size:11px; color:var(--text-2); text-transform:uppercase; letter-spacing:.04em; }
 .section-stat strong { font-size:17px; overflow-wrap:anywhere; }

 .section-progress-track { height:6px; background:var(--surface-3,#f0e8de); border-radius:99px; overflow:hidden; }
 .section-progress-fill { height:100%; border-radius:99px; transition:width .4s ease; }

 .section-open-btn { justify-content:space-between; border:1px solid var(--border-soft); margin-top:2px; }

 @media(max-width:480px) {
  .sections-grid { grid-template-columns:1fr; }
  .page-head { flex-direction:column; }
  .add-section-btn { width:100%; }
 }
</style>
