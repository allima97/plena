import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { claimLegacyData, dataOwner, isLegacyDataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

/** GET /api/me — identidade da pessoa com uma sessão Plena válida. */
export async function GET({ locals }) {
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (env.DB) await claimLegacyData(env.DB, owner, env);
	return json({
		email: owner,
		name: locals.user.name,
		isLegacyDataOwner: isLegacyDataOwner(owner, env),
		logoutUrl: '/api/auth/logout'
	});
}
