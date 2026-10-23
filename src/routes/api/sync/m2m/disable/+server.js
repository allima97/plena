/**
 * POST /api/sync/m2m/disable
 *
 * Endpoint machine-to-machine: Nextgoals desativa o sync no lado Plena.
 * O Nextgoals já desativou seu próprio registro antes de chamar este endpoint.
 * Dados NÃO são apagados.
 *
 * Auth : Authorization: Bearer <SYNC_SECRET>
 * Body : { user_id: "email@do.usuario" }
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';

export const prerender = false;

function verifySyncSecret(request) {
  const auth   = request.headers.get('Authorization') || '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = env.SYNC_SECRET;
  if (!secret || !token) return false;
  if (token.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST({ request }) {
  if (!verifySyncSecret(request)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }

  const owner = typeof body?.user_id === 'string' ? body.user_id.toLowerCase().trim() : '';
  if (!owner) return json({ error: 'user_id é obrigatório.' }, { status: 400 });

  const nowIso = new Date().toISOString();
  const link = await db
    .prepare('SELECT id, enabled FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first()
    .catch(() => null);

  if (!link || !link.enabled) {
    return json({ ok: true, message: 'Sync já estava desativado.' });
  }

  await db
    .prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
    .bind(nowIso, link.id)
    .run();

  return json({ ok: true });
}
