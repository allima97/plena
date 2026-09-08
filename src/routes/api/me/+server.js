import { json } from '@sveltejs/kit';

export const prerender = false;

/** GET /api/me — identidade da pessoa logada (o hooks.server.js já garante
 * que só chega aqui quem passou pelo Cloudflare Access). */
export async function GET({ locals, platform }) {
	if (!locals.user) return json({ error: 'unauthorized' }, { status: 401 });
	return json({
		email: locals.user.email,
		name: locals.user.name,
		logoutUrl: platform?.env?.TEAM_DOMAIN ? `${platform.env.TEAM_DOMAIN}/cdn-cgi/access/logout` : null
	});
}
