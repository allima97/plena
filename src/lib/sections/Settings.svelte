<script>
	import { appState, setSettings } from '$lib/fin/store.svelte.js';
	import { CURRENCY_OPTIONS } from '$lib/currency.js';
	import { showToast } from '$lib/toast.svelte.js';

	let moedaPadrao = $state(appState.settings.moedaPadrao || 'BRL');

	// Mantém o seletor em dia se a configuração mudar por fora (ex.: outra aba/dispositivo
	// sincronizando), sem sobrescrever o que o usuário está digitando nesta tela.
	$effect(() => {
		moedaPadrao = appState.settings.moedaPadrao || 'BRL';
	});

	function salvar() {
		setSettings({ moedaPadrao });
		showToast({ message: '✓ Preferências salvas.' });
	}
</script>

<div class="page-head">
	<div>
		<p class="page-eyebrow">Sistema</p>
		<h1 class="font-display page-title">Configurações.</h1>
		<p class="page-sub">Preferências gerais do Plena.</p>
	</div>
</div>

<div class="card" style="max-width:480px">
	<p class="stat-label" style="margin:0 0 4px">Moeda padrão do sistema</p>
	<p class="movement-meta" style="margin:0 0 14px">
		Usada nas suas contas, no extrato e nos cálculos gerais (como "Quanto posso gastar"). Um objetivo específico pode
		ser guardado numa moeda diferente — dá pra configurar isso na hora de criar ou editar o objetivo, em Objetivos.
	</p>
	<label class="field">
		<span>Moeda padrão</span>
		<select class="field-input" bind:value={moedaPadrao}>
			{#each CURRENCY_OPTIONS as opt (opt.code)}
				<option value={opt.code}>{opt.label}</option>
			{/each}
		</select>
	</label>
	<div class="modal-footer" style="margin-top:18px">
		<button type="button" class="btn btn-primary" onclick={salvar}>Salvar</button>
	</div>
</div>
