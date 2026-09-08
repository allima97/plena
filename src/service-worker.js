/// <reference types="@sveltejs/kit" />
// Service worker mínimo do Plena: cacheia os assets de build + estáticos para
// permitir "Adicionar à tela inicial" / instalação como PWA e um uso básico
// offline (a tela abre; dados dependem de já terem sido carregados antes).
import { build, files, version } from '$service-worker';

const CACHE = `plena-cache-${version}`;
const ASSETS = [...build, ...files];

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

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// Nunca cacheia chamadas de API — precisam sempre ir à rede/D1.
		if (url.pathname.startsWith('/api/')) {
			return fetch(event.request);
		}

		if (ASSETS.includes(url.pathname)) {
			const cached = await cache.match(url.pathname);
			if (cached) return cached;
		}

		try {
			const response = await fetch(event.request);
			if (response.status === 200) cache.put(event.request, response.clone());
			return response;
		} catch (err) {
			const cached = await cache.match(event.request);
			if (cached) return cached;
			throw err;
		}
	}

	event.respondWith(respond());
});
