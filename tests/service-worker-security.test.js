import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import{readFile}from'node:fs/promises';
test('PWA never serves navigation, private APIs or login from the asset cache',async()=>{
 let source=await readFile(new URL('../src/service-worker.js',import.meta.url),'utf8');
 source=source.replace(/^import[^;]+;$/gm,'');
 const handlers={};vm.runInNewContext(source,{URL,Response,immutable:[],assets:[{path:'/privacidade.html'}],prerendered:[],version:'test',self:{location:{origin:'https://plena.test'},addEventListener:(type,fn)=>handlers[type]=fn}});
 for(const [url,mode]of [['/privacidade.html','navigate'],['/login','navigate'],['/api/plena/state','cors']]){
  let intercepted=false;handlers.fetch({request:{url:'https://plena.test'+url,method:'GET',mode},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
 }
});
