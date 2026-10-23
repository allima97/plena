import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { verifySyncSecret, reconcileSync } from '$lib/server/sync.js';
export const prerender = false;
export async function POST({ request }) {
  if (!verifySyncSecret(request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Corpo inválido.' }, { status: 400 }); }
  const owner = typeof body?.user_id === 'string' ? body.user_id.trim().toLowerCase() : '';
  if (!owner) return json({ error: 'E-mail obrigatório.' }, { status: 400 });
  const result = await reconcileSync(env.DB, owner, env);
  return json(result, { status: result.error ? 502 : 200 });
}
