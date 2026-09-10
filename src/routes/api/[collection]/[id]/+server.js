import { json } from '@sveltejs/kit';

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
	'budgetGlobal'
];

function checkCollection(collection) {
	return KNOWN_COLLECTIONS.includes(collection);
}

/** PUT /api/:collection/:id — grava (cria ou substitui) um documento. */
export async function PUT({ platform, params, request }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });

	const data = await request.json();
	await db
		.prepare(
			'INSERT INTO documents (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ' +
				'ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
		)
		.bind(params.collection, params.id, JSON.stringify(data), Date.now())
		.run();

	return json({ ok: true });
}

/** DELETE /api/:collection/:id — remove um documento. */
export async function DELETE({ platform, params }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	if (!checkCollection(params.collection)) return json({ error: 'Coleção desconhecida' }, { status: 400 });

	await db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?').bind(params.collection, params.id).run();

	return json({ ok: true });
}
