/**
 * POST /api/sync/inbound
 *
 * Recebe uma escrita vinda do Nextgoals e aplica no D1 do Plena.
 * Autenticado via SYNC_SECRET no header Authorization: Bearer <secret>.
 *
 * Body:
 * {
 *   source_user_id: string,   // e-mail do usuário no Nextgoals
 *   operation: 'PUT'|'DELETE',
 *   collection: string,       // nome da coleção NO NEXTGOALS
 *   id: string,
 *   data: object|null,        // null em DELETE
 *   source_updated_at: number // timestamp Unix ms da escrita original
 * }
 *
 * Segurança:
 *  - Apenas aceita chamadas com o SYNC_SECRET correto.
 *  - Verifica que existe um sync_link ativo para o usuário.
 *  - Escreve DIRETAMENTE no D1 sem passar pelo handler de PUT/DELETE normal
 *    → evita loop de sync.
 *  - O updated_at local só é atualizado se source_updated_at > updated_at atual
 *    → last-write-wins com base no timestamp da escrita original.
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { verifySyncSecret, nextgoalsToPlena } from '$lib/server/sync.js';

export const prerender = false;

const SYNCABLE_FROM_NEXTGOALS = new Set([
  'goals', 'resources', 'resourceMoves', 'installments', 'amortizations',
  'categories', 'salesSections', 'salesTypes', 'sales', 'salesPlans',
]);

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f]/.test(id);
}

export async function POST({ request }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });

  // 1. Autenticação via SYNC_SECRET
  if (!verifySyncSecret(request, env)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Corpo inválido' }, { status: 400 }); }

  const { source_user_id, operation, collection, id, data, source_updated_at } = body ?? {};

  if (!source_user_id || typeof source_user_id !== 'string') {
    return json({ error: 'source_user_id obrigatório' }, { status: 400 });
  }
  if (operation !== 'PUT' && operation !== 'DELETE') {
    return json({ error: 'operation deve ser PUT ou DELETE' }, { status: 400 });
  }
  if (!SYNCABLE_FROM_NEXTGOALS.has(collection)) {
    return json({ error: 'Coleção não sincronizável' }, { status: 400 });
  }
  if (!validId(id)) {
    return json({ error: 'id inválido' }, { status: 400 });
  }

  // 2. Verifica sync_link ativo
  const link = await db
    .prepare(
      'SELECT id FROM sync_links WHERE nextgoals_user_id = ? AND enabled = 1'
    )
    .bind(source_user_id)
    .first();

  if (!link) {
    // O sync foi desabilitado — ignora silenciosamente (não é erro do chamador)
    return json({ ok: true, skipped: 'sync_disabled' });
  }

  // O plena_user_id é o mesmo e-mail (ambos usam o mesmo identificador)
  const ownerEmail = source_user_id;

  if (operation === 'DELETE') {
    // Para DELETE: mapeia a coleção e o ID
    const mapped = nextgoalsToPlena(collection, id, { id });
    if (!mapped) return json({ ok: true, skipped: 'unmappable' });
    await db.prepare(
      'DELETE FROM documents WHERE owner_email = ? AND collection = ? AND id = ?'
    ).bind(ownerEmail, mapped.collection, mapped.id).run();
    return json({ ok: true });
  }

  // PUT
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ error: 'data deve ser um objeto para operação PUT' }, { status: 400 });
  }
  if (JSON.stringify(data).length > 256 * 1024) {
    return json({ error: 'document_too_large' }, { status: 413 });
  }

  const mapped = nextgoalsToPlena(collection, id, data);
  if (!mapped) return json({ ok: true, skipped: 'unmappable' });

  const updatedAt = Number.isFinite(source_updated_at) ? source_updated_at : Date.now();

  // Last-write-wins: só atualiza se o registro recebido for mais recente
  // (ou se não existir localmente ainda)
  await db.prepare(`
    INSERT INTO documents (owner_email, collection, id, data, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner_email, collection, id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= documents.updated_at
  `).bind(ownerEmail, mapped.collection, mapped.id, JSON.stringify(mapped.data), updatedAt).run();

  return json({ ok: true });
}
