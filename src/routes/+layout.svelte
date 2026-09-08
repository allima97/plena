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
		Bell
	} from 'lucide-svelte';

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
			<img src="/logo.jpg" alt="Plena" class="brand-mark" />
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
					<button class="icon-btn" aria-label="Buscar"><Search size={17} /></button>
					<button class="icon-btn" aria-label="Notificações" style="position:relative">
						<Bell size={17} />
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
