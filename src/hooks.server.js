import { env } from 'cloudflare:workers';
import { claimLegacyData } from '$lib/server/data-owner.js';
import { getSessionUser, handleAuthRoute } from '$lib/server/auth.js';

function withSecurityHeaders(response, isApi = false) {
	const headers = new Headers(response.headers);
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('X-Frame-Options', 'DENY');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	headers.set('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
	headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (isApi) {
		headers.set('Cache-Control', 'private, no-store, max-age=0');
		headers.set('Pragma', 'no-cache');
		headers.set('Expires', '0');
		headers.append('Vary', 'Cookie');
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function sameOriginMutation(request, url) {
	if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;
	return request.headers.get('Origin') === url.origin;
}

function redirectToLogin(url) {
	const returnTo = `${url.pathname}${url.search}`;
	return new Response(null, {
		status: 303,
		headers: { Location: `/login?returnTo=${encodeURIComponent(returnTo)}`, 'Cache-Control': 'no-store' }
	});
}

const PUBLIC_ASSET_PREFIXES = ['/_app/', '/icons/'];
const PUBLIC_ASSETS = new Set(['/favicon.svg', '/manifest.webmanifest', '/service-worker.js', '/robots.txt']);

export async function handle({ event, resolve }) {
	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	if (path.startsWith('/api/auth/')) {
		const response = await handleAuthRoute(event, env);
		if (response) return withSecurityHeaders(response, true);
	}

	const user = await getSessionUser(event.request, env);
	if (user) {
		event.locals.user = user;
		if (env.DB) await claimLegacyData(env.DB, user.email, env);
	}

	if (path === '/login') {
		if (user) return withSecurityHeaders(new Response(null, { status: 303, headers: { Location: '/' } }));
	} else if (isApi) {
		if (!user) return withSecurityHeaders(Response.json({ error: 'unauthorized' }, { status: 401 }), true);
		const needsOwnerMatch = event.request.method === 'PUT' || event.request.method === 'DELETE';
		const includesOwner = event.request.headers.has('X-Plena-Owner');
		if (needsOwnerMatch || includesOwner) {
			const expectedOwner = event.request.headers.get('X-Plena-Owner')?.trim().toLowerCase();
			if (!expectedOwner || expectedOwner !== user.email)
				return withSecurityHeaders(Response.json({ error: 'account_changed' }, { status: 409 }), true);
		}
		if (!sameOriginMutation(event.request, event.url))
			return withSecurityHeaders(Response.json({ error: 'forbidden' }, { status: 403 }), true);
		const contentType = event.request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
		if (event.request.method === 'PUT' && contentType !== 'application/json')
			return withSecurityHeaders(Response.json({ error: 'unsupported_media_type' }, { status: 415 }), true);
	} else if (!user && !PUBLIC_ASSETS.has(path) && !PUBLIC_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return withSecurityHeaders(redirectToLogin(event.url));
	}

	return withSecurityHeaders(await resolve(event), isApi);
}
