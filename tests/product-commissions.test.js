import test from 'node:test';
import assert from 'node:assert/strict';
import { monthSummary } from '../src/lib/goals/sales.js';
import { withSalesTypeSettings, salesPlanWithTypeSettings, validateTypeSettings } from '../src/lib/goals/sales-type-settings.js';
import { commissionRate } from '../src/lib/goals/sales-commissions.js';
const month = '2026-10';
const rates = {below:0.8,target:1.15,super:1.35};
const raw = {id:'shop:'+month,month,sectionId:'shop',target:1000,superTarget:1200,commissionBase:'gross',rates:{insurance:rates,other:{below:0,target:0,super:0}},typeTargets:{insurance:100}};
const product = (settings={}) => withSalesTypeSettings({id:'insurance',sectionId:'shop',name:'Seguro',deleted:false},month,{rates,hasTarget:true,target:100,productRate:10,scaleStepBelow:null,scaleStepAbove:null,...settings});
const sale = (total=100, extra={}) => ({id:'s',sectionId:'shop',date:month+'-01',type:'insurance',total,fees:0,...extra});
const summary = (rows,settings={},plan={}) => monthSummary(rows,month,salesPlanWithTypeSettings({...raw,...plan},[product(settings)]));

test('product commission is unlocked at its target and split from the general monthly commission',()=>{
 for (const [other,tier,general,complement] of [[0,'below',0.8,9.2],[900,'target',1.15,8.85],[1100,'super',1.35,8.65]]) {
  const result=summary([sale(),...(other?[sale(other,{id:'other',type:'other'})]:[])]);
  assert.equal(result.tier,tier);assert.equal(result.generalCommission,general);
  assert.equal(result.productCommission,complement);assert.equal(result.commission,10);
  assert.equal(result.typeCommissions.insurance.extraRate,complement);
  assert.equal(result.items[0].commission,10);assert.equal(result.items[0].generalCommission,general);
 }
 const below=summary([sale(99.99)]);
 assert.equal(below.typeCommissions.insurance.targetMet,false);assert.equal(below.productCommission,0);
 assert.equal(below.items[0].rate,.8);
 const exact=summary([sale(100)]);assert.equal(exact.typeCommissions.insurance.targetMet,true);
});

test('crossing a product target recalculates all product sales without duplicate commission or cent drift',()=>{
 const before=summary([sale(50)]);assert.equal(before.productCommission,0);
 const result=summary([sale(50),sale(50,{id:'s2'})]);
 assert.equal(result.generalCommission,.8);assert.equal(result.productCommission,9.2);assert.equal(result.commission,10);
 assert.ok(result.items.every(row=>row.rate===10));
 const tiny=summary([sale(.05)],{target:.01});
 assert.equal(tiny.items[0].commission,.01);
 assert.equal(tiny.items[0].commission,tiny.items[0].generalCommission+tiny.items[0].productCommission);
 const net=summary([sale(100,{fees:10})],{},{commissionBase:'net'});
 assert.equal(net.generalCommission,.72);assert.equal(net.productCommission,8.28);assert.equal(net.commission,9);
 assert.equal(net.typeCommissions.insurance.targetMet,true,'product goal always uses gross sales');
 const smaller=summary([sale()],{productRate:.5});assert.equal(smaller.productCommission,0);assert.equal(smaller.commission,.8);
 const noTarget=summary([sale()],{hasTarget:false,target:null,productRate:null});assert.equal(noTarget.commission,.8);
});

test('scalable commission grows from 0.80 at 80 percent of goal to the configured maximum',()=>{
 const config={scaleStepBelow:1,scaleStepAbove:1};
 for(const [progress,tier,expected]of [[0,'below',.8],[79.99,'below',.8],[80,'below',.8],[80.99,'below',.8],[81,'below',.81],[82,'below',.82],[99,'below',.99],[100,'target',1.15],[101,'target',1.16],[102,'target',1.17],[115,'target',1.30],[119,'target',1.34],[120,'super',1.35],[134.99,'super',1.35],[135,'super',1.35],[200,'super',1.35]])assert.equal(commissionRate(rates,config,tier,progress),expected,String(progress));
 assert.equal(commissionRate(rates,{scaleStepBelow:2,scaleStepAbove:2},'below',81),.8);
 assert.equal(commissionRate(rates,{scaleStepBelow:2,scaleStepAbove:2},'below',82),.81);
 assert.equal(commissionRate(rates,{scaleStepBelow:.5,scaleStepAbove:.5},'below',80.5),.81);
 assert.equal(commissionRate(rates,{scaleStepBelow:2,scaleStepAbove:1},'target',101),1.16);
 assert.equal(commissionRate(rates,{scaleStepBelow:1,scaleStepAbove:2},'target',101),1.15);
 assert.equal(commissionRate(rates,{scaleStepBelow:1,scaleStepAbove:2},'target',102),1.16);
 assert.equal(commissionRate(rates,{scaleStepBelow:null,scaleStepAbove:1},'below',90),.8);
 assert.equal(commissionRate(rates,{scaleStepBelow:1,scaleStepAbove:null},'super',120),1.35);
 assert.equal(commissionRate(rates,{scaleStepBelow:null,scaleStepAbove:null},'target',100),1.15,'empty scale retains fixed tiers');
 const result=summary([sale(),sale(950,{id:'other',type:'other'})],config);
 assert.equal(result.items[0].generalRate,1.20);assert.equal(result.items[0].extraRate,8.80);
 assert.equal(result.commission,10);
});

test('product settings validate at API boundaries and preserve historical months',()=>{
 const valid=product();const original=structuredClone(raw);
 const next=withSalesTypeSettings(valid,'2026-11',{rates,hasTarget:false,target:999,productRate:10,scaleStepBelow:null,scaleStepAbove:null});
 assert.equal(next.monthlySettings['2026-11'].target,null);assert.equal(next.monthlySettings['2026-11'].productRate,null);
 assert.equal(salesPlanWithTypeSettings(raw,[next]).productRules.insurance.productRate,10);
 assert.deepEqual(raw,original);
 const legacy=monthSummary([sale()],month,raw);assert.equal(legacy.commission,.8);
 for(const patch of [{productRate:-1},{productRate:101},{productRate:'10'},{scaleStepBelow:0},{scaleStepAbove:-1},{scaleStepBelow:'1'},{scaleStepAbove:Infinity},{scaleStepBelow:100001},{scaleStepBelow:1,scaleStepAbove:1,rates:{below:2,target:1.15,super:1.35}}]){
  assert.throws(()=>validateTypeSettings({...valid,monthlySettings:{[month]:{...valid.monthlySettings[month],...patch}}}),JSON.stringify(patch));
 }
 validateTypeSettings({id:'legacy'});
});
