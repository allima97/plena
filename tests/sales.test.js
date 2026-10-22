import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, monthSummary, validateSale, validatePlan, SALE_TYPES } from '../src/lib/goals/sales.js';
const plan = emptyPlan('2026-10');
plan.target = 1000; plan.superTarget = 2000;
for (const type of SALE_TYPES) plan.rates[type] = { below: 1, target: 2, super: 3 };
const sale = { date:'2026-10-14', type:'Hotel', total:1100, fees:100 };
test('monthly thresholds use gross revenue and include exact boundaries', () => {
 assert.equal(monthSummary([{...sale,total:999.99}], '2026-10', plan).tier,'below');
 assert.equal(monthSummary([{...sale,total:1000}], '2026-10', plan).tier,'target');
 assert.equal(monthSummary([{...sale,total:2000}], '2026-10', plan).tier,'super');
 assert.equal(monthSummary([sale], '2026-10', plan).commission,20);
 assert.equal(monthSummary([sale,sale], '2026-10', plan).commission,60);
 assert.equal(monthSummary([sale,{...sale,date:'2026-11-01'}], '2026-10',plan).net,1000);
});
test('different product rates and cent rounding', () => {
 const p = structuredClone(plan); p.rates.Pacote.target = 5;
 assert.equal(monthSummary([sale,{...sale,type:'Pacote',total:200,fees:0}], '2026-10',p).commission,30);
 assert.equal(monthSummary([{...sale,total:1.50,fees:0}], '2026-10',plan).commission,0.02);
 assert.equal(monthSummary([sale], '2026-10',null).commission,null);
});
test('reject invalid dates, money, thresholds and rates', () => {
 validateSale(sale); validatePlan(plan);
 for (const patch of [{date:'2026-02-30'},{fees:1101},{total:0},{total:NaN},{type:''}]) assert.throws(() => validateSale({...sale,...patch}));
 assert.throws(() => validatePlan({...plan,superTarget:1000}));
 const p=structuredClone(plan); p.rates.Hotel.target=101; assert.throws(() => validatePlan(p));
});

test('custom types, renaming and deletion preserve historical commissions', async () => {
 const { saleTypesCatalog, validateSaleType } = await import('../src/lib/goals/sales.js');
 const custom = { id: 'custom-1', name: 'Roupas', deleted: false };
 validateSaleType(custom);
 validateSale({ ...sale, type: custom.id });
 const p = { ...plan, rates: { [custom.id]: { below: 1, target: 4, super: 6 } } };
 validatePlan(p);
 const rows = [{ ...sale, type: custom.id }];
 assert.equal(monthSummary(rows, '2026-10', p).commission, 40);
 const catalog = saleTypesCatalog([{ ...custom, name: 'Vestuário', deleted: true }], rows, [p]);
 assert.equal(catalog.find(t => t.id === custom.id).name, 'Vestuário');
 assert.equal(catalog.find(t => t.id === custom.id).deleted, true);
 assert.equal(monthSummary(rows, '2026-10', p).commission, 40);
 assert.equal(monthSummary(rows, '2026-10', plan).commission, null);
 assert.throws(() => validateSaleType({ ...custom, name: '  ' }));
});

test('commission basis is independent of gross goal achievement and persists in plans', () => {
 const gross = JSON.parse(JSON.stringify({ ...plan, commissionBase: 'gross' }));
 validatePlan(gross);
 assert.equal(monthSummary([sale], '2026-10', gross).commission, 22);
 assert.equal(monthSummary([sale], '2026-10', plan).commission, 20);
 const below = { ...sale, total: 999, fees: 200 };
 assert.equal(monthSummary([below], '2026-10', gross).tier, 'below');
 assert.equal(monthSummary([below], '2026-10', gross).commission, 9.99);
 assert.equal(monthSummary([below], '2026-10', plan).commission, 7.99);
 const legacy = { ...plan }; delete legacy.commissionBase;
 validatePlan(legacy);
 assert.equal(monthSummary([sale], '2026-10', legacy).commission, 20);
 assert.throws(() => validatePlan({ ...plan, commissionBase: 'invalid' }));
});
