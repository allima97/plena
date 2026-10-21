/// <reference types="@sveltejs/kit" />
// Service worker mínimo do Plena: cacheia os assets de build + estáticos para
// permitir "Adicionar à tela inicial" / instalação como PWA e um uso básico
// offline (a tela abre; dados dependem de já terem sido carregados antes).
import { assets, immutable, prerendered } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `plena-cache-${version}`;
const ASSETS = [...immutable, ...assets, ...prerendered].map(({ path }) => new URL(path, self.location.origin).pathname);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE) await caches.delete(key);
			}
			self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Chamadas de API e páginas renderizadas pelo servidor não são interceptadas:
	// deixa o browser fazer a requisição diretamente para evitar que uma falha
	// de rede rejeite a promise do FetchEvent e produza um "network error".
	if (url.pathname.startsWith('/api/') || !ASSETS.includes(url.pathname)) return;

	// Assets conhecidos do build: serve do cache, atualiza em background.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			const cached = await cache.match(url.pathname);
			if (cached) return cached;
			try {
				const response = await fetch(event.request);
				if (response.status === 200 && response.type === 'basic') cache.put(url.pathname, response.clone());
				return response;
			} catch {
				const fallback = await cache.match(url.pathname);
				if (fallback) return fallback;
				return Response.error();
			}
		})()
	);
});
