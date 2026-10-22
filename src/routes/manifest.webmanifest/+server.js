import { pwaManifest } from '$lib/pwa-manifest.js';

export function GET({ request }) {
	return new Response(JSON.stringify(pwaManifest(request.headers.get('user-agent') || '')), {
		headers: {
			'Content-Type': 'application/manifest+json; charset=utf-8',
			'Cache-Control': 'no-cache',
			Vary: 'User-Agent'
		}
	});
}
