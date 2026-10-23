export const TYPE_REMOVALS = 'salesTypeRemovals';
export const typeRemovalId = (sectionId, typeId) => JSON.stringify([sectionId || 'default', typeId]);
const belongs = (data, sectionId) => (data.sectionId || 'default') === sectionId;
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const stable = value => JSON.stringify(sorted(value));
const planContent = data => { const { id, month, sectionId, ...rest } = data; return stable(rest); };

// Computes the complete deletion before any database/browser state is changed.
export function salesDeletionRecords(records, collection, id, sectionId, now = Date.now(), mark = true) {
  if (!['salesSections', 'salesTypes'].includes(collection)) throw new Error('Exclusão inválida.');
  const root = records.find(record => record.collection === collection && record.id === id);
  const scope = collection === 'salesSections' ? id : sectionId || root?.data.sectionId || 'default';
  const effects = new Map();
  const remove = record => effects.set(`${record.collection}/${record.id}`, {
    collection: record.collection, id: record.id, deleted: true, updatedAt: Math.max(now, record.updatedAt || 0),
  });
  if (mark) {
    if (collection === 'salesSections' || !root || belongs(root.data, scope)) remove({ collection, id });
    if (collection === 'salesTypes') remove({ collection: TYPE_REMOVALS, id: typeRemovalId(scope, id) });
  }
  const scopedPlans = records.filter(record => record.collection === 'salesPlans' && belongs(record.data, scope));
  for (const record of records) {
    if (!['salesSections', 'salesTypes', 'sales', 'salesPlans'].includes(record.collection)) continue;
    const { data } = record;
    const legacyPlan = record.collection === 'salesPlans' && !data.sectionId && !record.id.includes(':') && scopedPlans.some(plan =>
        plan.id.endsWith(`:${record.id}`) && planContent(plan.data) === planContent(data));
    if (collection === 'salesSections') {
      if ((record.collection === 'salesSections' && record.id === id) || (record.collection !== 'salesSections' && (belongs(data, scope) || legacyPlan))) remove(record);
    } else if (belongs(data, scope) || legacyPlan) {
      if ((record.collection === 'salesTypes' && record.id === id) || (record.collection === 'sales' && data.type === id)) remove(record);
      if (record.collection === 'salesPlans' && (Object.hasOwn(data.rates || {}, id) || Object.hasOwn(data.typeTargets || {}, id))) {
        const rates = { ...data.rates }, typeTargets = { ...data.typeTargets };
        delete rates[id]; delete typeTargets[id];
        effects.set(`salesPlans/${record.id}`, { ...record, data: { ...data, rates, typeTargets }, updatedAt: Math.max(Date.now(), now, (record.updatedAt || 0) + 1) });
      }
    }
  }
  return [...effects.values()];
}

export function stateSalesRecords(state) {
  return ['salesSections', 'salesTypes', 'sales', 'salesPlans'].flatMap(collection =>
    (state[collection] || []).map(data => ({ collection, id: data.id, data, updatedAt: 0 })));
}

export function applySalesDeletion(state, effects) {
  for (const record of effects) {
    if (!Array.isArray(state[record.collection])) continue;
    const rest = state[record.collection].filter(item => item.id !== record.id);
    state[record.collection] = record.deleted ? rest : [...rest, record.data];
  }
}

export function legacyPlanSection(records, record, fallback) {
  if (record.collection !== 'salesPlans') return fallback;
  return records.find(other => other !== record && other.collection === 'salesPlans' && other.data?.sectionId && other.id.endsWith(`:${record.id}`) && planContent(other.data) === planContent(record.data))?.data.sectionId || fallback;
}
