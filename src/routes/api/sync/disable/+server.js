/**
 * POST /api/sync/disable
 *
 * Desativa o sync entre Plena e Nextgoals.
 * Exige confirmação explícita no body para evitar desativações acidentais.
 *
 * Body: { confirm: true }
 *
 * O que acontece ao desativar:
 *  - sync_links.enabled = 0 no Plena D1
 *  - Nextgoals é notificado via /api/sync/deregister
 *  - Os DADOS permanecem intactos nos dois sistemas
 *  - Alterações posteriores em um sistema NÃO afetam o outro
 *  - Para reativar: novo fluxo de /api/sync/initiate + /api/sync/verify
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

export async function POST({ locals, request }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }

  if (body?.confirm !== true) {
    return json(
      { error: 'Confirme a desativação enviando { confirm: true } no corpo da requisição.' },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const link = await db
    .prepare('SELECT id, enabled FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first();

  if (!link) {
    return json({ ok: true, message: 'Nenhum sync ativo encontrado.' });
  }
  if (!link.enabled) {
    return json({ ok: true, message: 'Sync já estava desativado.' });
  }

  // Desativa localmente
  await db
    .prepare('UPDATE sync_links SET enabled = 0, disabled_at = ? WHERE id = ?')
    .bind(nowIso, link.id)
    .run();

  // Notifica o Nextgoals (best-effort: não falha a operação se o NG não responder)
  const ngUrl = env.NEXTGOALS_URL;
  const syncSecret = env.SYNC_SECRET;
  if (ngUrl && syncSecret) {
    fetch(`${ngUrl}/api/sync/deregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ user_id: owner }),
      signal: AbortSignal.timeout(8_000),
    }).catch(e => console.error('[sync/disable] falha ao notificar Nextgoals:', e.message));
  }

  return json({ ok: true });
}
