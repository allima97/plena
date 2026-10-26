const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const toCents = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : 0;
const monthIndex = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
const monthId = index => `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const REPORT_PERIODS = [
  ['year', 'Ano inteiro'], ['h1', '1º semestre · Jan–Jun'], ['h2', '2º semestre · Jul–Dez'],
  ['q1', '1º trimestre · Jan–Mar'], ['q2', '2º trimestre · Abr–Jun'],
  ['q3', '3º trimestre · Jul–Set'], ['q4', '4º trimestre · Out–Dez']
];

// Inputs must already be scoped to the selected sales control. Goals use gross sales,
// just like the monthly dashboard; fees never change attainment.
export function buildSalesReport(sales = [], plans = [], { year = 'all', period = 'year', currentMonth } = {}) {
  if (!validMonth(currentMonth)) {
    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const records = new Map();
  const entry = month => {
    if (!records.has(month)) records.set(month, { sold: 0, count: 0, target: null });
    return records.get(month);
  };
  for (const sale of sales) {
    const month = sale.date?.slice(0, 7);
    if (sale.deleted || !validMonth(month)) continue;
    const row = entry(month);
    row.sold += toCents(sale.total); row.count += 1;
  }
  for (const plan of plans) {
    const month = validMonth(plan.month) ? plan.month : plan.id?.split(':').at(-1);
    if (plan.deleted || !validMonth(month)) continue;
    const row = entry(month);
    if (row.target === null && toCents(plan.target) > 0) row.target = toCents(plan.target);
  }
  const recorded = [...records.keys()].sort();
  const start = recorded.length ? Math.min(monthIndex(recorded[0]), monthIndex(currentMonth)) : monthIndex(currentMonth);
  const end = recorded.length ? Math.max(monthIndex(recorded.at(-1)), monthIndex(currentMonth)) : monthIndex(currentMonth);
  const allMonths = recorded.length ? Array.from({ length: end - start + 1 }, (_, i) => monthId(start + i)) : [];
  const years = [...new Set([currentMonth.slice(0, 4), ...(/^\d{4}$/.test(String(year)) ? [String(year)] : []), ...allMonths.map(month => month.slice(0, 4))])].sort().reverse();
  const bounds = { h1: [1, 6], h2: [7, 12], q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12] };
  const [first, last] = year !== 'all' && bounds[period] ? bounds[period] : [1, 12];
  const months = allMonths.filter(month => (year === 'all' || month.startsWith(`${year}-`)) && Number(month.slice(5)) >= first && Number(month.slice(5)) <= last).reverse().map(month => {
    const row = records.get(month) || { sold: 0, count: 0, target: null };
    const future = month > currentMonth;
    const percent = row.target ? row.sold / row.target * 100 : null;
    const status = future ? 'future' : row.target ? row.sold >= row.target ? 'met' : 'below' : records.has(month) ? 'no-goal' : 'empty';
    const label = { future: 'Aguardando', met: 'Meta batida', below: 'Meta não batida', 'no-goal': 'Sem meta definida', empty: 'Sem registros' }[status];
    return { month, label: `${monthNames[Number(month.slice(5)) - 1]}/${month.slice(0, 4)}`, sold: row.sold / 100, target: row.target === null ? null : row.target / 100, percent, status, statusLabel: label, count: row.count, current: month === currentMonth, future };
  });
  const eligible = months.filter(month => !month.future && month.target !== null);
  const goalCents = eligible.reduce((sum, month) => sum + toCents(month.target), 0);
  const goalSalesCents = eligible.reduce((sum, month) => sum + toCents(month.sold), 0);
  return {
    years, months,
    sold: months.filter(month => !month.future).reduce((sum, month) => sum + toCents(month.sold), 0) / 100,
    target: goalCents / 100,
    percent: goalCents > 0 ? goalSalesCents / goalCents * 100 : null,
    achieved: eligible.filter(month => month.status === 'met').length,
    evaluated: eligible.length
  };
}
