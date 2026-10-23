import { legacyPlanSection } from '../goals/sales-deletion.js';
import { enforceSalesDeletions } from './sales-delete.js';
import { readSyncRecords, syncRecordStatements, runSyncStatements } from './sync-records.js';
/**
 * Sincronismo Plena ↔ Nextgoals
 *
 * Regras de segurança:
 *  - Sync é OPT-IN: o usuário precisa ativar explicitamente com OTP.
 *  - Sync pode ser desligado a qualquer momento (enabled = 0).
 *  - A escrita local SEMPRE ocorre antes da chamada de sync.
 *    Se o sync falhar, a escrita local já está salva — nunca perdemos dados.
 *  - O endpoint de inbound usa SYNC_SECRET compartilhado para autenticação.
 *  - Loops são evitados: o inbound endpoint escreve direto no D1
 *    sem passar pelo handler normal de PUT (que dispararia outro sync).
 *
 * Mapeamento de coleções:
 *   Plena goalCategories ↔ Nextgoals categories
 *   Plena salesPlans     ↔ Nextgoals salesPlans  (com transformação de ID)
 *   Todas as outras coleções: mesmo nome nos dois sistemas.
 *
 * Coleções que NUNCA sincronizam:
 *   Plena-only : finAccounts, finCategories, finTransactions,
 *                patrimony*, budgetGlobal, alertThresholds, settings,
 *                reportTemplates, reportHistory, reportSchedule,
 *                scoreSnapshots, purchaseInstallments
 *   Nextgoals-only : contributions, fin*
 */

// Plena name  →  Nextgoals name
const TO_NEXTGOALS = {
  goals:         'goals',
  resources:     'resources',
  resourceMoves: 'resourceMoves',
  installments:  'installments',
  amortizations: 'amortizations',
  goalCategories:'categories',   // ← nome diferente
  salesSections: 'salesSections',
  salesTypes:    'salesTypes',
  sales:         'sales',
  salesPlans:    'salesPlans',
  salesTypeRemovals: 'salesTypeRemovals',
};

// Nextgoals name  →  Plena name
const TO_PLENA = Object.fromEntries(
  Object.entries(TO_NEXTGOALS).map(([p, n]) => [n, p])
);

// Conjunto das coleções do Plena que participam do sync
export const SYNCABLE_PLENA = new Set(Object.keys(TO_NEXTGOALS));

export function isSyncable(plenaCollection) {
  return SYNCABLE_PLENA.has(plenaCollection);
}

// ---------------------------------------------------------------------------
// Transformações de dados Plena → Nextgoals
// ---------------------------------------------------------------------------

/**
 * Converte o documento do Plena para o formato do Nextgoals.
 * Retorna { ngCollection, ngId, ngData } ou null se não deve sincronizar.
 */
export function plenaToNextgoals(plenaCollection, plenaId, plenaData) {
  const ngCollection = TO_NEXTGOALS[plenaCollection];
  if (!ngCollection) return null;

  if (plenaCollection === 'salesPlans') {
    const month = plenaData.month || plenaId.split(':').at(-1);
    const sectionId = plenaData.sectionId || 'default';
    const ngId = `${sectionId}:${month}`;
    return { ngCollection, ngId, ngData: { ...plenaData, id: ngId, month, sectionId } };
  }
  const ngData = ['sales', 'salesTypes'].includes(plenaCollection)
    ? { ...plenaData, sectionId: plenaData.sectionId || 'default' } : plenaData;
  return { ngCollection, ngId: plenaId, ngData };
}

/**
 * Converte o documento do Nextgoals para o formato do Plena.
 * Retorna { collection, id, data } ou null se não deve sincronizar.
 */
