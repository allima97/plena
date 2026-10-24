import { validateCommissionSettings } from './sales-commissions.js';
// Product settings are versioned by reference month. Legacy monthly plans remain
// the fallback, so editing a product never rewrites previous months.
const TIERS = ['below', 'target', 'super'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export function validateTypeSettings(type) {
  if (type.monthlySettings === undefined) return;
  const entries = type.monthlySettings;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.keys(entries).length > 1200) throw new Error('Configuração do produto inválida.');
  for (const [month, settings] of Object.entries(entries)) {
    if (!MONTH.test(month) || !settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Mês da configuração do produto inválido.');
    if (!settings.rates || typeof settings.rates !== 'object' || Array.isArray(settings.rates) || TIERS.some(tier => !Number.isFinite(settings.rates[tier]) || settings.rates[tier] < 0 || settings.rates[tier] > 100)) throw new Error('Preencha os percentuais de comissão entre 0 e 100.');
    if (typeof settings.hasTarget !== 'boolean') throw new Error('Informe se o produto possui meta específica.');
    if (settings.hasTarget) {
      if (!Number.isFinite(settings.target) || !Number.isSafeInteger(Math.round(settings.target * 100)) || Math.round(settings.target * 100) <= 0) throw new Error('Informe uma meta específica maior que zero.');
    } else if (settings.target != null) throw new Error('Produtos sem meta específica não devem ter valor de meta.');
    validateCommissionSettings(settings);
  }
}
export function salesTypeSettings(type, month, plan) {
  const entries = type?.monthlySettings || {};
  if (Object.hasOwn(entries, month)) return { ...entries[month], configured: true };
  const id = type?.id;
  if (id && plan && (Object.hasOwn(plan.rates || {}, id) || Object.hasOwn(plan.typeTargets || {}, id))) {
    const target = Number(plan.typeTargets?.[id]);
    return { rates: { ...plan.rates?.[id] }, hasTarget: Number.isFinite(target) && target > 0, target: target > 0 ? target : null, configured: true };
  }
  const previous = Object.keys(entries).filter(key => MONTH.test(key) && key <= month).sort().at(-1);
  if (previous) return { ...entries[previous], configured: true };
  return { rates: { below: null, target: null, super: null }, hasTarget: false, target: null, configured: false };
}
export function withSalesTypeSettings(type, month, settings) {
  const extra = {};
  if (settings.productRate !== undefined) extra.productRate = settings.hasTarget ? settings.productRate : null;
  for (const key of ['scaleStepBelow', 'scaleStepAbove']) if (settings[key] !== undefined) extra[key] = settings[key] === '' ? null : settings[key];
  const next = { ...type, monthlySettings: { ...type.monthlySettings, [month]: { rates: { ...settings.rates }, hasTarget: settings.hasTarget, target: settings.hasTarget ? settings.target : null, ...extra } } };
  validateTypeSettings(next);
  return next;
}
export function salesPlanWithTypeSettings(plan, types = []) {
  if (!plan) return null;
  const month = plan.month || plan.id.split(':').at(-1);
  const rates = new Map(Object.entries(plan.rates || {}));
  const productRules = new Map();
  const targets = new Map(Object.entries(plan.typeTargets || {}));
  for (const type of types) {
    const settings = salesTypeSettings(type, month, plan);
    if (!settings.configured) continue;
    productRules.set(type.id, settings);
    if (TIERS.every(tier => Number.isFinite(settings.rates[tier]))) rates.set(type.id, { ...settings.rates });
    if (settings.hasTarget) targets.set(type.id, settings.target);
    else targets.delete(type.id);
  }
  return { ...plan, rates: Object.fromEntries(rates), typeTargets: Object.fromEntries(targets), productRules: Object.fromEntries(productRules) };
}
