export const SALE_TYPES = ['Fretamento', 'Pacote', 'Hotel', 'Facial', 'Serviços', 'Ingressos', 'Cruzeiro', 'Disney/Universal', 'Seguro viagem'];
export const TIERS = { below: 'Meta não batida', target: 'Meta batida', super: 'Supermeta' };
export const cents = (value) => Math.round(Number(value) * 100);
export function emptyPlan(month) {
 return { id: month, target: 0, superTarget: 0, rates: Object.fromEntries(SALE_TYPES.map(t => [t, { below: 0, target: 0, super: 0 }])) };
}
export function validateSale(s) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0,10) !== s.date) throw new Error('Informe uma data válida.');
 if (!SALE_TYPES.includes(s.type)) throw new Error('Selecione um tipo válido.');
 if (!Number.isFinite(s.total) || !Number.isFinite(s.fees) || cents(s.total) <= 0 || s.fees < 0 || cents(s.fees) > cents(s.total)) throw new Error('O total deve ser positivo e as taxas devem estar entre zero e o total.');
}
export function validatePlan(p) {
 if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.id) || !Number.isFinite(p.target) || !Number.isFinite(p.superTarget) || p.target <= 0 || cents(p.superTarget) <= cents(p.target)) throw new Error('A meta deve ser positiva e a supermeta deve ser maior que a meta.');
 for (const type of SALE_TYPES) for (const tier of Object.keys(TIERS)) {
  const rate = p.rates?.[type]?.[tier];
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Preencha todos os percentuais entre 0 e 100.');
 }
}
export function monthSummary(sales, month, plan) {
 const rows = sales.filter(s => s.date.slice(0,7) === month);
 const total = rows.reduce((a,s) => a+cents(s.total),0);
 const fees = rows.reduce((a,s) => a+cents(s.fees),0);
 const net = total-fees;
 const tier = !plan ? null : net >= cents(plan.superTarget) ? 'super' : net >= cents(plan.target) ? 'target' : 'below';
 const items = rows.map(s => ({ ...s, rate: tier ? plan.rates[s.type][tier] : null, commission: tier ? Math.round((cents(s.total)-cents(s.fees))*plan.rates[s.type][tier]/100)/100 : null }));
 return { total: total/100, fees: fees/100, net: net/100, tier, items, commission: tier ? items.reduce((a,s) => a+cents(s.commission),0)/100 : null };
}
