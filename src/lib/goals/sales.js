export const SALE_TYPES = ['Fretamento', 'Pacote', 'Hotel', 'Facial', 'Serviços', 'Ingressos', 'Cruzeiro', 'Disney/Universal', 'Seguro viagem'];
export const TIERS = { below: 'Meta não batida', target: 'Meta batida', super: 'Supermeta' };
export const cents = (value) => Math.round(Number(value) * 100);
export function emptyPlan(month, types = SALE_TYPES) {
 return { id: month, target: 0, superTarget: 0, commissionBase: 'net', typeTargets: {}, rates: Object.fromEntries(types.map(t => [t, { below: 0, target: 0, super: 0 }])) };
}
export function validateSale(s) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0,10) !== s.date) throw new Error('Informe uma data válida.');
 if (typeof s.type !== 'string' || !s.type.trim() || s.type.length > 120) throw new Error('Selecione um tipo válido.');
 if (!Number.isFinite(s.total) || !Number.isFinite(s.fees) || cents(s.total) <= 0 || s.fees < 0 || cents(s.fees) > cents(s.total)) throw new Error('O total deve ser positivo e as taxas devem estar entre zero e o total.');
 if (s.orderNumber !== undefined && s.orderNumber !== null && (typeof s.orderNumber !== 'string' || s.orderNumber.length > 80)) throw new Error('Número do pedido inválido (máx. 80 caracteres).');
}
export function validatePlan(p) {
 if (p.commissionBase !== undefined && !['net', 'gross'].includes(p.commissionBase)) throw new Error('Selecione a base da comissão: com taxas ou sem taxas.');
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.id) || !Number.isFinite(p.target) || !Number.isFinite(p.superTarget) || p.target <= 0 || cents(p.superTarget) <= cents(p.target)) throw new Error('A meta deve ser positiva e a supermeta deve ser maior que a meta.');
 if (!p.rates || typeof p.rates !== 'object' || Array.isArray(p.rates)) throw new Error('Configuração de comissões inválida.');
 for (const type of Object.keys(p.rates)) for (const tier of Object.keys(TIERS)) {
  const rate = p.rates?.[type]?.[tier];
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Preencha todos os percentuais entre 0 e 100.');
 }
 if (p.typeTargets !== undefined) {
  if (typeof p.typeTargets !== 'object' || Array.isArray(p.typeTargets)) throw new Error('Metas por tipo inválidas.');
  for (const v of Object.values(p.typeTargets)) {
   if (v !== null && v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0)) throw new Error('Meta por tipo deve ser um valor positivo.');
  }
 }
}
export function monthSummary(sales, month, plan) {
 const rows = sales.filter(s => s.date.slice(0,7) === month);
 const total = rows.reduce((a,s) => a+cents(s.total),0);
 const fees = rows.reduce((a,s) => a+cents(s.fees),0);
 const net = total-fees;
 const tier = !plan ? null : net >= cents(plan.superTarget) ? 'super' : net >= cents(plan.target) ? 'target' : 'below';
 const items = rows.map(s => {
  const rate = tier && Object.hasOwn(plan.rates, s.type) ? plan.rates[s.type]?.[tier] : null;
  const configured = Number.isFinite(rate);
  const base = plan?.commissionBase === 'gross' ? cents(s.total) : cents(s.total)-cents(s.fees);
  return { ...s, rate: configured ? rate : null, commission: configured ? Math.round(base*rate/100)/100 : null };
 });
 // Per-type net totals for type-level KPIs
 const byType = {};
 for (const s of rows) {
  const typeNet = cents(s.total) - cents(s.fees);
  byType[s.type] = (byType[s.type] || 0) + typeNet;
 }
 return { total: total/100, fees: fees/100, net: net/100, tier, items, byType: Object.fromEntries(Object.entries(byType).map(([k,v]) => [k, v/100])), commission: tier && items.every(s => s.commission !== null) ? items.reduce((a,s) => a+cents(s.commission),0)/100 : null };
}

/**
 * Calculates how much needs to be sold per remaining day (including today) to hit the monthly goal.
 * @param {number} goal - monthly target (net, R$)
 * @param {number} soldNet - net already sold this month (R$)
 * @param {string} month - 'YYYY-MM'
 * @returns {{ remaining: number, daysLeft: number, dailyNeeded: number, onTrack: boolean }}
 */
export function dailyPaceKPI(goal, soldNet, month) {
 const now = new Date();
 const [y, m] = month.split('-').map(Number);
 const daysInMonth = new Date(y, m, 0).getDate();
 const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
 const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
 const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1); // include today
 const remaining = Math.max(0, goal - soldNet);
 const dailyNeeded = remaining / daysLeft;
 // On track = pace so far covers the goal: (soldNet / dayOfMonth) * daysInMonth >= goal
 const pace = dayOfMonth > 0 ? (soldNet / dayOfMonth) * daysInMonth : 0;
 return { remaining, daysLeft, dailyNeeded, onTrack: pace >= goal, isCurrentMonth };
}

// Legacy names remain stable keys; renaming only changes the display label.
export function saleTypesCatalog(overrides = [], sales = [], plans = []) {
 const ids = new Set([...SALE_TYPES, ...sales.map(s => s.type), ...plans.flatMap(p => Object.keys(p.rates || {}))]);
 const catalog = new Map([...ids].map(id => [id, { id, name: id, deleted: false }]));
 for (const type of overrides) catalog.set(type.id, type);
 return [...catalog.values()];
}
export function validateSaleType(type) {
 if (!type || typeof type.id !== 'string' || !type.id.trim() || type.id.length > 120 || typeof type.name !== 'string' || !type.name.trim() || type.name.trim().length > 80 || typeof type.deleted !== 'boolean') throw new Error('Informe um nome de tipo com até 80 caracteres.');
}
