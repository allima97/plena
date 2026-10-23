/**
 * POST /api/sync/verify
 *
 * Verifica o OTP e ATIVA o sync entre Plena e Nextgoals.
 *
 * Body: { code: "123456" }
 *
 * Ao confirmar:
 *  1. Cria (ou re-habilita) o sync_link no Plena D1.
 *  2. Registra o sync no Nextgoals via /api/sync/register.
 *
 * Resposta:
 *   200 { ok: true }
 *   400 { error: '...' }  — código inválido ou expirado
 *   502 { error: '...' }  — falha ao registrar no Nextgoals
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';
import { hashOtp, timingSafeEqual, randomId, nextgoalsFetch, reconcileSync } from '$lib/server/sync.js';

export const prerender = false;

export async function POST({ locals, request }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }

  const code = String(body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    return json({ error: 'Código inválido. Informe os 6 dígitos.' }, { status: 400 });
  }

  const now = Date.now();

  // Busca OTP válido mais recente para este e-mail
  const otp = await db
    .prepare(
      'SELECT id, code_hash, attempts FROM sync_otps ' +
      'WHERE owner_email = ? AND used = 0 AND attempts < 5 AND expires_at > ? ' +
      'ORDER BY created_at DESC LIMIT 1'
    )
    .bind(owner, now)
    .first();

  if (!otp) {
    return json({ error: 'Código expirado ou não encontrado. Solicite um novo.' }, { status: 400 });
  }

  // Reserve the attempt atomically before comparing, including concurrent requests.
  const reserved = await db.prepare('UPDATE sync_otps SET attempts = attempts + 1 WHERE id = ? AND used = 0 AND attempts < 5 AND expires_at > ? RETURNING attempts').bind(otp.id, now).first();
  if (!reserved) return json({ error:'Código expirado ou limite de tentativas atingido.' }, { status:429 });
  const inputHash = await hashOtp(code, owner, env.AUTH_SECRET || env.SYNC_SECRET);
  if (!timingSafeEqual(inputHash, otp.code_hash)) {
    return json({ error: 'Código incorreto.' }, { status: 400 });
  }

  const ngUrl = env.NEXTGOALS_URL;
  const syncSecret = env.SYNC_SECRET;
  if (!ngUrl || !syncSecret) {
    return json({ error: 'Serviço de sync não configurado.' }, { status: 503 });
  }

  const claim = await db.prepare('UPDATE sync_otps SET used = 1 WHERE id = ? AND used = 0 AND attempts <= 5')
    .bind(otp.id).run();
  if (claim.meta.changes !== 1) return json({ error: 'Código já utilizado. Solicite um novo.' }, { status: 400 });
  await db.prepare('DELETE FROM sync_otps WHERE id = ? AND used = 1').bind(otp.id).run();

  // Cria ou re-habilita o sync_link no Plena
  const existingLink = await db
    .prepare('SELECT id FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first();

  const linkId = existingLink?.id ?? randomId();
  const nowIso = new Date().toISOString();

  if (existingLink) {
    await db
      .prepare(
        'UPDATE sync_links SET enabled = 1, disabled_at = NULL, last_sync_error = NULL WHERE id = ?'
      )
      .bind(linkId)
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO sync_links (id, plena_user_id, nextgoals_user_id, enabled, created_at) VALUES (?, ?, ?, 1, ?)'
      )
      .bind(linkId, owner, owner, nowIso)  // Plena e Nextgoals usam o mesmo e-mail
      .run();
  }

  // Registra o sync no Nextgoals
  try {
    const ngResp = await nextgoalsFetch(env, '/api/sync/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ user_id: owner }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!ngResp.ok) {
      // Desfaz o link se o Nextgoals rejeitou
      await db.prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
        .bind(nowIso, linkId).run();
      return json({ error: 'Não foi possível ativar o sync no Nextgoals. Tente novamente.' }, { status: 502 });
    }
  } catch (e) {
    await db.prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
      .bind(nowIso, linkId).run();
    return json({ error: 'Não foi possível contactar o Nextgoals. Tente novamente.' }, { status: 502 });
  }

  await db.prepare('INSERT INTO privacy_consents(owner, purpose, version, accepted_at, revoked_at) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(owner, purpose) DO UPDATE SET version = excluded.version, accepted_at = excluded.accepted_at, revoked_at = NULL').bind(owner, 'plena-nextgoals-sync', '2026-10-23', Date.now()).run();

  const reconciliation = await reconcileSync(db, owner, env, { force: true });
  return json({ ok: true, ...(reconciliation.error ? { warning: reconciliation.error } : {}) });
}
