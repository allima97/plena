import { readJson, RequestError, securityHeaders } from '$lib/server/security.js';
import { env } from 'cloudflare:workers';
import { claimLegacyData } from '$lib/server/data-owner.js';
import { getSessionUser, handleAuthRoute } from '$lib/server/auth.js';
import { isMachineSyncPath, verifySyncSecret } from '$lib/server/sync.js';

function withSecurityHeaders(response, isApi = false) { return securityHeaders(response, isApi); }

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
const PUBLIC_ASSETS = new Set(['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/manifest.webmanifest', '/service-worker.js', '/robots.txt', '/privacidade.html', '/privacidade']);

async function boundedBody(event, machine = false) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method) || !event.request.body) return;
  const body = await readJson(event.request, machine ? 8 * 1024 * 1024 : 262144);
  const headers = new Headers(event.request.headers); headers.delete('content-length');
  event.request = new Request(event.request.url, { method: event.request.method, headers, body: JSON.stringify(body) });
}
export async function handle(args) {
  try { return await handleRequest(args); }
  catch (error) {
    if (!(error instanceof RequestError)) throw error;
    return withSecurityHeaders(Response.json({ error: error.message }, { status: error.status }), true);
  }
}
async function handleRequest({ event, resolve }) {
	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	// These exact routes authenticate the other Worker, rather than a browser.
	if (isMachineSyncPath(path)) {
		if (!verifySyncSecret(event.request, env))
			return withSecurityHeaders(Response.json({ error: 'unauthorized' }, { status: 401 }), true);
		await boundedBody(event, true);
		return withSecurityHeaders(await resolve(event), true);
	}
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
		const needsOwnerMatch = ['POST','PUT','PATCH','DELETE'].includes(event.request.method);
		const includesOwner = event.request.headers.has('X-Plena-Owner');
		if (needsOwnerMatch || includesOwner) {
			const expectedOwner = event.request.headers.get('X-Plena-Owner')?.trim().toLowerCase();
			if (!expectedOwner || expectedOwner !== user.email)
				return withSecurityHeaders(Response.json({ error: 'account_changed' }, { status: 409 }), true);
		}
		if (!sameOriginMutation(event.request, event.url))
			return withSecurityHeaders(Response.json({ error: 'forbidden' }, { status: 403 }), true);
		const contentType = event.request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
		if (event.request.body && contentType !== 'application/json')
			return withSecurityHeaders(Response.json({ error: 'unsupported_media_type' }, { status: 415 }), true);
		await boundedBody(event);
	} else if (!user && !PUBLIC_ASSETS.has(path) && !PUBLIC_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix))) {
		return withSecurityHeaders(redirectToLogin(event.url));
	}

	return withSecurityHeaders(await resolve(event), isApi || !!user || path === '/login');
}
