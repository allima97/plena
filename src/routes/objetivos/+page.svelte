<script>
 import Goals from '$lib/goals/Goals.svelte';
 import SalesSection from '$lib/goals/SalesSection.svelte';
 import { getNavigationContext } from '$lib/navigation-context.js';
 const navigation = getNavigationContext();
 let section = $state('goals');
 let activeSalesSection = $state(null);
 $effect(() => {
  navigation.salesActive = section === 'sales';
  return () => { navigation.salesActive = false; };
 });
</script>
<nav aria-label="Seções de objetivos" class="segmented goals-sections" class:hidden={section === 'sales' && activeSalesSection !== null}>
 <button class:active={section === 'goals'} aria-pressed={section === 'goals'} onclick={() => section = 'goals'}>Objetivos</button>
 <button class:active={section === 'sales'} aria-pressed={section === 'sales'} onclick={() => section = 'sales'}>Vendas</button>
</nav>
{#if section === 'sales'}<SalesSection bind:sectionId={activeSalesSection} />{:else}<Goals />{/if}

<style>
 .goals-sections { max-width:420px; margin-bottom:24px; }
 .goals-sections.hidden { display:none; }
</style>
