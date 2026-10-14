<script>
 import Goals from '$lib/goals/Goals.svelte';
 import Sales from '$lib/goals/Sales.svelte';
 let section = $state('goals');
</script>
<nav aria-label="Seções de objetivos" style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
 <button class="btn" class:btn-primary={section === 'goals'} aria-pressed={section === 'goals'} onclick={() => section = 'goals'}>Objetivos</button>
 <button class="btn" class:btn-primary={section === 'sales'} aria-pressed={section === 'sales'} onclick={() => section = 'sales'}>Controle de Vendas</button>
</nav>
{#if section === 'sales'}<Sales />{:else}<Goals />{/if}