export function nextgoalsToPlena(ngCollection, ngId, ngData) {
  const collection = TO_PLENA[ngCollection];
  if (!collection) return null;

  if (ngCollection === 'salesPlans') {
    const month = ngData.month || ngId.split(':').at(-1);
    const sectionId = ngData.sectionId || (ngId.includes(':') ? ngId.slice(0, ngId.lastIndexOf(':')) : 'default');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    const id = sectionId === 'default' ? month : `${sectionId}:${month}`;
    const { month: _month, ...rest } = ngData;
    return { collection, id, data: { ...rest, id, sectionId } };
  }
  return { collection, id: ngId, data: ngData };
}

// ---------------------------------------------------------------------------
// Acesso ao banco
// ---------------------------------------------------------------------------

/**
 * Retorna o sync_link ativo do usuário, ou null se não existir / estiver desabilitado.
 * @param {D1Database} db
 * @param {string} ownerEmail
 */
export async function getActiveSyncLink(db, ownerEmail) {
  const row = await db
    .prepare('SELECT id, nextgoals_user_id, enabled FROM sync_links WHERE plena_user_id = ?')
    .bind(ownerEmail)
    .first();
  if (!row || !row.enabled) return null;
  return row;
}

// ---------------------------------------------------------------------------
// Disparo de sync após escrita local no Plena
// ---------------------------------------------------------------------------

/**
 * Chamado DEPOIS que a escrita local no D1 já foi confirmada.
 * Nunca lança exceção: erros são registrados em sync_links.last_sync_error.
 *
 * @param {D1Database}  db
 * @param {string}      ownerEmail  - email do usuário no Plena
 * @param {'PUT'|'DELETE'} operation
 * @param {string}      collection  - nome da coleção NO PLENA
 * @param {string}      id
 * @param {object|null} data        - null em DELETE
 * @param {object}      env         - env bindings do Worker
 */
