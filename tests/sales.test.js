import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlan, monthSummary, validateSale, validatePlan, SALE_TYPES } from '../src/lib/goals/sales.js';
const plan = emptyPlan('2026-10');
plan.target = 1000; plan.superTarget = 2000;
for (const type of SALE_TYPES) plan.rates[type] = { below: 1, target: 2, super: 3 };
const sale = { date:'2026-10-14', type:'Hotel', total:1100, fees:100 };
test('monthly thresholds use net revenue and include exact boundaries', () => {
 assert.equal(monthSummary([{...sale,total:1099.99}], '2026-10', plan).tier,'below');
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
 for (const patch of [{date:'2026-02-30'},{fees:1101},{total:0},{total:NaN},{type:'Outro'}]) assert.throws(() => validateSale({...sale,...patch}));
 assert.throws(() => validatePlan({...plan,superTarget:1000}));
 const p=structuredClone(plan); p.rates.Hotel.target=101; assert.throws(() => validatePlan(p));
});
