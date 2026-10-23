import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readSyncRecords, runSyncStatements, syncRecordStatements } from '../src/lib/server/sync-records.js';

test('reconciliation preserves newer changes, propagates deletions and isolates accounts with both timestamp formats', async () => {
  for (const column of ['owner_email', 'user_id']) {
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE documents(${column} TEXT, collection TEXT, id TEXT, data TEXT, updated_at ${column === 'user_id' ? 'TEXT' : 'INTEGER'}, PRIMARY KEY(${column},collection,id));
      CREATE TABLE sync_tombstones(owner TEXT,collection TEXT,id TEXT,deleted_at INTEGER,PRIMARY KEY(owner,collection,id));`);
    const db = { prepare(query) { const statement=sql.prepare(query); let args=[];return {
      bind(...values){args=values;return this;}, async run(){return statement.run(...args);},async all(){return {results:statement.all(...args)};}
    };} };
    const put = (updatedAt, name, owner='alice') => runSyncStatements(db, syncRecordStatements(db, owner, column, { collection:'goals',id:'trip',data:{id:'trip',name},updatedAt }));
    await put(2000,'Latest'); await put(1000,'Stale'); await put(1000,'Bob','bob');
    assert.equal((await readSyncRecords(db,'alice',column,['goals']))[0].data.name,'Latest');
    await runSyncStatements(db,syncRecordStatements(db,'alice',column,{collection:'goals',id:'trip',deleted:true,updatedAt:3000}));
    await put(2000,'Do not restore');
    assert.equal((await readSyncRecords(db,'alice',column,['goals']))[0].deleted,true);
    assert.equal((await readSyncRecords(db,'bob',column,['goals']))[0].data.name,'Bob');
    await put(4000,'Recreated');
    await runSyncStatements(db,syncRecordStatements(db,'alice',column,{collection:'goals',id:'trip',deleted:true,updatedAt:3000}));
    assert.equal((await readSyncRecords(db,'alice',column,['goals']))[0].data.name,'Recreated');
    assert.equal((await readSyncRecords(db,'alice',column,['finAccounts'])).length,0);
    sql.close();
  }
});
