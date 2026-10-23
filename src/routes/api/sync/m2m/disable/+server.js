import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { verifySyncSecret } from '$lib/server/sync.js';
import { POST as handle } from '../../disable/+server.js';

export const prerender = false;
export async function POST(event) {
  if (!verifySyncSecret(event.request, env)) return json({ error: 'unauthorized' }, { status: 401 });
  if (!env.DB) return json({ error: 'D1 não configurado' }, { status: 503 });
  let body;
  try { body = await event.request.json(); }
  catch { return json({ error: 'Corpo inválido.' }, { status: 400 }); }
  const owner = typeof body?.user_id === 'string' ? body.user_id.trim().toLowerCase() : '';
  if (!owner || owner.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner))
    return json({ error: 'E-mail inválido.' }, { status: 400 });
  return handle({ ...event, locals: { user: { email: owner } },
    request: new Request(event.request.url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: body.code, confirm: true }) }) });
}
