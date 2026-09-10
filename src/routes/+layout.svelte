<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '../app.css';
	import { appState, boot, retrySync } from '$lib/fin/store.svelte.js';
	import { t } from '$lib/i18n.js';
	import {
		LayoutDashboard,
		ReceiptText,
		WalletCards,
		Tags,
		BarChart3,
		Target,
		Landmark,
		Menu,
		X,
		LogOut,
		Search,
		Bell,
		Eye,
		EyeOff,
		Plus,
		Wand2,
		Settings
	} from 'lucide-svelte';
	import { upcomingDue } from '$lib/fin/derived.js';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import NotificationsDrawer from '$lib/components/NotificationsDrawer.svelte';
	import QuickAddModal from '$lib/components/QuickAddModal.svelte';
	import OnboardingModal from '$lib/components/OnboardingModal.svelte';
	import ToastHost from '$lib/components/ToastHost.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { children } = $props();

	let searchOpen = $state(false);
	let notifOpen = $state(false);
	let showNewGlobal = $state(false);
	let showOnboarding = $state(false);
	let onboardingChecked = false;
	let confirmSairOpen = $state(false);

	// Mostra a apresentação inicial uma única vez, só para quem ainda não tem nenhuma
	// conta cadastrada (sinal de conta nova) e ainda não viu/pulou o tour antes.
	$effect(() => {
		if (!appState.ready || onboardingChecked) return;
		onboardingChecked = true;
		try {
			if (!localStorage.getItem('plena_onboarding_done') && appState.accounts.length === 0) {
				showOnboarding = true;
			}
		} catch {
			/* localStorage indisponível -- não mostra o onboarding automaticamente */
		}
	});

	// Navegação por intenção (UX 2.0 - Fase 4): agrupada pelo que o usuário quer fazer, não pela
	// estrutura interna do app -- "quero organizar meu dinheiro" -> Dinheiro, "quero planejar" ->
	// Planejamento, etc. navItems continua existindo (achatado) para isActive/activeLabel/bottom nav.
	const navGroups = $derived([
		{
			label: t('nav_inicio'),
			items: [{ href: '/', label: t('nav_visaoGeral'), icon: LayoutDashboard }]
		},
		{
			label: t('nav_dinheiro'),
			items: [
				{ href: '/movimentacoes', label: t('nav_movimentacoes'), icon: ReceiptText },
				{ href: '/contas', label: t('nav_contas'), icon: WalletCards },
				{ href: '/categorias', label: t('nav_categorias'), icon: Tags }
			]
		},
		{
			label: t('nav_planejamento'),
			items: [
				{ href: '/objetivos', label: t('nav_objetivos'), icon: Target },
				{ href: '/simulador', label: t('nav_simulador'), icon: Wand2 }
			]
		},
		{
			label: t('nav_patrimonioGrupo'),
			items: [{ href: '/patrimonio', label: t('nav_patrimonio'), icon: Landmark }]
		},
		{
			label: t('nav_analise'),
			items: [{ href: '/relatorios', label: t('nav_relatorios'), icon: BarChart3 }]
		}
	]);
	const navItems = $derived(navGroups.flatMap((g) => g.items));

	let mobileNavOpen = $state(false);
	let hideValues = $state(false);

	function toggleHideValues() {
		hideValues = !hideValues;
		if (typeof document !== 'undefined') document.body.classList.toggle('values-hidden', hideValues);
	}

	const alertCount = $derived(upcomingDue(appState.transactions, appState.alertThresholds).total);

	const initials = $derived.by(() => {
		const src = appState.user?.name || appState.user?.email || '';
		const parts = src.split(/[\s.@]+/).filter(Boolean);
		if (!parts.length) return 'AL';
		return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
	});

	function handleAvatarClick() {
		if (!appState.user?.logoutUrl) return;
		if (appState.settings.confirmExitApp) {
			confirmSairOpen = true;
			return;
		}
		window.location.href = appState.user.logoutUrl;
	}

	function confirmSair() {
		confirmSairOpen = false;
		if (appState.user?.logoutUrl) window.location.href = appState.user.logoutUrl;
	}

	function isActive(href) {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	const activeLabel = $derived(navItems.find((n) => isActive(n.href))?.label ?? 'Plena');

	const bottomNavItems = $derived([
		{ href: '/', label: t('nav_inicio'), icon: LayoutDashboard }
	]);
	const bottomNavItemsEnd = $derived([
		{ href: '/movimentacoes', label: t('nav_movimentacoes'), icon: ReceiptText },
		{ href: '/objetivos', label: t('nav_objetivos'), icon: Target }
	]);

	function handleGlobalKeydown(e) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchOpen = true;
		}
	}

	onMount(() => {
		boot();
		window.addEventListener('keydown', handleGlobalKeydown);
		return () => window.removeEventListener('keydown', handleGlobalKeydown);
	});

	// Layout/tema (Configurações > Layout): aplica tema claro/escuro e as cores custom (primária,
	// entradas, saídas) como custom properties no <html> -- o resto do app.css já lê tudo disso
	// via var(--x), então isso é o único lugar que precisa saber que essas preferências existem.
	$effect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.dataset.theme = appState.settings.theme === 'dark' ? 'dark' : 'light';
		const apply = (prop, value) => {
			if (value) root.style.setProperty(prop, value);
			else root.style.removeProperty(prop);
		};
		apply('--primary', appState.settings.primaryColor);
		apply('--income', appState.settings.incomeColor);
		apply('--expense', appState.settings.expenseColor);
	});
</script>

