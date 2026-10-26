import { withSalesTypeSettings } from './sales-type-settings.js';

const standard = { below: 0.8, target: 1.15, super: 1.35 };
const reduced = { below: 0.7, target: 1, super: 1 };
const type = (key, name, rates = standard, scalable = true, suggestedProductRate = null) => ({ key, name, rates: { ...rates }, scaleStepBelow: scalable ? 1 : null, scaleStepAbove: scalable ? 1 : null, suggestedProductRate });
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// A standalone, versioned catalog of generic rules. Never read another account
// when a customer imports a template, and never include that account's IDs,
// sales, dates, targets, balances or settings history in this catalog.
export const TOURISM_TEMPLATE = freeze({
  id: 'tourism', version: 1, name: 'Turismo',
  types: [
    type('car-rental', 'Aluguel de Carro'),
    type('charter', 'Fretamento'),
    type('hotel-high', 'Hotel (+ de 10%)'),
    type('hotel-low', 'Hotel (- de 10%)', reduced, false),
    type('airfare', 'Facial', { below: 0.7, target: 0.7, super: 0.7 }, false),
    type('services', 'Serviços'),
    type('tickets', 'Ingressos'),
    type('cruise', 'Cruzeiro'),
    type('theme-parks', 'Disney/Universal', reduced, false),
    type('insurance', 'Seguro viagem', standard, true, 10),
    type('circuit', 'Circuito'),
    type('flight-hotel-high', 'A + H (+ de 10%)'),
    type('flight-hotel-low', 'A + H (- de 10%)', reduced, false),
    type('vbi-vhi', 'VBI/VHIPlus', reduced, false)
  ]
});

export function templateSuggestedProductRate(type) {
  if (type?.template?.id !== TOURISM_TEMPLATE.id || type.template.version !== TOURISM_TEMPLATE.version) return null;
  return TOURISM_TEMPLATE.types.find(entry => entry.key === type.template.key)?.suggestedProductRate ?? null;
}

export function buildSalesTemplate(input) {
  const allowed = ['sectionId', 'name', 'month', 'templateId', 'version', 'types'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Pedido de modelo inválido.');
  const { sectionId, name, month, templateId, version, types } = input;
  if (templateId !== TOURISM_TEMPLATE.id || version !== TOURISM_TEMPLATE.version) throw new Error('Selecione um modelo disponível.');
  if (typeof sectionId !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(sectionId)) throw new Error('Identificador do novo controle inválido.');
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw new Error('Informe um nome com até 80 caracteres.');
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês do modelo inválido.');
  const available = new Set(TOURISM_TEMPLATE.types.map(type => type.key));
  if (!Array.isArray(types) || !types.length || types.length > available.size || new Set(types).size !== types.length || types.some(key => !available.has(key))) throw new Error('Selecione ao menos um tipo do modelo, sem repetições.');
  const selected = TOURISM_TEMPLATE.types.filter(type => types.includes(type.key));
  const section = { id: sectionId, name: name.trim(), deleted: false, template: { id: templateId, version, month, types: selected.map(type => type.key) } };
  const documents = selected.map(entry => withSalesTypeSettings({
    id: `${sectionId}:tourism:${entry.key}`, sectionId, name: entry.name, deleted: false,
    template: { id: templateId, version, key: entry.key }
  }, month, { rates: { ...entry.rates }, scaleStepBelow: entry.scaleStepBelow, scaleStepAbove: entry.scaleStepAbove, hasTarget: false, target: null, productRate: null }));
  return { section, types: documents };
}
