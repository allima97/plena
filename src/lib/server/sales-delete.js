import { salesDeletionRecords, TYPE_REMOVALS } from '../goals/sales-deletion.js';
import { readSyncRecords, syncRecordStatements, runSyncStatements } from './sync-records.js';
const collections = ['salesSections', 'salesTypes', 'sales', 'salesPlans'];

export async function deleteSalesData(db, owner, ownerColumn, collection, id, sectionId, time = Date.now(), { expectedSalesCount } = {}) {
  const records = (await readSyncRecords(db, owner, ownerColumn, collections)).filter(record => !record.deleted);
  const effects = salesDeletionRecords(records, collection, id, sectionId, time);
  if (expectedSalesCount !== undefined && effects.filter(record => record.deleted && record.collection === 'sales').length !== expectedSalesCount)
    throw new Error('As vendas foram alteradas. Atualize a tela e confirme a exclusão novamente.');
  const statements = effects.flatMap(record => syncRecordStatements(db, owner, ownerColumn, record));
  if (db.batch) await db.batch(statements); else await runSyncStatements(db, statements);
  return effects;
}

// Retry cleanup after merging snapshots, including records known only to the peer.
export async function enforceSalesDeletions(db, owner, ownerColumn) {
  const snapshot = await readSyncRecords(db, owner, ownerColumn, [...collections, TYPE_REMOVALS]);
  let records = snapshot.filter(record => !record.deleted);
  const effects = [];
  for (const marker of snapshot.filter(record => record.deleted && ['salesSections', TYPE_REMOVALS].includes(record.collection))) {
    let collection = 'salesSections', id = marker.id, sectionId;
    if (marker.collection === TYPE_REMOVALS) {
      collection = 'salesTypes';
      try { [sectionId, id] = JSON.parse(marker.id); } catch { continue; }
    }
    const changes = salesDeletionRecords(records, collection, id, sectionId, marker.updatedAt, false);
    effects.push(...changes);
    const replaced = new Set(changes.map(record => `${record.collection}/${record.id}`));
    records = [...records.filter(record => !replaced.has(`${record.collection}/${record.id}`)), ...changes.filter(record => !record.deleted)];
  }
  await runSyncStatements(db, effects.flatMap(record => syncRecordStatements(db, owner, ownerColumn, record)));
}

export async function salesRecordDeleted(db, owner, collection, id, data) {
  if (!['salesSections', 'salesTypes', 'sales', 'salesPlans'].includes(collection)) return false;
  const sectionId = data.sectionId || 'default';
  const marker = JSON.stringify([sectionId, collection === 'salesTypes' ? id : data.type]);
  const row = await db.prepare(`SELECT id FROM sync_tombstones WHERE owner = ? AND (
    (collection = ? AND id = ?) OR (collection = 'salesSections' AND id = ?) OR
    (collection = 'salesTypeRemovals' AND id = ?)) LIMIT 1`)
    .bind(owner, collection, id, collection === 'salesSections' ? id : sectionId, marker).first();
  return !!row;
}
