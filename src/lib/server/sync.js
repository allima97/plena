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
    // Plena: { id: "YYYY-MM", target, superTarget, ... }
    // Nextgoals: { id: "sectionId:YYYY-MM", month: "YYYY-MM", sectionId, ... }
    const month = plenaId;                              // "YYYY-MM"
    const sectionId = plenaData.sectionId || 'default';
    const ngId = `${sectionId}:${month}`;
    const ngData = { ...plenaData, id: ngId, month, sectionId };
    return { ngCollection, ngId, ngData };
  }

  return { ngCollection, ngId: plenaId, ngData: plenaData };
}

/**
 * Converte o documento do Nextgoals para o formato do Plena.
 * Retorna { collection, id, data } ou null se não deve sincronizar.
 */
export function nextgoalsToPlena(ngCollection, ngId, ngData) {
  const collection = TO_PLENA[ngCollection];
  if (!collection) return null;

  if (ngCollection === 'salesPlans') {
    // Apenas planos da seção "default" mapeiam para o Plena,
    // pois o Plena usa um plano por mês (id = YYYY-MM, sem seção no ID).
    const sectionId = ngData.sectionId || 'default';
    if (sectionId !== 'default') return null;
    const month = ngData.month;
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
    // Remove os campos exclusivos do Nextgoals
    const { month: _m, sectionId: _s, ...rest } = ngData;
    return { collection, id: month, data: { ...rest, id: month } };
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
export async function triggerSyncToNextgoals(db, ownerEmail, operation, collection, id, data, env) {
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
      ngId = `default:${id}`;
    } else {
      ngId = id;
    }
    ngData = null;
  }

  try {
    const resp = await fetch(`${ngUrl}/api/sync/inbound`, {
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
        source_updated_at: Date.now(),
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
