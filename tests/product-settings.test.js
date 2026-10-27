import test from 'node:test';
import assert from 'node:assert/strict';
import {salesTypeSettings, withSalesTypeSettings, salesPlanWithTypeSettings, validateTypeSettings} from '../src/lib/goals/sales-type-settings.js';
import {monthSummary,emptyPlan} from '../src/lib/goals/sales.js';
const rates={below:1,target:2,super:3};
const plan=(month='2026-10',extras={})=>({id:'shop:'+month,month,sectionId:'shop',target:1000,superTarget:2000,rates:{hotel:rates},typeTargets:{hotel:500},commissionBase:'net',...extras});
const type={id:'hotel',sectionId:'shop',name:'Hotel',deleted:false};
test('existing product settings remain editable and a single configuration covers every month',()=>{
 const old=plan();const original=structuredClone(old);
 assert.deepEqual(salesTypeSettings(type,'2026-10',old),{rates,hasTarget:true,target:500,configured:true});
 const changed=withSalesTypeSettings(type,'2026-10',{rates:{below:4,target:5,super:6},hasTarget:false,target:999});
 assert.equal(changed.monthlySettings['2026-10'].target,null,'No discards the hidden stale amount');
 const current=salesPlanWithTypeSettings(old,[changed]);assert.deepEqual(current.rates.hotel,{below:4,target:5,super:6});assert.equal(Object.hasOwn(current.typeTargets,'hotel'),false);
 assert.deepEqual(old,original,'reading effective settings must not mutate stored plans');
 assert.deepEqual(salesPlanWithTypeSettings(plan('2026-09'),[changed]).rates.hotel,{below:4,target:5,super:6},'a single configuration also covers previous months');
 const future=salesPlanWithTypeSettings(plan('2026-11',{rates:{},typeTargets:{}}),[changed]);assert.equal(future.rates.hotel.below,4);
 assert.equal(salesPlanWithTypeSettings(plan('2026-11'),[changed]).rates.hotel.below,4,'per-type settings take priority over legacy plan rates');
 const explicit=withSalesTypeSettings(changed,'2026-11',{rates:{below:7,target:8,super:9},hasTarget:false,target:null});
 assert.equal(salesPlanWithTypeSettings(plan('2026-11'),[explicit]).rates.hotel.below,7,'months with their own configuration retain their values');
 assert.equal(salesPlanWithTypeSettings(plan('2026-12'),[explicit]).rates.hotel.below,7,'the most recent previous configuration carries forward');
});
test('product-specific targets are opt-in and commissions follow the three existing tiers',()=>{
 assert.equal(salesTypeSettings(undefined,'2026-10').hasTarget,false);
 let product=withSalesTypeSettings(type,'2026-10',{rates,hasTarget:true,target:400});
 product=withSalesTypeSettings(product,'2026-11',{rates:{below:2,target:4,super:6},hasTarget:false,target:null});
 const effective=salesPlanWithTypeSettings(plan('2026-11'),[product]);
 assert.equal(Object.hasOwn(effective.typeTargets,'hotel'),false);
 assert.equal(salesPlanWithTypeSettings(plan(),[product]).typeTargets.hotel,400);
 for(const [total,rate]of [[999,2],[1000,4],[2000,6]]){
  const summary=monthSummary([{id:'s',date:'2026-11-01',type:'hotel',total,fees:0}],'2026-11',effective);
  assert.equal(summary.items[0].rate,rate);assert.equal(summary.commission,Math.round(total*rate)/100);
 }
});
test('edit scope controls how changes propagate across months',()=>{
 const base=withSalesTypeSettings(type,'2026-10',{rates:{below:1,target:2,super:3},hasTarget:false,target:null});
 const next={rates:{below:9,target:9,super:9},hasTarget:false,target:null};
 const only=withSalesTypeSettings(base,'2026-08',next,'month');
 assert.equal(only.monthlySettings['2026-10'].rates.below,1,'month scope leaves other saved months untouched');
 assert.equal(salesTypeSettings(only,'2026-08').rates.below,9);
 assert.equal(salesTypeSettings(only,'2026-07').rates.below,9,'earlier months without their own entry follow the nearest one');
 assert.equal(salesTypeSettings(only,'2026-11').rates.below,1,'later months still follow their own configuration');
 const history=withSalesTypeSettings(base,'2026-09',{rates:{below:5,target:5,super:5},hasTarget:false,target:null},'month');
 const onward=withSalesTypeSettings(history,'2026-10',next,'onward');
 assert.equal(onward.monthlySettings['2026-09'].rates.below,5,'onward scope preserves previous months');
 assert.equal(onward.monthlySettings['2026-10'].rates.below,9);
 assert.equal(salesTypeSettings(onward,'2026-12').rates.below,9,'onward scope carries forward to future months');
 const all=withSalesTypeSettings(history,'2026-10',next,'all');
 assert.equal(all.monthlySettings['2026-09'].rates.below,9,'all scope rewrites previous months');
 assert.equal(all.monthlySettings['2026-10'].rates.below,9);
 assert.equal(salesTypeSettings(all,'2026-01').rates.below,9);
 assert.equal(salesTypeSettings(all,'2027-03').rates.below,9);
});
test('months without saved goals still pay commission at the base tier',()=>{
 const configured=withSalesTypeSettings(type,'2026-10',{rates:{below:1,target:2,super:3},hasTarget:false,target:null});
 const placeholder=salesPlanWithTypeSettings(emptyPlan('2026-01'),[configured]);
 const summary=monthSummary([{id:'s',date:'2026-01-15',type:'hotel',total:1000,fees:0}],'2026-01',placeholder);
 assert.equal(summary.tier,'below','a goalless placeholder never jumps to the upper tiers');
 assert.equal(summary.items[0].rate,1);
 assert.equal(summary.commission,10);
 const unconfigured=salesPlanWithTypeSettings(emptyPlan('2026-01'),[{...type}]);
 assert.equal(monthSummary([{id:'s',date:'2026-01-15',type:'hotel',total:1000,fees:0}],'2026-01',unconfigured).items[0].rate,null,'types never configured still ask for configuration');
});
test('both APIs can reject invalid rates, targets, switches and version months',()=>{ const valid={rates,hasTarget:false,target:null};validateTypeSettings({...type,monthlySettings:{'2026-10':valid}});
 for(const entry of [{...valid,rates:{...rates,below:-1}},{...valid,rates:{...rates,super:101}},{...valid,rates:{below:1}},{...valid,hasTarget:'no'},{...valid,hasTarget:true,target:0},{...valid,hasTarget:true,target:Infinity},{...valid,target:123}])assert.throws(()=>validateTypeSettings({...type,monthlySettings:{'2026-10':entry}}));
 assert.throws(()=>validateTypeSettings({...type,monthlySettings:{'2026-13':valid}}));
 validateTypeSettings(type);
});
