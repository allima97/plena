// Usage: node scripts/test-sync-integration.mjs ../nextgoals
// Runs both real APIs, real session/JWT authentication and in-memory SQLite.
// The email binding captures codes locally; no production bindings are used.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { build } from 'esbuild';
const plenaRoot = path.resolve(import.meta.dirname, '..');
const nextgoalsRoot = path.resolve(process.argv[2] || path.join(plenaRoot, '../nextgoals'));
const { default: nextgoals } = await import(pathToFileURL(path.join(nextgoalsRoot, 'worker.js')));
const { generateKeyPair, exportJWK, SignJWT } = await import(pathToFileURL(path.join(nextgoalsRoot, 'node_modules/jose/dist/webapi/index.js')));
const owner='alice@example.test', other='bob@example.test';
const psql=new DatabaseSync(':memory:'), nsql=new DatabaseSync(':memory:');
const adapter = sql => ({ prepare(query) { const statement=sql.prepare(query);let args=[];return {
  bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},
  async all(){return {results:statement.all(...args)};},async run(){const result=statement.run(...args);return {meta:{changes:result.changes}};}
};}, async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}} });
const pdb=adapter(psql), ndb=adapter(nsql);
const dir=await mkdtemp(path.join(tmpdir(),'sync-two-apps-'));
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'integration',alg:'RS256',use:'sig'};
const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({keys:[jwk]}));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  psql.exec('CREATE TABLE documents(collection TEXT,id TEXT,data TEXT,updated_at INTEGER)');
  for(const file of (await readdir(path.join(plenaRoot,'migrations'))).sort())
    if(file.endsWith('.sql'))psql.exec(await readFile(path.join(plenaRoot,'migrations',file),'utf8'));
  nsql.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,name TEXT,created_at TEXT,last_login_at TEXT);
    CREATE TABLE documents(user_id TEXT,collection TEXT,id TEXT,data TEXT,updated_at TEXT,PRIMARY KEY(user_id,collection,id));`);
  for(const file of ['0001_sync_registrations.sql','0002_sync_tombstones.sql'])nsql.exec(await readFile(path.join(nextgoalsRoot,'migrations',file),'utf8'));
  const session='isolated-session';const now=Date.now();
  psql.prepare('INSERT INTO auth_users VALUES(?,?,?,?,?)').run(owner,'Alice','test-only',now,now);
  psql.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?,?)').run(createHash('sha256').update(session).digest('base64url'),owner,now,now+600000,now);
  nsql.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(owner,owner,'Alice','test','test');
  const seed=(sql,column,who,collection,id,data,time)=>sql.prepare(`INSERT INTO documents(${column},collection,id,data,updated_at) VALUES(?,?,?,?,?)`).run(who,collection,id,JSON.stringify({id,...data}),column==='user_id'?new Date(time).toISOString():time);
  seed(psql,'owner_email',owner,'goals','from-plena',{name:'Plena goal'},1000);
  seed(nsql,'user_id',owner,'goals','from-ng',{name:'NextGoals goal'},2000);
  seed(psql,'owner_email',owner,'goals','shared',{name:'Old'},1000);
  seed(nsql,'user_id',owner,'goals','shared',{name:'Newest'},2000);
  seed(psql,'owner_email',other,'goals','private',{name:'Other account'},3000);
  seed(psql,'owner_email',owner,'finAccounts','private-finance',{name:'Never shared'},3000);
  const section='tourism';
  seed(psql,'owner_email',owner,'salesSections',section,{name:'Turismo',deleted:false},1000);
  seed(psql,'owner_email',owner,'salesPlans','2026-10',{target:1000,superTarget:2000,rates:{}},1000);
  seed(psql,'owner_email',owner,'sales','sale',{sectionId:section,date:'2026-10-23',type:'Hotel',total:100,fees:5},1000);
  let otp;
  const secret='integration-only-secret';
  const penv=globalThis.__integrationEnv={DB:pdb,SYNC_SECRET:secret,NEXTGOALS_URL:'https://ng.test',AUTH_EMAIL_FROM:'test@example.test',EMAIL:{async send(message){otp=message.text.match(/\d{6}/)[0];}}};
  const nenv={DB:ndb,SYNC_SECRET:secret,PLENA_URL:'https://plena.test',TEAM_DOMAIN:`http://127.0.0.1:${server.address().port}`,POLICY_AUD:'integration'};
  const routes={psessions:'privacy/sessions',pexport:'privacy/export',pstate:'plena/state',pdoc:'[collection]/[id]',initiate:'sync/m2m/initiate',verify:'sync/m2m/verify',reconcile:'sync/m2m/reconcile',inbound:'sync/inbound',status:'sync/m2m/status',disable:'sync/m2m/disable'};
  const contents=Object.entries(routes).map(([name,route])=>`export * as ${name} from '${plenaRoot}/src/routes/api/${route}/+server.js';`).join('\n')+`\nexport {handle} from '${plenaRoot}/src/hooks.server.js';`;
  const outfile=path.join(dir,'api.mjs');
  await build({stdin:{contents,resolveDir:plenaRoot},outfile,bundle:true,platform:'node',format:'esm',alias:{'$lib':path.join(plenaRoot,'src/lib')},plugins:[{name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__integrationEnv;'}));}}]});
  const api=await import(pathToFileURL(outfile));
  const plena=async request=>{
    const url=new URL(request.url);const parts=url.pathname.split('/');
    const key=Object.keys(routes).find(key=>'/api/'+routes[key]===url.pathname)||'pdoc';
    const event={url,request,locals:{},params:{collection:parts[2],id:decodeURIComponent(parts[3]||'')}};
    return api.handle({event,resolve:()=>api[key][request.method](event)});
  };
  penv.NEXTGOALS={fetch:request=>nextgoals.fetch(request,nenv)};
  nenv.PLENA={fetch:plena};
  const token=await new SignJWT({email:owner}).setProtectedHeader({alg:'RS256',kid:'integration'}).setIssuer(nenv.TEAM_DOMAIN).setAudience('integration').setExpirationTime('5m').sign(privateKey);
  const pRequest=(route,method='GET',body)=>plena(new Request('https://plena.test'+route,{method,headers:{Cookie:'__Host-plena_session='+session,Origin:'https://plena.test','X-Plena-Owner':owner,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const nRequest=(route,method='GET',body)=>nextgoals.fetch(new Request('https://ng.test'+route,{method,headers:{'Cf-Access-Jwt-Assertion':token,'content-type':'application/json',Origin:'https://ng.test','X-NextGoals-Owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})}),nenv);
  let response=await nRequest('/api/user-sync/initiate','POST',{plenaEmail:owner,confirm:true});assert.equal(response.status,200,await response.text());
  response=await nRequest('/api/user-sync/verify','POST',{code:otp});const activation=await response.json();assert.equal(response.status,200,JSON.stringify(activation));assert.equal(activation.warning,undefined,JSON.stringify(activation));
  const productSettings = { id:'product-settings', sectionId:section, name:'Configuração de produto', deleted:false, monthlySettings:{'2026-10':{rates:{below:1,target:2,super:3},hasTarget:true,target:5000,productRate:10,scaleStepBelow:1,scaleStepAbove:1}} };
  response=await pRequest('/api/salesTypes/product-settings','PUT',productSettings);assert.equal(response.status,200,await response.text());
  assert.deepEqual(JSON.parse(nsql.prepare("SELECT data FROM documents WHERE user_id=? AND collection='salesTypes' AND id='product-settings'").get(owner).data).monthlySettings,productSettings.monthlySettings);
  const changedProduct = {...productSettings,monthlySettings:{...productSettings.monthlySettings,'2026-11':{rates:{below:4,target:5,super:6},hasTarget:false,target:null,productRate:null,scaleStepBelow:2,scaleStepAbove:3}}};
  response=await nRequest('/api/salesTypes/product-settings','PUT',changedProduct);assert.equal(response.status,200,await response.text());
  assert.deepEqual(JSON.parse(psql.prepare("SELECT data FROM documents WHERE owner_email=? AND collection='salesTypes' AND id='product-settings'").get(owner).data).monthlySettings,changedProduct.monthlySettings);
  const invalidProduct={...changedProduct,monthlySettings:{'2026-11':{rates:{below:-1,target:5,super:6},hasTarget:false,target:null}}};
  assert.equal((await nRequest('/api/salesTypes/product-settings','PUT',invalidProduct)).status,400);
  assert.equal((await pRequest('/api/salesTypes/product-settings','PUT',invalidProduct)).status,400);
  for (const patch of [{productRate:101},{scaleStepAbove:0}]) {
    const invalid={...productSettings,monthlySettings:{'2026-10':{...productSettings.monthlySettings['2026-10'],...patch}}};
    assert.equal((await nRequest('/api/salesTypes/product-settings','PUT',invalid)).status,400);
    assert.equal((await pRequest('/api/salesTypes/product-settings','PUT',invalid)).status,400);
  }
  console.log('PASS: per-product commission settings and optional targets synchronize in both directions, retain previous months and reject invalid writes.');
  let ng=await (await nRequest('/api/state')).json();let pl=await (await pRequest('/api/plena/state')).json();
  assert.equal(ng.goals.length,3);assert.equal(pl.goals.length,3);assert.equal(pl.goals.find(g=>g.id==='shared').name,'Newest');
  assert.equal(ng.sales[0].id,'sale');assert.equal(ng.salesPlans[0].id,'tourism:2026-10');assert.equal(pl.salesPlans.find(plan=>plan.id==='tourism:2026-10').sectionId,'tourism');
  assert.equal(ng.finAccounts,undefined);assert.equal(ng.goals.some(goal=>goal.id==='private'),false);
  response=await pRequest('/api/goals/from-plena','PUT',{id:'from-plena',name:'Changed in Plena'});assert.equal(response.status,200,await response.text());
  assert.equal(JSON.parse(nsql.prepare("SELECT data FROM documents WHERE user_id=? AND id='from-plena'").get(owner).data).name,'Changed in Plena');
  response=await nRequest('/api/goals/from-ng','PUT',{id:'from-ng',name:'Changed in NextGoals'});assert.equal(response.status,200,await response.text());
  assert.equal(JSON.parse(psql.prepare("SELECT data FROM documents WHERE owner_email=? AND id='from-ng'").get(owner).data).name,'Changed in NextGoals');
  response=await nRequest('/api/goals/from-ng','DELETE');assert.equal(response.status,200,await response.text());
  assert.equal(psql.prepare("SELECT count(*) AS n FROM documents WHERE owner_email=? AND id='from-ng'").get(owner).n,0);
  const {reconcileSync}=await import(pathToFileURL(path.join(plenaRoot,'src/lib/server/sync.js')));
  const rerun=await reconcileSync(pdb,owner,penv,{force:true});assert.equal(rerun.error,undefined);
  assert.equal(psql.prepare("SELECT count(*) AS n FROM documents WHERE owner_email=? AND id='from-ng'").get(owner).n,0);
  assert.equal(nsql.prepare("SELECT count(*) AS n FROM documents WHERE user_id=? AND id='from-ng'").get(owner).n,0);
  assert.equal(psql.prepare("SELECT count(*) AS n FROM documents WHERE owner_email=? AND id='private'").get(other).n,1);
  // Permanent sales deletion is scoped by identity, requires reviewed counts,
  // reaches the linked peer, and remains deleted after reconciliation.
  response=await nRequest('/api/salesSections/other','PUT',{id:'other',name:'Turismo',deleted:false});assert.equal(response.status,200);
  response=await nRequest('/api/sales/other-sale','PUT',{id:'other-sale',sectionId:'other',date:'2026-10-23',type:'Hotel',total:200,fees:10});assert.equal(response.status,200);
  response=await nRequest('/api/salesTypes/Hotel','DELETE',{confirm:false,sectionId:section,expectedSalesCount:1});assert.equal(response.status,400);
  response=await nRequest('/api/salesTypes/Hotel','DELETE',{confirm:true,sectionId:section,expectedSalesCount:0});assert.equal(response.status,409);
  assert.equal(nsql.prepare("SELECT count(*) AS n FROM documents WHERE user_id=? AND id='sale'").get(owner).n,1);
  response=await nRequest('/api/salesTypes/Hotel','DELETE',{confirm:true,sectionId:section,expectedSalesCount:1});assert.equal(response.status,200,await response.text());
  for(const [sql,column] of [[psql,'owner_email'],[nsql,'user_id']]){
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND collection='sales' AND id='sale'`).get(owner).n,0);
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND collection='sales' AND id='other-sale'`).get(owner).n,1);
  }
  response=await nRequest('/api/salesSections/tourism','DELETE',{confirm:true,sectionId:section,expectedSalesCount:0});assert.equal(response.status,200,await response.text());
  await reconcileSync(pdb,owner,penv,{force:true});
  for(const [sql,column] of [[psql,'owner_email'],[nsql,'user_id']]){
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND collection='salesSections' AND id='tourism'`).get(owner).n,0);
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND collection='salesPlans' AND (id='2026-10' OR id='tourism:2026-10')`).get(owner).n,0);
    assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND collection='salesSections' AND id='other'`).get(owner).n,1);
  }
  response=await nRequest('/api/salesSections/tourism','PUT',{id:'tourism',name:'Stale restore',deleted:false});assert.equal(response.status,409);
  const transport = nenv.PLENA;
  nenv.PLENA = { fetch: request => request.url.endsWith('/inbound') ? Response.json({error:'temporarily_unavailable'},{status:503}) : transport.fetch(request) };
  response=await nRequest('/api/salesSections/other','DELETE',{confirm:true,sectionId:'other',expectedSalesCount:1});assert.equal(response.status,200,await response.text());
  assert.equal(psql.prepare("SELECT count(*) AS n FROM documents WHERE owner_email=? AND id='other'").get(owner).n,1);
  nenv.PLENA=transport;
  const repaired=await reconcileSync(pdb,owner,penv,{force:true});assert.equal(repaired.error,undefined);
  for(const [sql,column] of [[psql,'owner_email'],[nsql,'user_id']])assert.equal(sql.prepare(`SELECT count(*) AS n FROM documents WHERE ${column}=? AND id IN ('other','other-sale')`).get(owner).n,0);
  const exportResponse=await pRequest('/api/privacy/export');assert.equal(exportResponse.status,200);
  const personalExport=await exportResponse.json();
  assert.equal(personalExport.profile.email,owner);assert.equal(personalExport.profile.password_hash,undefined);
  assert.equal(personalExport.records.some(row=>row.id==='private'),false);
  assert.equal(personalExport.consents[0].purpose,'plena-nextgoals-sync');
  for (const [headers,status] of [[{Origin:'https://evil.test','X-Plena-Owner':owner},403],[{Origin:'https://plena.test','X-Plena-Owner':other},409]]) {
    const blocked=await plena(new Request('https://plena.test/api/goals/test',{method:'PUT',headers:{Cookie:'__Host-plena_session='+session,'content-type':'application/json',...headers},body:'{"id":"test","name":"blocked"}'}));assert.equal(blocked.status,status);
  }
  const anonymousExport=await plena(new Request('https://plena.test/api/privacy/export'));assert.equal(anonymousExport.status,401);
  const listed = await (await pRequest('/api/privacy/sessions')).json(); assert.equal(listed.sessions.length,1); assert.equal(listed.sessions[0].current,true); assert.equal(listed.sessions[0].id,undefined);
  assert.equal((await pRequest('/api/privacy/sessions','POST',{confirm:false})).status,400);
  assert.equal((await pRequest('/api/privacy/sessions','POST',{confirm:true})).status,200);
  const previousPeer = penv.NEXTGOALS;
  penv.NEXTGOALS = { fetch: async request => {
    const result = await previousPeer.fetch(request);
    if (request.url.endsWith('/reconcile')) psql.prepare('UPDATE sync_links SET enabled=0 WHERE plena_user_id=?').run(owner);
    return result;
  }};
  seed(nsql,'user_id',owner,'goals','revoked-response',{name:'Must not import after revocation'},Date.now());
  const revoked = await reconcileSync(pdb,owner,penv,{force:true});assert.equal(revoked.linked,false);
  assert.equal(psql.prepare("SELECT count(*) n FROM documents WHERE owner_email=? AND id='revoked-response'").get(owner).n,0);
  console.log('PASS: in-flight reconciliation cannot import a response after local revocation.');
  console.log('PASS: privacy export isolation, no password/session disclosure, CSRF and stale-account rejection.');
  console.log('PASS: permanent type/control deletion, confirmation counts, peer cascade, legacy plan cleanup, reconciliation and duplicate-name isolation.');
  console.log('PASS: authenticated activation, existing goals, newest conflict, section plans, changes in both directions, deletion, repeat reconciliation and account/privacy isolation.');
} finally {
  psql.close();nsql.close();await new Promise(resolve=>server.close(resolve));delete globalThis.__integrationEnv;await rm(dir,{recursive:true,force:true});
}
