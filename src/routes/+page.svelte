<script>
	import Dashboard from '$lib/sections/Dashboard.svelte';
	import { goto } from '$app/navigation';
	import { appState } from '$lib/fin/store.svelte.js';

	// Configurações > Geral > Página inicial: se o usuário escolheu outra tela como ponto de
	// partida, redireciona assim que os dados carregarem. Só roda uma vez por carregamento da
	// raiz -- navegar de volta pra "/" manualmente continua mostrando o Dashboard normalmente.
	let redirected = false;
	$effect(() => {
		if (redirected || !appState.ready) return;
		redirected = true;
		const home = appState.settings.homePage;
		if (home && home !== '/') goto(home);
	});
</script>

<Dashboard />
