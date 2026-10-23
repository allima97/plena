import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { plenaToNextgoals, nextgoalsToPlena } from '../src/lib/server/sync.js';

const root = path.resolve(import.meta.dirname, '..');

test('sales plans and categories round-trip across both formats without losing their section', () => {
  for (const sectionId of ['default', 'tourism']) {
    const id = sectionId === 'default' ? '2026-10' : `${sectionId}:2026-10`;
    const plan = { id, sectionId, target: 1000, superTarget: 2000, rates: {} };
    const mapped = plenaToNextgoals('salesPlans', id, plan);
    assert.equal(mapped.ngId, `${sectionId}:2026-10`);
    assert.deepEqual(nextgoalsToPlena('salesPlans', mapped.ngId, mapped.ngData).data, plan);
    assert.equal(nextgoalsToPlena('salesPlans', mapped.ngId, { id: mapped.ngId }).id, id);
  }
  assert.equal(nextgoalsToPlena('categories', 'trip', { id: 'trip' }).collection, 'goalCategories');
  assert.equal(plenaToNextgoals('sales', 'legacy', { id: 'legacy' }).ngData.sectionId, 'default');
  assert.equal(plenaToNextgoals('finAccounts', 'private', {}), null);
});

test('sync routes retain authentication, deliver OTP, confirm once and isolate incoming writes', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'plena-sync-test-'));
  const sqlite = new DatabaseSync(':memory:');
  t.after(async () => { sqlite.close(); delete globalThis.__plenaSyncEnv; await rm(dir, { recursive: true, force: true }); });
  sqlite.exec('CREATE TABLE documents (collection TEXT, id TEXT, data TEXT, updated_at INTEGER)');
  for (const file of (await readdir(path.join(root, 'migrations'))).sort())
    if (file.endsWith('.sql')) sqlite.exec(await readFile(path.join(root, 'migrations', file), 'utf8'));
  const owner = 'alice@example.test';
  sqlite.prepare('INSERT INTO auth_users VALUES (?, ?, ?, ?, ?)').run(owner, 'Alice', 'test-only', 1, 1);
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql); let args = [];
    return { bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) || null; },
      async run() { const result = statement.run(...args); return { meta: { changes: result.changes } }; },
      async all() { return { results: statement.all(...args) }; },
    };
  } };
  let code; let failEmail = false; const calls = [];
  const env = globalThis.__plenaSyncEnv = { DB: db, NEXTGOALS_URL: 'https://nextgoals.example.test', SYNC_SECRET: 'isolated-test-secret', AUTH_EMAIL_FROM: 'test@example.test',
    EMAIL: { async send(message) { if (failEmail) throw new Error('delivery_failed'); code = message.text.match(/\d{6}/)[0]; } },
    NEXTGOALS: { async fetch(request) {
      assert.equal(request.headers.get('Authorization'), `Bearer ${env.SYNC_SECRET}`);
      calls.push(new URL(request.url).pathname);
      return Response.json({ ok: true, exists: true });
    } },
  };
  const exports = { initiate: 'sync/initiate', verify: 'sync/verify', disable: 'sync/disable', inbound: 'sync/inbound', m2m: 'sync/m2m/initiate', m2mStatus: 'sync/m2m/status' };
  const entry = Object.entries(exports).map(([name, route]) => `export { POST as ${name} } from '${root}/src/routes/api/${route}/+server.js';`).join('\n') + `\nexport { handle } from '${root}/src/hooks.server.js';`;
  const outfile = path.join(dir, 'routes.mjs');
  await build({ stdin: { contents: entry, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'esm', alias: { '$lib': path.join(root, 'src/lib') }, plugins: [{ name: 'env', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'test' }));
    build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const env = globalThis.__plenaSyncEnv;' }));
  } }] });
  const routes = await import(outfile);
  const event = (route, body, machine = false) => {
    const url = new URL(`https://plena.example.test/api/${route}`);
    return { url, locals: machine ? {} : { user: { email: owner } }, request: new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(machine ? { Authorization: `Bearer ${env.SYNC_SECRET}` } : { Origin: url.origin }) }, body: JSON.stringify(body) }) };
  };
  const invoke = (route, handler, body = {}) => {
    const e = event(route, body, true);
    return routes.handle({ event: e, resolve: () => handler(e) });
  };
  for (const route of ['sync/inbound', 'sync/m2m/initiate', 'sync/m2m/status', 'sync/initiate']) {
    const e = event(route, {}, true); e.request.headers.delete('Authorization');
    assert.equal((await routes.handle({ event: e, resolve: () => { throw new Error('authentication bypass'); } })).status, 401);
  }
  const status = await invoke('sync/m2m/status', routes.m2mStatus, { user_id: owner });
  assert.equal(status.status, 200); assert.equal((await status.json()).linked, false);
  assert.equal((await invoke('sync/m2m/initiate', routes.m2m, { user_id: owner })).status, 200);
  assert.match(code, /^\d{6}$/); assert.ok(calls.includes('/api/sync/check'));
  assert.equal((await routes.initiate(event('sync/initiate', {}))).status, 429);
  assert.equal((await routes.verify(event('sync/verify', { code: code === '000000' ? '000001' : '000000' }))).status, 400);
  assert.equal(sqlite.prepare('SELECT attempts FROM sync_otps').get().attempts, 1);
  assert.equal((await routes.verify(event('sync/verify', { code }))).status, 200);
  assert.ok(calls.includes('/api/sync/register'));
  assert.equal((await routes.verify(event('sync/verify', { code }))).status, 400, 'codes are single-use');
  const incoming = { source_user_id: owner, operation: 'PUT', collection: 'categories', id: 'trip', data: { id: 'trip', name: 'Viagem' }, source_updated_at: 1000 };
  assert.equal((await invoke('sync/inbound', routes.inbound, incoming)).status, 200);
  assert.equal(sqlite.prepare("SELECT owner_email FROM documents WHERE collection = 'goalCategories'").get().owner_email, owner);
  await invoke('sync/inbound', routes.inbound, { ...incoming, source_user_id: 'bob@example.test', id: 'other' });
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM documents').get().n, 1);
  await invoke('sync/inbound', routes.inbound, { ...incoming, data: { id: 'trip', name: 'Old' }, source_updated_at: 500 });
  assert.equal(JSON.parse(sqlite.prepare('SELECT data FROM documents').get().data).name, 'Viagem');
  assert.equal((await invoke('sync/inbound', routes.inbound, { ...incoming, collection: 'finAccounts' })).status, 400);
  assert.equal((await routes.disable(event('sync/disable', { confirm: true }))).status, 200);
  assert.equal(sqlite.prepare('SELECT enabled FROM sync_links').get().enabled, 0);
  assert.ok(calls.includes('/api/sync/deregister'));
  failEmail = true;
  assert.equal((await routes.initiate(event('sync/initiate', {}))).status, 502, 'a failed email never reports OTP sent');
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM sync_otps WHERE used = 0').get().n, 0);
  failEmail = false;
  await routes.initiate(event('sync/initiate', {}));
  const wrong = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await routes.verify(event('sync/verify', { code: wrong }));
  assert.equal((await routes.verify(event('sync/verify', { code }))).status, 400, 'five wrong attempts invalidate the challenge');
});
