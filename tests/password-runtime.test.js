import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
test('production-compatible workerd derives PBKDF2-SHA256 at 600k with the standard result',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-09-07',compatibilityFlags:['nodejs_compat'],script:`export default {async fetch(){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('runtime-fixture'),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(16).fill(7),iterations:600000,hash:'SHA-256'},material,256);return new Response(Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join(''));}}`}));
 try {const response=await mf.dispatchFetch('http://localhost/');assert.equal(await response.text(),pbkdf2Sync('runtime-fixture',Buffer.alloc(16,7),600000,32,'sha256').toString('hex'));}
 finally {await mf.dispose();}
});
