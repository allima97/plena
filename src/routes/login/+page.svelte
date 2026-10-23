<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let mode = $state('login');
	let phase = $state('credentials');
	let email = $state('');
	let name = $state('');
	let password = $state('');
	let newPassword = $state('');
	let code = $state('');
	let message = $state('');
	let busy = $state(false);
	let sentTo = $state('');
	let expiresAt = $state(0);
	let secondsLeft = $state(0);

	const returnTo = $derived.by(() => {
		const value = page.url.searchParams.get('returnTo') || '/';
		if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
		try {
			const target = new URL(value, page.url.origin);
			return target.origin === page.url.origin ? `${target.pathname}${target.search}${target.hash}` : '/';
		} catch {
			return '/';
		}
	});

	onMount(() => {
		let timer;
		fetch('/api/auth/status', { cache: 'no-store' })
			.then((response) => response.json())
			.then((result) => { if (result.authenticated) goto('/'); })
			.catch(() => {});
		timer = window.setInterval(() => {
			secondsLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
		}, 1000);
		return () => window.clearInterval(timer);
	});

	async function start(event) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const response = await fetch('/api/auth/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode, email, password, name })
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Não foi possível iniciar o acesso.');
			sentTo = result.email;
			expiresAt = Date.now() + result.expiresInSeconds * 1000;
			phase = 'code';
			secondsLeft = result.expiresInSeconds;
		} catch (error) {
			message = error.message || 'Não foi possível iniciar o acesso.';
		} finally {
			busy = false;
		}
	}

	async function verify(event) {
		event.preventDefault();
		busy = true;
		message = '';
		try {
			const response = await fetch('/api/auth/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, newPassword })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Não foi possível verificar o código.');
			if (result.passwordReset) {
				phase = 'credentials';
				mode = 'login';
				password = '';
				newPassword = '';
				code = '';
				message = 'Senha alterada. Entre com sua nova senha.';
				return;
			}
			await goto(returnTo, { invalidateAll: true });
		} catch (error) {
			message = error.message || 'Não foi possível verificar o código.';
		} finally {
			busy = false;
		}
	}

	function backToCredentials() {
		phase = 'credentials';
		code = '';
		message = '';
	}
</script>

