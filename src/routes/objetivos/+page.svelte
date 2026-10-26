<script>
 import { page } from '$app/state';
 import Goals from '$lib/goals/Goals.svelte';
 import SalesSection from '$lib/goals/SalesSection.svelte';
 import { getNavigationContext } from '$lib/navigation-context.js';
 const navigation = getNavigationContext();
 let section = $state('goals');
 let activeGoal = $state(page.url.searchParams.get('goal'));
 let activeSalesSection = $state(null);
 $effect(() => {
  navigation.salesActive = section === 'sales';
  return () => { navigation.salesActive = false; };
 });
</script>
<nav aria-label="Seções de objetivos" class="goals-sections" class:hidden={section === 'sales' ? activeSalesSection !== null : activeGoal !== null}>
 <button class:active={section === 'goals'} aria-pressed={section === 'goals'} onclick={() => section = 'goals'}>Objetivos</button>
 <button class:active={section === 'sales'} aria-pressed={section === 'sales'} onclick={() => section = 'sales'}>Vendas</button>
</nav>
{#if section === 'sales'}<SalesSection bind:sectionId={activeSalesSection} />{:else}<Goals bind:selectedGoalId={activeGoal} />{/if}

<style>
 .goals-sections { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; width:100%; max-width:420px; margin-bottom:24px; }
 .goals-sections button { min-height:42px; padding:0 16px; border:1px solid var(--border-strong); border-radius:8px; background:transparent; color:var(--ink-soft); font:inherit; font-size:.85rem; font-weight:600; cursor:pointer; }
 .goals-sections button:hover { border-color:var(--ink-faint); color:var(--ink); }
 .goals-sections button.active { background:var(--card); border-color:var(--ink-soft); color:var(--ink); }
 .goals-sections button:focus-visible { outline:2px solid var(--primary); outline-offset:3px; }
 .goals-sections.hidden { display:none; }
</style>
