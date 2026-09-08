<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '../app.css';
	import { appState, boot } from '$lib/fin/store.svelte.js';
	import {
		LayoutDashboard,
		ReceiptText,
		WalletCards,
		Tags,
		BarChart3,
		Target,
		Menu,
		X,
		Search,
		Bell,
		Eye,
		EyeOff
	} from 'lucide-svelte';
	import { upcomingDue } from '$lib/fin/derived.js';

	let { children } = $props();

	const navItems = [
		{ href: '/', label: 'Visão geral', icon: LayoutDashboard },
		{ href: '/movimentacoes', label: 'Movimentações', icon: ReceiptText },
		{ href: '/contas', label: 'Contas e cartões', icon: WalletCards },
		{ href: '/categorias', label: 'Categorias', icon: Tags },
		{ href: '/relatorios', label: 'Relatórios', icon: BarChart3 },
		{ href: '/objetivos', label: 'Objetivos', icon: Target }
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

	onMount(() => {
		boot();
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
			<p class="mode-note">
				{appState.mode === 'api' ? 'Salvo no banco de dados' : appState.mode === 'local' ? 'Salvo neste navegador' : 'Carregando…'}
			</p>
		</div>
	</aside>

	<div class="backdrop" onclick={() => (mobileNavOpen = false)} aria-hidden="true"></div>

	<main class="main">
		<div class="main-inner">
			<header class="topbar">
				<div class="topbar-left">
					<button class="icon-btn mobile-only" onclick={() => (mobileNavOpen = true)} aria-label="Abrir menu">
						<Menu size={19} />
					</button>
					<div class="mobile-only">
						<p class="font-display brand-name-sm">Plena</p>
					</div>
					<p class="section-label">{activeLabel}</p>
				</div>
				<div class="topbar-right">
					<button class="hide-values-btn" onclick={toggleHideValues}>
						{#if hideValues}<EyeOff size={15} /> Mostrar valores{:else}<Eye size={15} /> Ocultar valores{/if}
					</button>
					<button class="icon-btn" aria-label="Buscar"><Search size={17} /></button>
					<button class="icon-btn" aria-label="Notificações" style="position:relative">
						<Bell size={17} />
						{#if alertCount > 0}<span class="notif-dot"></span>{/if}
					</button>
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
