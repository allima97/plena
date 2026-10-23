import { validId, validateObject } from './security.js';
// Versioned shared records. Deletions retain a timestamp so reconciliation
// cannot restore a record deleted in either application.
export function syncTimestamp(value) {
  const timestamp = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 8.64e15) throw new Error('Data da alteração inválida.');
  return timestamp;
}

export async function runSyncStatements(db, statements) {
  for (let offset = 0; offset < statements.length; offset += 50) {
    const chunk = statements.slice(offset, offset + 50);
    if (db.batch) await db.batch(chunk);
    else for (const statement of chunk) await statement.run();
  }
}

export function syncRecordStatements(db, owner, ownerColumn, record) {
  if (!['owner_email', 'user_id'].includes(ownerColumn)) throw new Error('Identidade inválida.');
  const { collection, id, data, deleted = false } = record;
  if (collection !== 'salesTypeRemovals' && !validId(id)) throw new Error('Identificador inválido.');
  if (!deleted) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Documento inválido.');
    if (data.id !== undefined && data.id !== id) throw new Error('Identificador inconsistente.');
    validateObject(data);
  }
  const time = syncTimestamp(record.updatedAt);
  const storedTime = ownerColumn === 'user_id' ? new Date(time).toISOString() : time;
  const permanentRoot = ['salesSections', 'salesTypes'].includes(collection);
  if (deleted) return [
    db.prepare(`INSERT INTO sync_tombstones(owner, collection, id, deleted_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner, collection, id) DO UPDATE SET deleted_at = excluded.deleted_at
      WHERE excluded.deleted_at > sync_tombstones.deleted_at`).bind(owner, collection, id, time),
    db.prepare(`DELETE FROM documents WHERE ${ownerColumn} = ? AND collection = ? AND id = ? ${permanentRoot ? '' : 'AND updated_at <= ?'}`)
      .bind(owner, collection, id, ...(permanentRoot ? [] : [storedTime])),
  ];
  const permanent = ['salesSections', 'salesTypes'].includes(collection);
  let guard = permanent ? '1 = 1' : 'deleted_at >= ?';
  const params = permanent ? [] : [time];
  let extra = '';
  if (['sales', 'salesTypes', 'salesPlans'].includes(collection)) {
    const sectionId = data.sectionId || 'default';
    extra += " AND NOT EXISTS (SELECT 1 FROM sync_tombstones WHERE owner = ? AND collection = 'salesSections' AND id = ?)";
    params.push(owner, sectionId);
    if (collection !== 'salesPlans') {
      extra += " AND NOT EXISTS (SELECT 1 FROM sync_tombstones WHERE owner = ? AND collection = 'salesTypeRemovals' AND id = ?)";
      params.push(owner, JSON.stringify([sectionId, collection === 'salesTypes' ? id : data.type]));
    }
  }
  return [db.prepare(`INSERT INTO documents (${ownerColumn}, collection, id, data, updated_at)
    SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
      SELECT 1 FROM sync_tombstones WHERE owner = ? AND collection = ? AND id = ? AND ${guard}
    ) ${extra} ON CONFLICT(${ownerColumn}, collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
      WHERE excluded.updated_at >= documents.updated_at`)
    .bind(owner, collection, id, JSON.stringify(data), storedTime, owner, collection, id, ...params)];
}

export async function readSyncRecords(db, owner, ownerColumn, collections) {
  if (!['owner_email', 'user_id'].includes(ownerColumn)) throw new Error('Identidade inválida.');
  const allowed = new Set(collections);
  const { results } = await db.prepare(`SELECT collection, id, data, updated_at FROM documents WHERE ${ownerColumn} = ?`).bind(owner).all();
  const records = new Map();
  for (const row of results || []) {
    if (!allowed.has(row.collection)) continue;
    try { records.set(`${row.collection}/${row.id}`, { collection: row.collection, id: row.id, data: JSON.parse(row.data), updatedAt: syncTimestamp(row.updated_at) }); }
    catch { /* A corrupt legacy document must not prevent other records syncing. */ }
  }
  const { results: deleted } = await db.prepare('SELECT collection, id, deleted_at FROM sync_tombstones WHERE owner = ?').bind(owner).all();
  for (const row of deleted || []) {
    if (!allowed.has(row.collection)) continue;
    const key = `${row.collection}/${row.id}`;
    if (['salesSections', 'salesTypes'].includes(row.collection) || !records.has(key) || records.get(key).updatedAt <= row.deleted_at)
      records.set(key, { collection: row.collection, id: row.id, deleted: true, updatedAt: row.deleted_at });
  }
  return [...records.values()];
}
