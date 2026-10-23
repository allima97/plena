import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, validId, securityHeaders } from '../src/lib/server/security.js';
test('bounded JSON rejects oversized bytes, malformed roots and prototype keys', async()=>{
  const request = value=>new Request('https://app.test/api/test',{method:'POST',body:value});
  assert.deepEqual(await readJson(request('{"name":"ação"}')), {name:'ação'});
  for(const value of ['[]','null','42','{bad','{"__proto__":{"admin":true}}','{"nested":{"constructor":{}}}']) await assert.rejects(readJson(request(value)), e=>e.status===400);
  await assert.rejects(readJson(request('{"text":"'+ 'é'.repeat(200)+'"}'),300), e=>e.status===413);
  await assert.rejects(readJson(new Request('https://app.test',{method:'POST',headers:{'content-length':'10000'},body:'{}'}),300),e=>e.status===413);
  for(const id of ['x" onfocus="evil','<img>','a\\b','\u0000','']) assert.equal(validId(id),false);
  for(const id of ['tourism:2026-10','Hotel (- de 10%)','safe-id']) assert.equal(validId(id),true);
});
test('security headers prevent framing, sniffing and private API caching',()=>{
  const response=securityHeaders(Response.json({ok:true}),true);
  assert.equal(response.headers.get('X-Frame-Options'),'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  assert.match(response.headers.get('Cache-Control'),/no-store/);
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
});
