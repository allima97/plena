import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSalesRows, salesTablePage } from '../src/lib/goals/sales-table.js';
import { forSection, monthSummary } from '../src/lib/goals/sales.js';

test('type and accent-insensitive search combine with dates, amounts and historical type labels', () => {
 const types = [{ id: 'a', name: 'Serviços' }, { id: 'b', name: 'Hospedagem', deleted: true }];
 const rows = [{ id: '1', type: 'a', orderNumber: 'ÁGUA-001', date: '2026-10-22', total: 1250, fees: 50 }, { id: '2', type: 'b', orderNumber: 'ÁGUA-002', date: '2026-10-21', total: 200, fees: 0 }];
 assert.equal(filterSalesRows(rows, { type: 'a', query: 'agua SERVICOS' }, types)[0].id, '1');
 assert.equal(filterSalesRows(rows, { type: 'b', query: 'servicos' }, types).length, 0);
 assert.equal(filterSalesRows(rows, { type: 'b', query: 'hospedagem' }, types)[0].id, '2');
 for (const query of ['22/10/2026', '2026-10-22', 'R$ 1.200,00']) assert.equal(filterSalesRows(rows, { query }, types)[0].id, '1');
});

test('pagination covers all matching sales once, clamps a removed last page and keeps monthly commissions', () => {
 const sales = Array.from({ length: 26 }, (_, i) => ({ id: String(i), sectionId: 's', date: '2026-10-22', type: i < 14 ? 'a' : 'b', total: 100, fees: 10 }));
 const scoped = forSection('s', { sales: [...sales, { ...sales[0], id: 'other', sectionId: 'other' }] });
 const plan = { target: 2000, superTarget: 3000, commissionBase: 'net', rates: { a: { below: 1, target: 2, super: 3 }, b: { below: 1, target: 2, super: 3 } } };
 const summary = monthSummary(scoped.sales, '2026-10', plan);
 const first = salesTablePage(summary.items, 0), second = salesTablePage(summary.items, 1);
 assert.equal(first.items.length, 15);
 assert.equal(second.items.length, 11);
 assert.equal(new Set([...first.items, ...second.items].map(s => s.id)).size, 26);
 const filtered = filterSalesRows(summary.items, { type: 'a' });
 assert.equal(salesTablePage(filtered, 1).page, 0);
 assert.equal(salesTablePage(filtered, 1).totalPages, 1);
 assert.equal(salesTablePage([], 5).items.length, 0);
 assert.equal(filtered[0].rate, 2);
 assert.equal(filtered[0].commission, 1.8);
 assert.equal(summary.commission, 46.8);
 assert.equal(summary.total, 2600);
});
