import { buildSalesTemplate } from '../goals/sales-templates.js';
import { salesRecordDeleted } from './sales-delete.js';

function fail(message, status = 409) { const error = new Error(message); error.status = status; throw error; }

// Create the control and its selected types in ONE transaction. Inserts never
// replace records; retrying a lost response cannot overwrite later edits.
export async function importSalesTemplate(db, owner, ownerColumn, input) {
  if (!owner || !['owner_email', 'user_id'].includes(ownerColumn)) fail('Acesso inválido.', 401);
  let built;
  try { built = buildSalesTemplate(input); } catch (error) { fail(error.message, 400); }
  if (!db?.batch) fail('Importação indisponível. Tente novamente.', 503);
  const { section, types } = built;
  const metadata = JSON.stringify(section.template);
  const root = () => db.prepare(`SELECT data, updated_at FROM documents WHERE ${ownerColumn} = ? AND collection = 'salesSections' AND id = ?`).bind(owner, section.id).first();
  if (await salesRecordDeleted(db, owner, 'salesSections', section.id, section)) fail('Este controle foi excluído. Crie outro controle.');
  const existing = await root();
  if (existing) {
    const current = JSON.parse(existing.data);
    if (current.deleted || JSON.stringify(current.template) !== metadata) fail('Este identificador já pertence a outro controle.');
  } else {
    const active = await db.prepare(`SELECT data FROM documents WHERE ${ownerColumn} = ? AND collection = 'salesSections'`).bind(owner).all();
    if (active.results.some(row => { const data = JSON.parse(row.data); return !data.deleted && data.name?.trim().toLocaleLowerCase('pt-BR') === section.name.toLocaleLowerCase('pt-BR'); })) fail('Já existe um controle com esse nome.');
    const updatedAt = Date.now();
    const time = ownerColumn === 'user_id' ? new Date(updatedAt).toISOString() : updatedAt;
    const statements = [db.prepare(`INSERT OR IGNORE INTO documents (${ownerColumn}, collection, id, data, updated_at)
      SELECT ?, 'salesSections', ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM sync_tombstones WHERE owner = ? AND collection = 'salesSections' AND id = ?)
      AND NOT EXISTS (SELECT 1 FROM documents WHERE ${ownerColumn} = ? AND collection = 'salesSections' AND id <> ? AND COALESCE(json_extract(data, '$.deleted'), 0) = 0 AND lower(json_extract(data, '$.name')) = lower(?))`)
      .bind(owner, section.id, JSON.stringify(section), time, owner, section.id, owner, section.id, section.name)];
    for (const type of types) statements.push(db.prepare(`INSERT OR IGNORE INTO documents (${ownerColumn}, collection, id, data, updated_at)
      SELECT ?, 'salesTypes', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM documents WHERE ${ownerColumn} = ? AND collection = 'salesSections' AND id = ? AND COALESCE(json_extract(data, '$.deleted'), 0) = 0 AND json_extract(data, '$.template') = ?)
      AND NOT EXISTS (SELECT 1 FROM sync_tombstones WHERE owner = ? AND collection = 'salesSections' AND id = ?)
      AND NOT EXISTS (SELECT 1 FROM sync_tombstones WHERE owner = ? AND ((collection = 'salesTypes' AND id = ?) OR (collection = 'salesTypeRemovals' AND id = ?)))`)
      .bind(owner, type.id, JSON.stringify(type), time, owner, section.id, metadata, owner, section.id, owner, type.id, JSON.stringify([section.id, type.id])));
    await db.batch(statements);
  }
  const saved = await root();
  if (!saved) fail('Já existe um controle com esse nome ou ele foi excluído.');
  const current = JSON.parse(saved.data);
  if (current.deleted || JSON.stringify(current.template) !== metadata) fail('O controle foi alterado. Atualize a tela.');
  const rows = await db.prepare(`SELECT id, data, updated_at FROM documents WHERE ${ownerColumn} = ? AND collection = 'salesTypes' AND json_extract(data, '$.sectionId') = ?`).bind(owner, section.id).all();
  const records = [{ collection: 'salesSections', id: section.id, data: current, updatedAt: saved.updated_at }, ...rows.results.map(row => ({ collection: 'salesTypes', id: row.id, data: JSON.parse(row.data), updatedAt: row.updated_at }))];
  return { section: current, types: records.slice(1).map(record => record.data), records };
}
