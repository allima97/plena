import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';
export const prerender = false;
export async function GET({locals}) {
  const owner = dataOwner(locals);
  if (!owner) return json({error:'unauthorized'}, {status:401});
  const profile = await env.DB.prepare('SELECT email, name, created_at, updated_at FROM auth_users WHERE email = ?').bind(owner).first();
  const documents = await env.DB.prepare('SELECT collection, id, data FROM documents WHERE owner_email = ?').bind(owner).all();
  const consents = await env.DB.prepare('SELECT purpose, version, accepted_at, revoked_at FROM privacy_consents WHERE owner = ?').bind(owner).all();
  return json({controller:'nxapps', contact:'nxapps01@gmail.com', exportedAt:new Date().toISOString(), profile, consents:consents.results, records:documents.results.map(row=>({...row,data:JSON.parse(row.data)}))}, {headers:{'Content-Disposition':'attachment; filename="plena-dados-pessoais.json"'}});
}