<div class="app-shell" class:nav-open={mobileNavOpen}>
	<aside class="sidebar">
		<div class="brand">
			<img src="/icons/icon-192.png" alt="Plena" class="brand-mark" />
			<div>
				<p class="font-display brand-name">Plena</p>
				<p class="brand-tag">{t('brand_tag')}</p>
			</div>
			<button class="icon-btn mobile-close" onclick={() => (mobileNavOpen = false)} aria-label={t('nav_fecharMenu')}>
				<X size={18} />
			</button>
		</div>

		<div class="nav-block">
			{#each navGroups as group (group.label)}
				<div class="nav-group">
					<p class="nav-label">{group.label}</p>
					<nav>
						{#each group.items as item (item.href)}
							<a
								href={item.href}
								class="nav-item"
								class:active={isActive(item.href)}
								onclick={() => (mobileNavOpen = false)}
							>
								<item.icon size={18} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
								<span>{item.label}</span>
							</a>
						{/each}
					</nav>
				</div>
			{/each}
		</div>

		<div class="sidebar-footer">
			<div class="sync-status" class:is-error={appState.mode === 'api' && appState.syncStatus === 'error'}>
				{#if appState.mode === 'api'}
					{#if appState.syncStatus === 'saving'}
						<span class="sync-dot saving"></span> {t('sync_salvando')}
					{:else if appState.syncStatus === 'error'}
						<span class="sync-dot error"></span> {t('sync_erro')}
						<button class="sync-retry" onclick={retrySync}>{t('sync_tentarNovamente')}</button>
					{:else}
						<span class="sync-dot ok"></span> {t('sync_sincronizado')}
					{/if}
				{:else if appState.mode === 'local'}
					{t('sync_salvoNavegador')}
				{:else}
					{t('sync_carregando')}
				{/if}
			</div>
			{#if appState.user?.logoutUrl}
				<button class="nav-item logout-btn" onclick={handleAvatarClick}>
					<LogOut size={18} strokeWidth={1.8} />
					<span>{t('nav_sair')}</span>
				</button>
			{/if}
		</div>
	</aside>

	<div class="backdrop" onclick={() => (mobileNavOpen = false)} aria-hidden="true"></div>

	<main class="main">
		<div class="main-inner">
			<header class="topbar">
				<div class="topbar-left">
					<img src="/icons/icon-192.png" alt="Plena" class="brand-mark topbar-logo mobile-only" />
					<p class="section-label">{activeLabel}</p>
				</div>
				<div class="topbar-right">
					<button class="icon-btn" aria-label={t('topbar_buscar')} onclick={() => { searchOpen = true; notifOpen = false; }}><Search size={17} /></button>
					<button class="icon-btn" aria-label={hideValues ? t('topbar_exibirValores') : t('topbar_ocultarValores')} title={hideValues ? t('topbar_exibirValores') : t('topbar_ocultarValores')} onclick={toggleHideValues}>
						{#if hideValues}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
					</button>
					<div class="notif-anchor">
						<button class="icon-btn" aria-label={t('topbar_notificacoes')} style="position:relative" onclick={() => { notifOpen = !notifOpen; searchOpen = false; }}>
							<Bell size={17} />
							{#if alertCount > 0}<span class="notif-dot"></span>{/if}
						</button>
						<NotificationsDrawer open={notifOpen} onClose={() => (notifOpen = false)} />
					</div>
					<a class="icon-btn" href="/configuracoes" aria-label={t('topbar_configuracoes')} title={t('topbar_configuracoes')}>
						<Settings size={17} />
					</a>
					<button
						class="avatar-chip"
						onclick={handleAvatarClick}
						title={appState.user ? `${appState.user.email} · ${t('nav_cliqueSair')}` : t('nav_loginNaoConfigurado')}
						style="border:none;cursor:{appState.user ? 'pointer' : 'default'}"
					>
						{initials}
					</button>
				</div>
			</header>

			{#if appState.ready}
				{@render children()}
			{:else}
				<p class="empty">{t('app_carregando')}</p>
			{/if}
		</div>
	</main>
</div>

<GlobalSearch open={searchOpen} onClose={() => (searchOpen = false)} />
<QuickAddModal open={showNewGlobal} onClose={() => (showNewGlobal = false)} />
<OnboardingModal open={showOnboarding} onClose={() => (showOnboarding = false)} />
<ConfirmDialog
	open={confirmSairOpen}
	title={t('sair_confirmarTitulo')}
	message={t('sair_confirmarMsg')}
	confirmLabel={t('sair_confirmarBotao')}
	cancelLabel={t('settings_cancelar')}
	onConfirm={confirmSair}
	onCancel={() => (confirmSairOpen = false)}
/>
<ToastHost />

<nav class="bottom-nav">
	<button class="bottom-nav-item" onclick={() => (mobileNavOpen = true)} aria-label={t('nav_maisOpcoes')}>
		<Menu size={20} />
		<span>{t('nav_mais')}</span>
	</button>
	{#each bottomNavItems as item (item.href)}
		<a href={item.href} class="bottom-nav-item" class:active={isActive(item.href)}>
			<item.icon size={20} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
			<span>{item.label}</span>
		</a>
	{/each}
	<button class="bottom-nav-fab" onclick={() => (showNewGlobal = true)} aria-label={t('nav_novoLancamento')}>
		<Plus size={22} />
	</button>
	{#each bottomNavItemsEnd as item (item.href)}
		<a href={item.href} class="bottom-nav-item" class:active={isActive(item.href)}>
			<item.icon size={20} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>
