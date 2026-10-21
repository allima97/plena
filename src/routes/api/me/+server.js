import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { claimLegacyData, dataOwner, isLegacyDataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

/** GET /api/me — identidade da pessoa logada (o hooks.server.js já garante
 * que só chega aqui quem passou pelo Cloudflare Access). */
export async function GET({ locals }) {
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (env.DB) await claimLegacyData(env.DB, owner, env);
	return json({
		email: owner,
		name: locals.user.name,
		isLegacyDataOwner: isLegacyDataOwner(owner, env),
		logoutUrl: env.TEAM_DOMAIN ? `${env.TEAM_DOMAIN}/cdn-cgi/access/logout` : null
	});
}
