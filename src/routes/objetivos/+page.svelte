<script>
 import Goals from '$lib/goals/Goals.svelte';
 import Sales from '$lib/goals/Sales.svelte';
 let section = $state('goals');
</script>
<nav aria-label="Seções de objetivos" class="segmented goals-sections">
 <button class:active={section === 'goals'} aria-pressed={section === 'goals'} onclick={() => section = 'goals'}>Objetivos</button>
 <button class:active={section === 'sales'} aria-pressed={section === 'sales'} onclick={() => section = 'sales'}>Controle de Vendas</button>
</nav>
{#if section === 'sales'}<Sales />{:else}<Goals />{/if}

<style>
 .goals-sections { max-width:420px; margin-bottom:24px; }
</style>
