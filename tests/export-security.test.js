import test from 'node:test';
import assert from 'node:assert/strict';
import {toCSV} from '../src/lib/fin/export.js';
test('CSV neutralizes formulas, leading control characters and delimiter escapes',()=>{
 for(const attack of ['＝1+1','＋SUM(1)','－1+1','＠SUM(1)','=HYPERLINK("https://evil.test")','+SUM(1;2)','@SUM(1)','-1+1','  =1+1','\t=1+1','\r=1+1','\n=1+1']){
  const csv=toCSV([{data:'2026-10-23',descricao:attack,valor:-12.5}],[],[]);
  assert.ok(csv.includes("'"+attack.replaceAll('"','""')),'formula must be text');
  assert.ok(csv.includes(';"-12,50";'),'legitimate negative amounts stay numeric');
 }
 const csv=toCSV([{data:'2026-10-23',descricao:'Normal; "ação"\rnext',valor:1}],[],[]);
 assert.ok(csv.includes('"Normal; ""ação""\rnext"'));
});