<svelte:head>
	<title>Entrar — PLENA</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="auth-page">
	<section class="auth-card" aria-labelledby="login-title">
		<a class="brand" href="/" aria-label="PLENA">
			<img src="/icons/icon-192.png" alt="" width="44" height="44" />
			<span><strong>Plena</strong><small>FINANÇAS PESSOAIS</small></span>
		</a>

		{#if phase === 'credentials'}
			<p class="eyebrow">SEU DINHEIRO, COM MAIS CLAREZA</p>
			<h1 id="login-title">{mode === 'login' ? 'Que bom ter você de volta.' : mode === 'register' ? 'Crie seu acesso ao Plena.' : 'Redefina sua senha.'}</h1>
			<p class="intro">{mode === 'login' ? 'Entre com seu e-mail e senha. Enviaremos um código para confirmar que é você.' : mode === 'register' ? 'Informe seus dados. Vamos enviar um código para validar seu e-mail.' : 'Informe seu e-mail. Se houver uma conta, enviaremos um código para redefinir a senha.'}</p>
			<form onsubmit={start}>
				{#if mode === 'register'}
					<label for="name">Nome</label>
					<input id="name" bind:value={name} autocomplete="name" required minlength="2" maxlength="100" />
				{/if}
				<label for="email">E-mail</label>
				<input id="email" type="email" bind:value={email} autocomplete="username" required maxlength="320" />
				{#if mode !== 'reset'}
					<label for="password">Senha</label>
					<input id="password" type="password" bind:value={password} autocomplete={mode === 'login' ? 'current-password' : 'new-password'} required minlength="12" maxlength="128" />
					{#if mode === 'register'}<p class="hint">Use pelo menos 12 caracteres.</p>{/if}
				{/if}
				{#if message}<p class="message" role="alert">{message}</p>{/if}
				<button class="primary" type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Continuar'}</button>
			</form>
			{#if mode === 'login'}
				<button class="back" type="button" onclick={() => { mode = 'reset'; message = ''; }}>Esqueci minha senha</button>
			{:else if mode === 'reset'}
				<button class="back" type="button" onclick={() => { mode = 'login'; message = ''; }}>Voltar para entrar</button>
			{:else}
				<p class="switch-mode">Já tem uma conta? <button type="button" onclick={() => { mode = 'login'; message = ''; }}>Entrar</button></p>
			{/if}
			{#if mode === 'login'}<p class="switch-mode">Ainda não tem acesso? <button type="button" onclick={() => { mode = 'register'; message = ''; }}>Criar conta</button></p>{/if}
		{:else}
			<p class="eyebrow">CONFIRMAÇÃO DE SEGURANÇA</p>
			<h1 id="login-title">Confira seu e-mail.</h1>
			<p class="intro">{mode === 'reset' ? 'Se o e-mail estiver cadastrado, um código será enviado para ' : 'Enviamos um código de 6 dígitos para '}<strong>{sentTo}</strong>. Digite-o para {mode === 'register' ? 'validar o cadastro' : mode === 'reset' ? 'continuar a redefinição' : 'entrar na sua conta'}.</p>
			{#if mode === 'reset'}<p class="hint reset-guidance">Se este for seu primeiro acesso, volte à tela de entrada e escolha <strong>Criar conta</strong>. A redefinição só envia código para contas já cadastradas. Se já tem uma conta, confira também a caixa de spam.</p>{/if}
			<form onsubmit={verify}>
				<label for="code">Código de verificação</label>
				<input id="code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" bind:value={code} required pattern={'[0-9]{6}'} minlength="6" maxlength="6" placeholder="000000" />
				{#if mode === 'reset'}
					<label for="new-password">Nova senha</label>
					<input id="new-password" type="password" bind:value={newPassword} autocomplete="new-password" required minlength="12" maxlength="128" />
					<p class="hint">Use pelo menos 12 caracteres.</p>
				{/if}
				<p class="hint">O código expira em {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}.</p>
				{#if message}<p class="message" role="alert">{message}</p>{/if}
				<button class="primary" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Confirmar e entrar'}</button>
			</form>
			<button class="back" type="button" onclick={backToCredentials}>Voltar e corrigir os dados</button>
		{/if}
		<p class="privacy">Seu acesso é protegido por confirmação de e-mail. Nunca compartilhe seu código.</p>
	</section>
<p><a href="/privacidade" data-sveltekit-reload>Privacidade e seus dados · nxapps</a></p>
</main>

<style>
	.auth-page { min-height: 100dvh; display: grid; place-items: center; padding: 28px 18px; background: #f4f6f3; color: #18232d; font-family: 'DM Sans', sans-serif; }
	.auth-card { width: min(100%, 440px); padding: 34px; border: 1px solid #dfe6e1; border-radius: 22px; background: #fff; box-shadow: 0 20px 60px #16241a12; }
	.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 36px; color: inherit; text-decoration: none; }
	.brand img { border-radius: 12px; }
	.brand strong { display: block; font: 700 22px 'Space Grotesk', sans-serif; }
	.brand small { color: #71818a; font-size: 9px; letter-spacing: .18em; }
	.eyebrow { margin: 0 0 9px; color: #5475cf; font-size: 10px; font-weight: 700; letter-spacing: .18em; }
	h1 { margin: 0; font: 700 28px/1.18 'Space Grotesk', sans-serif; letter-spacing: -.04em; }
	.intro { margin: 12px 0 26px; color: #65737e; font-size: 14px; line-height: 1.6; }
	form { display: grid; gap: 10px; }
	label { margin-top: 4px; font-size: 12px; font-weight: 700; }
	input { width: 100%; height: 48px; padding: 0 13px; border: 1px solid #d7e0dc; border-radius: 11px; outline: none; color: #18232d; background: #fff; font: inherit; }
	input:focus { border-color: #6f89d4; box-shadow: 0 0 0 3px #6f89d41c; }
	.code-input { text-align: center; font-size: 25px; font-weight: 700; letter-spacing: .35em; }
	.hint { margin: 0; color: #74828a; font-size: 12px; }
	.primary { min-height: 48px; margin-top: 8px; border: 0; border-radius: 11px; color: #fff; background: #17212b; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
	.primary:disabled { opacity: .55; cursor: wait; }
	.message { margin: 4px 0; padding: 11px 12px; border-radius: 9px; color: #a13e36; background: #fff0ed; font-size: 13px; }
	.switch-mode { margin: 20px 0 0; color: #687780; text-align: center; font-size: 13px; }
	.switch-mode button, .back { border: 0; color: #4566c1; background: none; font: inherit; font-weight: 700; cursor: pointer; }
	.back { display: block; margin: 16px auto 0; font-size: 13px; }
	.privacy { margin: 30px 0 0; padding-top: 16px; border-top: 1px solid #edf0ed; color: #89949a; text-align: center; font-size: 11px; line-height: 1.5; }
	@media (max-width: 480px) { .auth-card { padding: 27px 22px; } h1 { font-size: 25px; } }
</style>
