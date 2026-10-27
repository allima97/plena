import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSalesReport } from '../src/lib/goals/sales-reports.js';
const now = '2026-10';
const sale = (month, total, extra = {}) => ({ date: `${month}-10`, total, fees: total / 2, ...extra });
const plan = (month, target, extra = {}) => ({ id: `shop:${month}`, month, target, ...extra });
const options = extra => ({ currentMonth: now, year: '2026', ...extra });

test('historical goals use gross sales, cent totals and each month own target; percentages can exceed 100', () => {
 const sales = [sale('2026-10', 100), sale('2026-10', 10), sale('2026-09', 800), sale('2026-08', .1), sale('2026-08', .2)];
 const plans = [plan('2026-10', 100), plan('2026-09', 1000), plan('2026-08', .3)];
 const report = buildSalesReport(sales, plans, options());
 assert.ok(Math.abs(report.months[0].percent - 110) < 1e-9);
 assert.equal(report.months[0].status, 'met');
 assert.equal(report.months[1].percent, 80);
 assert.equal(report.months[1].status, 'below');
 assert.equal(report.months[2].sold, .3);
 assert.equal(report.months[2].percent, 100);
 assert.equal(report.achieved, 2);
 assert.equal(report.evaluated, 3);
 assert.ok(Math.abs(report.percent - 910.3 / 1100.3 * 100) < 1e-10, 'period attainment is weighted by monetary targets, never the average of monthly percentages');
});

test('quarter and semester filters stay within the selected year and include months with any record', () => {
 const months = ['2025-12','2026-01','2026-03','2026-04','2026-06','2026-07','2026-09','2026-10'];
 const sales = months.map(month => sale(month, 100));
 const plans = months.map(month => plan(month, 100));
 const q3 = buildSalesReport(sales, plans, options({ period:'q3' }));
 assert.deepEqual(q3.months.map(row => row.month), ['2026-09','2026-07'],'August has neither sales nor goal, so it stays out');
 assert.equal(q3.sold, 200); assert.equal(q3.percent, 100);
 assert.equal(buildSalesReport(sales, plans, options({period:'h1'})).sold, 400);
 assert.equal(buildSalesReport(sales, plans, options({period:'h2'})).sold, 300);
 assert.equal(buildSalesReport(sales, plans, options({year:'2025'})).sold, 100);
 assert.equal(buildSalesReport(sales, plans, options({year:'all',period:'q1'})).sold, 800, 'all history is not restricted by a previously selected quarter');
});

test('months with no target are explicit and do not distort attainment; future goals remain pending', () => {
 const report = buildSalesReport([sale('2026-09', 100),sale('2026-10',900),sale('2026-11',1000)], [plan('2026-09',100),plan('2026-11',1000)], options());
 assert.equal(report.sold,1000); assert.equal(report.percent,100); assert.equal(report.evaluated,1);
 const october = report.months.find(row=>row.month==='2026-10');
 assert.equal(october.percent,null); assert.equal(october.status,'no-goal'); assert.equal(october.current,true);
 assert.equal(report.months[0].status,'future');
});

test('zero sales against an existing goal is 0%, while no records never fabricate a failed goal', () => {
 const report=buildSalesReport([], [plan('2026-08',100)],options());
 assert.equal(report.months.find(row=>row.month==='2026-08').status,'below');
 assert.equal(report.months.find(row=>row.month==='2026-08').percent,0);
 assert.equal(report.months.some(row=>row.month==='2026-09'),false,'September has neither sales nor goal, so it stays out');
 assert.equal(report.achieved,0); assert.equal(report.evaluated,1);
 assert.deepEqual(buildSalesReport([],[],options()).months,[]);
});

test('a month picked explicitly is shown even when empty, and the summary follows the selection', () => {
 const sales=[sale('2026-01',100),sale('2026-03',300)];
 const plans=[plan('2026-01',100),plan('2026-03',100)];
 const full=buildSalesReport(sales,plans,options());
 assert.deepEqual(full.months.map(row=>row.month),['2026-03','2026-01'],'empty February stays out');
 const picked=buildSalesReport(sales,plans,options({month:'2026-03'}));
 assert.deepEqual(picked.months.map(row=>row.month),['2026-03']);
 assert.equal(picked.sold,300); assert.equal(picked.percent,300); assert.equal(picked.evaluated,1);
 const empty=buildSalesReport(sales,plans,options({month:'2026-02'}));
 assert.deepEqual(empty.months.map(row=>row.month),['2026-02'],'explicit pick shows the month even without records');
 assert.equal(empty.months[0].status,'empty');
 assert.equal(empty.sold,0); assert.equal(empty.percent,null); assert.equal(empty.evaluated,0);
});

test('legacy plan ids, deleted records and corrections preserve accurate historical statuses', () => {
 const plans=[{id:'2026-09',target:100},plan('2026-10',100,{deleted:true})];
 const sales=[sale('2026-09',99.99),sale('2026-09',500,{deleted:true})];
 const before=structuredClone({sales,plans});
 const first=buildSalesReport(sales,plans,options());assert.equal(first.months.find(row=>row.month==='2026-09').status,'below');
 assert.deepEqual({sales,plans},before,'report rendering is read-only');
 sales[0].total=100;assert.equal(buildSalesReport(sales,plans,options()).months.find(row=>row.month==='2026-09').status,'met');
 sales[0].total=90;assert.equal(buildSalesReport(sales,plans,options()).months.find(row=>row.month==='2026-09').status,'below');
});
