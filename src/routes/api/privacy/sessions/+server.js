import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';
import { listAccountSessions, revokeOtherSessions } from '$lib/server/auth.js';
export const prerender = false;
export async function GET({ locals, request }) {
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
  return json({ sessions: await listAccountSessions(request, env, owner) });
}
export async function POST({ locals, request }) {
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json();
  if (body.confirm !== true) return json({ error: 'Confirme o encerramento das outras sessões.' }, { status: 400 });
  return json({ revoked: await revokeOtherSessions(request, env, owner) });
}
