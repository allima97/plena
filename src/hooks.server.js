import { verifyAccessJWT } from '$lib/server/access.js';

function withSecurityHeaders(response, isApi) {
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
		headers.append('Vary', 'Cookie, Cf-Access-Jwt-Assertion');
	}
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isSameOriginMutation(request, url) {
	if (!['PUT', 'DELETE'].includes(request.method)) return true;
	const origin = request.headers.get('Origin');
	return origin !== null && origin === url.origin;
}

export async function handle({ event, resolve }) {
	const isApi = event.url.pathname.startsWith('/api/');
	if (isApi) {
		const env = event.platform?.env;
		const user = env ? await verifyAccessJWT(event.request, env) : null;
		if (!user) {
			return withSecurityHeaders(new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			}), true);
		}
		event.locals.user = user;
		if (!isSameOriginMutation(event.request, event.url)) {
			return withSecurityHeaders(new Response(JSON.stringify({ error: 'forbidden' }), {
				status: 403,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			}), true);
		}
		const contentType = event.request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
		if (event.request.method === 'PUT' && contentType !== 'application/json') {
			return withSecurityHeaders(new Response(JSON.stringify({ error: 'unsupported_media_type' }), {
				status: 415,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			}), true);
		}
	}
	return withSecurityHeaders(await resolve(event), isApi);
}
