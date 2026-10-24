import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {TOURISM_TEMPLATE,buildSalesTemplate,templateSuggestedProductRate} from '../src/lib/goals/sales-templates.js';
import {importSalesTemplate} from '../src/lib/server/sales-templates.js';
import {validateSaleType} from '../src/lib/goals/sales.js';
const request=(sectionId='fresh',extra={})=>({sectionId,name:'Turismo',month:'2026-10',templateId:'tourism',version:1,types:TOURISM_TEMPLATE.types.map(type=>type.key),...extra});
const database=column=>{
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE documents(${column} TEXT,collection TEXT,id TEXT,data TEXT,updated_at ${column==='user_id'?'TEXT':'INTEGER'},PRIMARY KEY(${column},collection,id));CREATE TABLE sync_tombstones(owner TEXT,collection TEXT,id TEXT,deleted_at INTEGER,PRIMARY KEY(owner,collection,id));`);
 const db={prepare(query){const statement=sql.prepare(query);let args=[];return{bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return statement.run(...args);}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return {db,sql};
};

test('tourism catalog is a standalone immutable suggestion, not an account snapshot',()=>{
 assert.equal(TOURISM_TEMPLATE.types.length,13);
 assert.throws(()=>TOURISM_TEMPLATE.types[0].rates.below=99);
 const built=buildSalesTemplate(request());
 assert.equal(built.types.length,13);
 for(const entry of built.types){
  validateSaleType(entry);assert.ok(entry.id.startsWith('fresh:tourism:'));assert.equal(entry.sectionId,'fresh');
  assert.deepEqual(Object.keys(entry.monthlySettings),['2026-10']);
  const settings=entry.monthlySettings['2026-10'];assert.equal(settings.hasTarget,false);assert.equal(settings.target,null);assert.equal(settings.productRate,null);
 }
 const insurance=built.types.find(t=>t.template.key==='insurance');assert.equal(templateSuggestedProductRate(insurance),10);
 const basic=built.types.find(t=>t.template.key==='charter').monthlySettings['2026-10'];
 assert.deepEqual(basic.rates,{below:.8,target:1.15,super:1.35});assert.equal(basic.scaleStepBelow,1);assert.equal(basic.scaleStepAbove,1);
 const reduced=built.types.find(t=>t.template.key==='hotel-low').monthlySettings['2026-10'];assert.deepEqual(reduced.rates,{below:.7,target:1,super:1});assert.equal(reduced.scaleStepAbove,null);
 assert.deepEqual(built.types.find(t=>t.template.key==='airfare').monthlySettings['2026-10'].rates,{below:.7,target:.7,super:.7});
 assert.equal(built.sales,undefined);assert.equal(built.salesPlans,undefined);assert.equal(built.goals,undefined);
 assert.doesNotMatch(JSON.stringify(TOURISM_TEMPLATE),/@|owner|sectionId|monthlySettings|3400|340000/);
 built.types[0].monthlySettings['2026-10'].rates.below=99;
 assert.equal(buildSalesTemplate(request('second')).types[0].monthlySettings['2026-10'].rates.below,.8);
 assert.equal(TOURISM_TEMPLATE.types[0].rates.below,.8);
});

test('template import is explicit, validates selections and accepts no owner, private targets or arbitrary rules',()=>{
 assert.equal(buildSalesTemplate(request('own',{types:['insurance','services']})).types.length,2);
 for(const patch of [{templateId:''},{templateId:'unknown'},{version:2},{types:[]},{types:['insurance','insurance']},{types:['unknown']},{types:'insurance'},{name:''},{sectionId:'other/account'},{month:'2026-13'},{month:['2026-10']},{owner:'somebody@example.test'},{target:3400},{rates:{below:99}}])assert.throws(()=>buildSalesTemplate({...request(),...patch}),JSON.stringify(patch));
});

for(const column of ['owner_email','user_id']){
 test(`atomic import isolates accounts and retains later edits on retry (${column})`,async()=>{
  const {db,sql}=database(column);
  try{
   const first=await importSalesTemplate(db,'alice',column,request());assert.equal(first.types.length,13);
   const original=sql.prepare(`SELECT * FROM documents WHERE ${column}='alice' ORDER BY collection,id`).all();
   const second=await importSalesTemplate(db,'bob',column,request());assert.equal(second.types.length,13);
   const changed={...first.types[0],name:'Meu produto'};
   sql.prepare(`UPDATE documents SET data=? WHERE ${column}='alice' AND collection='salesTypes' AND id=?`).run(JSON.stringify(changed),changed.id);
   const retry=await importSalesTemplate(db,'alice',column,request());assert.equal(retry.types.find(t=>t.id===changed.id).name,'Meu produto');
   assert.equal(sql.prepare(`SELECT count(*) n FROM documents WHERE ${column}='alice'`).get().n,14);
   assert.deepEqual(sql.prepare(`SELECT * FROM documents WHERE ${column}='bob' ORDER BY collection,id`).all().map(row=>({...row,[column]:'alice',updated_at:0})),original.map(row=>({...row,updated_at:0})));
   await assert.rejects(importSalesTemplate(db,'alice',column,request('duplicate')),error=>error.status===409);
   assert.equal(sql.prepare(`SELECT count(*) n FROM documents WHERE ${column}='alice'`).get().n,14);
   const target=first.types.find(t=>t.template.key==='insurance');
   sql.prepare(`DELETE FROM documents WHERE ${column}='alice' AND id=?`).run(target.id);
   sql.prepare(`INSERT INTO sync_tombstones VALUES(?,?,?,?)`).run('alice','salesTypes',target.id,Date.now());
   const afterDelete=await importSalesTemplate(db,'alice',column,request());assert.equal(afterDelete.types.some(t=>t.id===target.id),false,'retry never restores deleted products');
  }finally{sql.close();}
 });
 test(`failed transaction and removed controls never leave partial or revived imports (${column})`,async()=>{
  const {db,sql}=database(column);
  try{
   sql.exec(`CREATE TRIGGER fail_template BEFORE INSERT ON documents WHEN NEW.collection='salesTypes' BEGIN SELECT RAISE(ABORT,'simulated write failure'); END;`);
   await assert.rejects(importSalesTemplate(db,'alice',column,request()));
   assert.equal(sql.prepare('SELECT count(*) n FROM documents').get().n,0);
   sql.exec('DROP TRIGGER fail_template');
   sql.prepare('INSERT INTO sync_tombstones VALUES(?,?,?,?)').run('alice','salesSections','fresh',Date.now());
   await assert.rejects(importSalesTemplate(db,'alice',column,request()),error=>error.status===409);
   assert.equal(sql.prepare('SELECT count(*) n FROM documents').get().n,0);
  }finally{sql.close();}
 });
}
