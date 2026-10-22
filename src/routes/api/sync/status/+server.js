import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

/** GET /api/sync/status — retorna o estado do vínculo de sync do usuário */
export async function GET({ locals }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });

  const row = await db
    .prepare(
      'SELECT id, nextgoals_user_id, enabled, created_at, disabled_at, last_sync_at, last_sync_error ' +
      'FROM sync_links WHERE plena_user_id = ?'
    )
    .bind(owner)
    .first();

  if (!row) return json({ linked: false });

  return json({
    linked: true,
    enabled: row.enabled === 1,
    nextgoals_user_id: row.nextgoals_user_id,
    created_at: row.created_at,
    disabled_at: row.disabled_at ?? null,
    last_sync_at: row.last_sync_at ?? null,
    last_sync_error: row.last_sync_error ?? null,
  });
}
