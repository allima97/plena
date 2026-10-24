import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';
import { readJson } from '$lib/server/security.js';
import { importSalesTemplate } from '$lib/server/sales-templates.js';
import { triggerSyncToNextgoals } from '$lib/server/sync.js';

export async function POST({ locals, request, platform }) {
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await importSalesTemplate(env.DB, owner, 'owner_email', await readJson(request, 16384));
    const delivery = Promise.all(result.records.map(record => triggerSyncToNextgoals(env.DB, owner, 'PUT', record.collection, record.id, record.data, env, record.updatedAt)));
    if (platform?.ctx) platform.ctx.waitUntil(delivery); else await delivery;
    return json({ owner, section: result.section, types: result.types });
  } catch (error) {
    const status = error.status || 503;
    return json({ error: error.status ? error.message : 'Não foi possível importar o modelo. Tente novamente.' }, { status });
  }
}
