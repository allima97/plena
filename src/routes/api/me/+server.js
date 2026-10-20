import { json } from '@sveltejs/kit';
import { claimLegacyData, dataOwner, isLegacyDataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

/** GET /api/me — identidade da pessoa logada (o hooks.server.js já garante
 * que só chega aqui quem passou pelo Cloudflare Access). */
export async function GET({ locals, platform }) {
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (platform?.env?.DB) await claimLegacyData(platform.env.DB, owner, platform.env);
	return json({
		email: owner,
		name: locals.user.name,
		isLegacyDataOwner: isLegacyDataOwner(owner, platform?.env),
		logoutUrl: platform?.env?.TEAM_DOMAIN ? `${platform.env.TEAM_DOMAIN}/cdn-cgi/access/logout` : null
	});
}