export async function triggerSyncToNextgoals(db, ownerEmail, operation, collection, id, data, env, sourceUpdatedAt = Date.now()) {
  if (!isSyncable(collection)) return;

  const link = await getActiveSyncLink(db, ownerEmail);
  if (!link) return;

  const ngUrl = env.NEXTGOALS_URL;
  const syncSecret = env.SYNC_SECRET;
  if (!ngUrl || !syncSecret) {
    console.error('[sync] NEXTGOALS_URL ou SYNC_SECRET não configurado');
    return;
  }

  let ngCollection, ngId, ngData;
  if (operation === 'PUT') {
    const mapped = plenaToNextgoals(collection, id, data);
    if (!mapped) return;
    ({ ngCollection, ngId, ngData } = mapped);
  } else {
    // DELETE: envia collection e id mapeados, sem body
    ngCollection = TO_NEXTGOALS[collection];
    if (!ngCollection) return;
    if (collection === 'salesPlans') {
      // Plena id = YYYY-MM → Nextgoals id = default:YYYY-MM
      ngId = id.includes(':') ? id : `default:${id}`;
    } else {
      ngId = id;
    }
    ngData = null;
  }

  try {
    const resp = await nextgoalsFetch(env, '/api/sync/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({
        target_user_id: link.nextgoals_user_id,
        operation,
        collection: ngCollection,
        id: ngId,
        data: ngData,
        source_updated_at: sourceUpdatedAt,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      await db.prepare(
        'UPDATE sync_links SET last_sync_at = ?, last_sync_error = NULL WHERE id = ?'
      ).bind(new Date().toISOString(), link.id).run().catch(() => {});
    } else {
      const text = await resp.text().catch(() => '');
      const err = `${operation} ${collection}/${id}: HTTP ${resp.status} ${text.slice(0, 200)}`;
      await db.prepare(
        'UPDATE sync_links SET last_sync_error = ? WHERE id = ?'
      ).bind(err, link.id).run().catch(() => {});
    }
  } catch (e) {
    const err = `${operation} ${collection}/${id}: ${e.message}`.slice(0, 400);
    await db.prepare(
      'UPDATE sync_links SET last_sync_error = ? WHERE id = ?'
    ).bind(err, link.id).run().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// OTP helpers (reutiliza padrões de auth.js do Plena)
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64url(bytes) {
  let b = '';
  for (const byte of bytes) b += String.fromCharCode(byte);
  return btoa(b).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function randomId() {
  return base64url(crypto.getRandomValues(new Uint8Array(20)));
}

export function randomSyncOtpCode() {
  const max = 4_294_000_000;
  let v;
  do v = crypto.getRandomValues(new Uint32Array(1))[0]; while (v >= max);
  return String(v % 1_000_000).padStart(6, '0');
}

export async function hashOtp(code) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(code));
  return base64url(new Uint8Array(digest));
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Verificação do SYNC_SECRET para o endpoint de inbound
// ---------------------------------------------------------------------------

export function verifySyncSecret(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.SYNC_SECRET || !token) return false;
  return timingSafeEqual(token, env.SYNC_SECRET);
}

// Service bindings keep Worker calls independent of browser login redirects.
export function nextgoalsFetch(env, path, options) {
  const request = new Request(new URL(path, env.NEXTGOALS_URL), { ...options, redirect: 'manual' });
  return env.NEXTGOALS ? env.NEXTGOALS.fetch(request) : fetch(request);
}

export function isMachineSyncPath(path) {
  return new Set(['/api/sync/inbound', '/api/sync/m2m/initiate', '/api/sync/m2m/verify',
    '/api/sync/m2m/disable', '/api/sync/m2m/status', '/api/sync/m2m/reconcile']).has(path);
}

export async function reconcileSync(db, owner, env, { force = false } = {}) {
  const link = await db.prepare('SELECT id, nextgoals_user_id, reconciled_at FROM sync_links WHERE plena_user_id = ? AND enabled = 1').bind(owner).first();
  if (!link) return { linked: false };
  if (!force && link.reconciled_at && Date.now() - link.reconciled_at < 30_000) return { linked: true };
  try {
    const local = await readSyncRecords(db, owner, 'owner_email', SYNCABLE_PLENA);
    const legacySection = local.find(record => record.collection === 'salesSections' && !record.deleted && !record.data.deleted && record.data.name === 'Turismo')?.id;
    const records = local.map(record => {
      const data = record.data && legacySection && ['salesPlans', 'salesTypes', 'sales'].includes(record.collection) && !record.data.sectionId
        ? { ...record.data, sectionId: legacyPlanSection(local, record, legacySection) } : record.data;
      const mapped = plenaToNextgoals(record.collection, record.id, data || { id: record.id });
      return { ...record, collection: mapped.ngCollection, id: mapped.ngId, ...(record.deleted ? {} : { data: mapped.ngData }) };
    });
    const response = await nextgoalsFetch(env, '/api/sync/reconcile', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${env.SYNC_SECRET}` },
      body: JSON.stringify({ target_user_id: link.nextgoals_user_id, records }), signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`NextGoals: HTTP ${response.status} ${(await response.text()).slice(0, 180)}`);
    const result = await response.json();
    if (!Array.isArray(result.records)) throw new Error('Resposta de sincronização inválida.');
    const statements = [];
    for (const record of result.records) {
      const mapped = nextgoalsToPlena(record.collection, record.id, record.data || { id: record.id });
      if (!mapped) continue;
      statements.push(...syncRecordStatements(db, owner, 'owner_email', { ...record, collection: mapped.collection, id: mapped.id, data: mapped.data }));
    }
    await runSyncStatements(db, statements);
    await enforceSalesDeletions(db, owner, 'owner_email');
    await db.prepare('UPDATE sync_links SET reconciled_at = ?, last_sync_at = ?, last_sync_error = NULL WHERE id = ?')
      .bind(Date.now(), new Date().toISOString(), link.id).run();
    return { linked: true, ok: true };
  } catch (error) {
    await db.prepare('UPDATE sync_links SET last_sync_error = ? WHERE id = ?').bind(error.message.slice(0, 400), link.id).run();
    console.error('[sync/reconcile]', error.message);
    return { linked: true, error: 'Não foi possível atualizar todos os dados da integração. Uma nova tentativa será feita automaticamente.' };
  }
}
