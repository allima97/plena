const cents = value => Math.round(Number(value) * 100);
const precise = value => Math.round(value * 1e8) / 1e8;

export function validateCommissionSettings(settings) {
  if (settings.productRate !== undefined && settings.productRate !== null && (!Number.isFinite(settings.productRate) || settings.productRate < 0 || settings.productRate > 100)) throw new Error('A comissão específica deve estar entre 0 e 100%.');
  if (!settings.hasTarget && settings.productRate != null) throw new Error('A comissão específica exige uma meta do produto.');
  for (const key of ['scaleStepBelow', 'scaleStepAbove']) {
    if (settings[key] === undefined || settings[key] === null) continue;
    if (!Number.isFinite(settings[key]) || settings[key] <= 0 || settings[key] > 100000) throw new Error('Cada passo escalonável deve ser um percentual maior que zero.');
    if (settings.rates.super < Math.max(settings.rates.below, settings.rates.target)) throw new Error('No escalonável, o percentual máximo deve ser igual ou maior que os demais percentuais.');
  }
}

// Before 100%: 0.80% starts at 80% attainment and grows in complete steps.
// At 100%: jump to the configured achieved-goal rate and restart the steps.
// Both phases are capped at the configured super-goal rate.
export function commissionRate(rates, settings, tier, progress) {
  const fallback = rates?.[tier];
  if (!Number.isFinite(fallback)) return null;
  const reached = progress >= 100;
  const step = reached ? settings?.scaleStepAbove : settings?.scaleStepBelow;
  if (!(step > 0)) return fallback;
  const base = reached ? rates.target : rates.below;
  const start = reached ? 100 : precise(rates.below * 100);
  const steps = Math.max(0, Math.floor(precise((progress - start) / step)));
  return Math.min(rates.super, precise(base + steps * 0.01));
}

export function summarizeSalesMonth(sales, month, plan) {
  const rows = sales.filter(sale => sale.date.slice(0, 7) === month);
  const total = rows.reduce((sum, sale) => sum + cents(sale.total), 0);
  const fees = rows.reduce((sum, sale) => sum + cents(sale.fees), 0);
  // A plan without a positive target is an in-memory placeholder used to show
  // commissions in months without saved goals: everything stays at the base tier.
  const tier = !plan ? null : !(cents(plan.target) > 0) ? 'below' : total >= cents(plan.superTarget) ? 'super' : total >= cents(plan.target) ? 'target' : 'below';
  const progress = plan?.target > 0 ? total / cents(plan.target) * 100 : 0;
  const byTypeCents = new Map();
  for (const sale of rows) byTypeCents.set(sale.type, (byTypeCents.get(sale.type) || 0) + cents(sale.total));
  const typeIds = new Set([...byTypeCents.keys(), ...Object.keys(plan?.typeTargets || {})]);
  const typeCommissions = Object.fromEntries([...typeIds].map(id => {
    const settings = Object.hasOwn(plan?.productRules || {}, id) ? plan.productRules[id] : null;
    const rates = Object.hasOwn(plan?.rates || {}, id) ? plan.rates[id] : null;
    const generalRate = tier ? commissionRate(rates, settings, tier, progress) : null;
    const target = Number(plan?.typeTargets?.[id]);
    const targetMet = target > 0 && (byTypeCents.get(id) || 0) >= cents(target);
    const configured = settings?.hasTarget && Number.isFinite(settings.productRate);
    const extraRate = configured && targetMet && generalRate !== null ? precise(Math.max(0, settings.productRate - generalRate)) : 0;
    return [id, { generalRate, extraRate, productRate: configured ? settings.productRate : null, targetMet, generalCommission: 0, productCommission: 0, commission: 0 }];
  }));
  const items = rows.map(sale => {
    const result = typeCommissions[sale.type];
    const configured = Number.isFinite(result.generalRate);
    const base = plan?.commissionBase === 'gross' ? cents(sale.total) : cents(sale.total) - cents(sale.fees);
    const rate = configured ? precise(result.generalRate + result.extraRate) : null;
    const general = configured ? Math.round(base * result.generalRate / 100) : null;
    const combined = configured ? Math.round(base * rate / 100) : null;
    // Derive the complement from rounded totals: components always add up to
    // the actual commission paid, even on individual sales worth a few cents.
    const product = configured ? combined - general : null;
    if (configured && result.commission !== null) {
      result.generalCommission += general;
      result.productCommission += product;
      result.commission += combined;
    } else result.generalCommission = result.productCommission = result.commission = null;
    return { ...sale, generalRate: result.generalRate, extraRate: result.extraRate, rate, generalCommission: general === null ? null : general / 100, productCommission: product === null ? null : product / 100, commission: combined === null ? null : combined / 100 };
  });
  for (const result of Object.values(typeCommissions)) {
    for (const field of ['generalCommission', 'productCommission', 'commission']) if (result[field] !== null) result[field] /= 100;
  }
  const sum = field => tier && items.every(sale => sale[field] !== null) ? items.reduce((sum, sale) => sum + cents(sale[field]), 0) / 100 : null;
  return { total: total / 100, fees: fees / 100, net: (total - fees) / 100, goalBase: total / 100, tier, items, byType: Object.fromEntries([...byTypeCents].map(([id, value]) => [id, value / 100])), typeCommissions, generalCommission: sum('generalCommission'), productCommission: sum('productCommission'), commission: sum('commission') };
}
