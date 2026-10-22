import { cents } from './sales.js';

const searchText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const searchNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function filterSalesRows(rows, { type = '', query = '' } = {}, types = []) {
 const names = new Map(types.map(t => [t.id, t.name]));
 const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
 return rows.filter(sale => {
  if (type && sale.type !== type) return false;
  if (!terms.length) return true;
  const amounts = [sale.total, sale.fees, (cents(sale.total) - cents(sale.fees)) / 100, sale.commission].filter(Number.isFinite);
  const text = searchText([sale.orderNumber, names.get(sale.type) || sale.type, sale.date, sale.date.split('-').reverse().join('/'), sale.rate ?? '', Number.isFinite(sale.rate) ? `${sale.rate}%` : '', ...amounts.flatMap(value => [String(value), searchNumber.format(value), `R$ ${searchNumber.format(value)}`])].join(' '));
  return terms.every(term => text.includes(term));
 });
}

// Keep page selection derived: deleting/filtering rows cannot leave an empty last page.
export function salesTablePage(rows, rawPage = 0, pageSize = 15) {
 const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
 const page = Math.max(0, Math.min(rawPage || 0, totalPages - 1));
 const start = page * pageSize;
 const end = Math.min(start + pageSize, rows.length);
 return { items: rows.slice(start, end), page, totalPages, total: rows.length, start, end };
}
