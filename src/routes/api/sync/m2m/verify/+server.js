/**
 * POST /api/sync/m2m/verify
 *
 * Endpoint machine-to-machine: Nextgoals verifica o OTP e ativa o sync.
 *
 * Auth : Authorization: Bearer <SYNC_SECRET>
 * Body : { user_id: "email@do.usuario", code: "123456" }
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { hashOtp, timingSafeEqual, randomId } from '$lib/server/sync.js';

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
  const code  = String(body?.code ?? '').trim();
  if (!owner) return json({ error: 'user_id é obrigatório.' }, { status: 400 });
  if (!/^\d{6}$/.test(code)) {
    return json({ error: 'Código inválido. Informe os 6 dígitos.' }, { status: 400 });
  }

  const now = Date.now();

  const otp = await db
    .prepare(
      'SELECT id, code_hash FROM sync_otps ' +
      'WHERE owner_email = ? AND used = 0 AND expires_at > ? ' +
      'ORDER BY created_at DESC LIMIT 1'
    )
    .bind(owner, now)
    .first()
    .catch(() => null);

  if (!otp) {
    return json({ error: 'Código expirado ou não encontrado. Solicite um novo.' }, { status: 400 });
  }

  const inputHash = await hashOtp(code);
  if (!timingSafeEqual(inputHash, otp.code_hash)) {
    return json({ error: 'Código incorreto.' }, { status: 400 });
  }

  await db.prepare('UPDATE sync_otps SET used = 1 WHERE id = ?').bind(otp.id).run();

  const ngUrl      = env.NEXTGOALS_URL;
  const syncSecret = env.SYNC_SECRET;
  if (!ngUrl || !syncSecret) {
    return json({ error: 'Serviço de sync não configurado.' }, { status: 503 });
  }

  // Cria ou re-habilita o sync_link no Plena
  const existingLink = await db
    .prepare('SELECT id FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first()
    .catch(() => null);
  const linkId = existingLink?.id ?? randomId();
  const nowIso = new Date().toISOString();

  if (existingLink) {
    await db
      .prepare('UPDATE sync_links SET enabled = 1, disabled_at = NULL, last_sync_error = NULL WHERE id = ?')
      .bind(linkId)
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO sync_links (id, plena_user_id, nextgoals_user_id, enabled, created_at) ' +
        'VALUES (?, ?, ?, 1, ?)'
      )
      .bind(linkId, owner, owner, nowIso)
      .run();
  }

  // Registra no Nextgoals
  try {
    const ngResp = await fetch(`${ngUrl}/api/sync/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ user_id: owner }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!ngResp.ok) {
      await db
        .prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
        .bind(nowIso, linkId)
        .run();
      return json({ error: 'Não foi possível ativar o sync no Nextgoals. Tente novamente.' }, { status: 502 });
    }
  } catch (e) {
    await db
      .prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
      .bind(nowIso, linkId)
      .run();
    return json({ error: 'Não foi possível contactar o Nextgoals. Tente novamente.' }, { status: 502 });
  }

  return json({ ok: true });
}
