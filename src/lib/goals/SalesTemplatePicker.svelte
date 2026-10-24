<script>
 import { TOURISM_TEMPLATE } from './sales-templates.js';
 let { templateId = $bindable(''), selected = $bindable([]), disabled = false, onChoose = null } = $props();
 const percent = value => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value)}%`;
 function choose(event) {
  templateId = event.currentTarget.value;
  selected = templateId === 'tourism' ? TOURISM_TEMPLATE.types.map(type => type.key) : [];
  onChoose?.(templateId);
 }
</script>

<label class="field"><span>Modelo</span><select class="field-input" value={templateId} onchange={choose} {disabled}>
 <option value="">Em branco — criar meus próprios tipos</option><option value="tourism">Turismo — tipos e comissões sugeridos</option>
</select></label>
{#if templateId === 'tourism'}
 <div class="template-preview">
  <h3>Modelo Turismo</h3>
  <p class="field-hint">Escolha os tipos que deseja importar. Você poderá alterar nomes, comissões e escalonamentos depois.</p>
  <p class="field-hint">Percentuais: meta não batida → meta batida → supermeta.</p>
  <div class="template-types">
   {#each TOURISM_TEMPLATE.types as type (type.key)}
    <label class="template-type"><input type="checkbox" value={type.key} bind:group={selected} {disabled} />
     <span><strong>{type.name}</strong><span class="template-detail">{percent(type.rates.below)} → {percent(type.rates.target)} → {percent(type.rates.super)}</span>
      <span class="template-detail">{type.scaleStepBelow ? `Escalonável: antes ${percent(type.scaleStepBelow)} · após ${percent(type.scaleStepAbove)}` : 'Percentuais fixos por faixa'}</span>
      {#if type.suggestedProductRate !== null}<span class="template-detail">Comissão específica sugerida: {percent(type.suggestedProductRate)}. Ative ao definir sua própria meta.</span>{/if}
     </span>
    </label>
   {/each}
  </div>
  <p class="field-hint" role="status">{selected.length} de {TOURISM_TEMPLATE.types.length} tipos selecionados. Defina suas metas após criar o controle.</p>
 </div>
{/if}

<style>
 .template-preview { border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-top:16px; min-width:0; }
 h3 { font-size:16px; margin:0 0 8px; }
 .template-types { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:14px 0; }
 .template-type { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border-soft); border-radius:var(--radius-md); min-width:0; cursor:pointer; }
 .template-type input { margin-top:3px; flex-shrink:0; }
 .template-type strong { font-size:13px; overflow-wrap:anywhere; }
 .template-detail { display:block; color:var(--text-2); font-size:12px; line-height:1.5; margin-top:4px; overflow-wrap:anywhere; }
 @media(max-width:600px) { .template-types { grid-template-columns:1fr; } }
</style>
