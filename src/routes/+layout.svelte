<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '../app.css';
	import { appState, boot, retrySync } from '$lib/fin/store.svelte.js';
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
		Wand2
	} from 'lucide-svelte';
	import { upcomingDue } from '$lib/fin/derived.js';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import NotificationsDrawer from '$lib/components/NotificationsDrawer.svelte';
	import QuickAddModal from '$lib/components/QuickAddModal.svelte';
	import ToastHost from '$lib/components/ToastHost.svelte';

	let { children } = $props();

	let searchOpen = $state(false);
	let notifOpen = $state(false);
	let showNewGlobal = $state(false);

	const navItems = [
		{ href: '/', label: 'Visão geral', icon: LayoutDashboard },
		{ href: '/movimentacoes', label: 'Movimentações', icon: ReceiptText },
		{ href: '/contas', label: 'Contas e cartões', icon: WalletCards },
		{ href: '/categorias', label: 'Categorias', icon: Tags },
		{ href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
		{ href: '/objetivos', label: 'Objetivos', icon: Target },
		{ href: '/patrimonio', label: 'Patrimônio', icon: Landmark },
		{ href: '/simulador', label: 'Simulador', icon: Wand2 }
	];

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
		if (appState.user?.logoutUrl) window.location.href = appState.user.logoutUrl;
	}

	function isActive(href) {
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname.startsWith(href);
	}

	const activeLabel = $derived(navItems.find((n) => isActive(n.href))?.label ?? 'Plena');

	const bottomNavItems = [
		{ href: '/', label: 'Início', icon: LayoutDashboard }
	];
	const bottomNavItemsEnd = [
		{ href: '/movimentacoes', label: 'Mov.', icon: ReceiptText },
		{ href: '/objetivos', label: 'Objetivos', icon: Target }
	];

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
</script>

<div class="app-shell" class:nav-open={mobileNavOpen}>
	<aside class="sidebar">
		<div class="brand">
			<img src="/icons/icon-192.png" alt="Plena" class="brand-mark" />
			<div>
				<p class="font-display brand-name">Plena</p>
				<p class="brand-tag">controle leve</p>
			</div>
			<button class="icon-btn mobile-close" onclick={() => (mobileNavOpen = false)} aria-label="Fechar menu">
				<X size={18} />
			</button>
		</div>

		<div class="nav-block">
			<p class="nav-label">Menu principal</p>
			<nav>
				{#each navItems as item (item.href)}
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

		<div class="sidebar-footer">
			<div class="tip-card">
				<p class="tip-title">Dica rápida</p>
				<p class="tip-body">
					Use categorias secundárias para entender exatamente onde o dinheiro está indo.
				</p>
			</div>
			<div class="sync-status" class:is-error={appState.mode === 'api' && appState.syncStatus === 'error'}>
				{#if appState.mode === 'api'}
					{#if appState.syncStatus === 'saving'}
						<span class="sync-dot saving"></span> Salvando…
					{:else if appState.syncStatus === 'error'}
						<span class="sync-dot error"></span> Alteração não sincronizada
						<button class="sync-retry" onclick={retrySync}>Tentar novamente</button>
					{:else}
						<span class="sync-dot ok"></span> Sincronizado
					{/if}
				{:else if appState.mode === 'local'}
					Salvo neste navegador
				{:else}
					Carregando…
				{/if}
			</div>
			{#if appState.user?.logoutUrl}
				<button class="nav-item logout-btn" onclick={handleAvatarClick}>
					<LogOut size={18} strokeWidth={1.8} />
					<span>Sair</span>
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
					<button class="icon-btn" aria-label="Buscar" onclick={() => { searchOpen = true; notifOpen = false; }}><Search size={17} /></button>
					<button class="icon-btn" aria-label={hideValues ? 'Exibir valores' : 'Ocultar valores'} title={hideValues ? 'Exibir valores' : 'Ocultar valores'} onclick={toggleHideValues}>
						{#if hideValues}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
					</button>
					<div class="notif-anchor">
						<button class="icon-btn" aria-label="Notificações" style="position:relative" onclick={() => { notifOpen = !notifOpen; searchOpen = false; }}>
							<Bell size={17} />
							{#if alertCount > 0}<span class="notif-dot"></span>{/if}
						</button>
						<NotificationsDrawer open={notifOpen} onClose={() => (notifOpen = false)} />
					</div>
					<button
						class="avatar-chip"
						onclick={handleAvatarClick}
						title={appState.user ? `${appState.user.email} · clique para sair` : 'Login não configurado'}
						style="border:none;cursor:{appState.user ? 'pointer' : 'default'}"
					>
						{initials}
					</button>
				</div>
			</header>

			{#if appState.ready}
				{@render children()}
			{:else}
				<p class="empty">Carregando…</p>
			{/if}
		</div>
	</main>
</div>

<GlobalSearch open={searchOpen} onClose={() => (searchOpen = false)} />
<QuickAddModal open={showNewGlobal} onClose={() => (showNewGlobal = false)} />
<ToastHost />

<nav class="bottom-nav">
	<button class="bottom-nav-item" onclick={() => (mobileNavOpen = true)} aria-label="Mais opções">
		<Menu size={20} />
		<span>Mais</span>
	</button>
	{#each bottomNavItems as item (item.href)}
		<a href={item.href} class="bottom-nav-item" class:active={isActive(item.href)}>
			<item.icon size={20} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
			<span>{item.label}</span>
		</a>
	{/each}
	<button class="bottom-nav-fab" onclick={() => (showNewGlobal = true)} aria-label="Novo lançamento">
		<Plus size={22} />
	</button>
	{#each bottomNavItemsEnd as item (item.href)}
		<a href={item.href} class="bottom-nav-item" class:active={isActive(item.href)}>
			<item.icon size={20} strokeWidth={isActive(item.href) ? 2.2 : 1.8} />
			<span>{item.label}</span>
		</a>
	{/each}
</nav>
