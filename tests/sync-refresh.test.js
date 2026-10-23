import test from 'node:test';
import assert from 'node:assert/strict';
import { startStateRefresh } from '../src/lib/fin/sync-refresh.js';

test('refresh resumes on focus/online, skips editing and hidden screens, never overlaps and cleans up', async () => {
  const handlers={}; let tick;let stops=0;let calls=0;let editing=true;let release;
  const target={addEventListener:(type,fn)=>handlers[type]=fn,removeEventListener:type=>delete handlers[type],setInterval:fn=>(tick=fn,1),clearInterval:()=>stops++};
  const page={visibilityState:'visible',addEventListener:(type,fn)=>handlers[type]=fn,removeEventListener:type=>delete handlers[type]};
  const stop=startStateRefresh({target,page,canRefresh:()=>!editing,refresh:()=>{calls++;return new Promise(resolve=>release=resolve);}});
  await tick();assert.equal(calls,0);
  editing=false; page.visibilityState='hidden';await tick();assert.equal(calls,0);
  page.visibilityState='visible';const first=handlers.focus();await tick();assert.equal(calls,1);
  release();await first;
  const second=handlers.online();assert.equal(calls,2);release();await second;
  stop();await tick();assert.equal(calls,2);assert.equal(stops,1);assert.deepEqual(handlers,{});
});
