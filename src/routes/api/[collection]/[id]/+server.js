import { validateSale, validatePlan, validateSaleType } from '$lib/goals/sales.js';
import { json } from '@sveltejs/kit';
import { claimLegacyData, dataOwner } from '$lib/server/data-owner.js';

export const prerender = false;

const KNOWN_COLLECTIONS = [
	'finAccounts',
	'finCategories',
	'finTransactions',
	'reportTemplates',
	'reportHistory',
	'reportSchedule',
	'alertThresholds',
	'settings',
	'goals',
	'resources',
	'resourceMoves',
	'goalCategories',
	'installments',
	'amortizations',
	'patrimonyItems',
	'patrimonySnapshots',
	'patrimonyItemMoves',
	'scoreSnapshots',
	'budgetGlobal',
	'purchaseInstallments', 'sales', 'salesPlans', 'salesTypes'
];

function checkCollection(collection) {
	return KNOWN_COLLECTIONS.includes(collection);
}

/** PUT /api/:collection/:id — grava (cria ou substitui) um documento. */
export async function PUT({ locals, platform, params, request }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });

	let data;
 try {
  data = await request.json();
  if (params.collection === 'sales') validateSale(data);
  if (params.collection === 'salesTypes') {
   validateSaleType(data);
   if (data.id !== params.id) throw new Error('Tipo inválido.');
  }
  if (params.collection === 'salesPlans') {
   validatePlan(data);
   if (data.id !== params.id) throw new Error('Mês da configuração inválido.');
  }
 } catch (error) {
  return json({ error: error.message || 'Dados inválidos.' }, { status: 400 });
 }
	await claimLegacyData(db, owner, platform.env);
	await db
		.prepare(
			'INSERT INTO documents (owner_email, collection, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ' +
				'ON CONFLICT(owner_email, collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
		)
		.bind(owner, params.collection, params.id, JSON.stringify(data), Date.now())
		.run();

	return json({ ok: true });
}

/** DELETE /api/:collection/:id — remove um documento. */
export async function DELETE({ locals, platform, params }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });

	await claimLegacyData(db, owner, platform.env);
	await db.prepare('DELETE FROM documents WHERE owner_email = ? AND collection = ? AND id = ?').bind(owner, params.collection, params.id).run();

	return json({ ok: true });
}
