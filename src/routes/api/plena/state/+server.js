import { json } from '@sveltejs/kit';

export const prerender = false;

const ARRAY_COLLECTIONS = [
	'finAccounts',
	'finCategories',
	'finTransactions',
	'reportTemplates',
	'reportHistory',
	'goals',
	'resources',
	'resourceMoves',
	'goalCategories',
	'installments',
	'amortizations',
	'patrimonyItems',
	'patrimonySnapshots'
];
const SINGLETON_COLLECTIONS = ['reportSchedule', 'alertThresholds', 'settings'];

/** GET /api/plena/state — junta todas as coleções do usuário num só payload. */
export async function GET({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });

	const { results } = await db
		.prepare('SELECT collection, id, data FROM documents WHERE collection IN (' + [...ARRAY_COLLECTIONS, ...SINGLETON_COLLECTIONS].map(() => '?').join(',') + ')')
		.bind(...ARRAY_COLLECTIONS, ...SINGLETON_COLLECTIONS)
		.all();

	const state = {
		finAccounts: [],
		finCategories: [],
		finTransactions: [],
		reportTemplates: [],
		reportHistory: [],
		reportSchedule: null,
		alertThresholds: null,
		settings: null,
		goals: [],
		resources: [],
		resourceMoves: [],
		goalCategories: [],
		installments: [],
		amortizations: [],
		patrimonyItems: [],
		patrimonySnapshots: []
	};

	for (const row of results) {
		const value = JSON.parse(row.data);
		if (SINGLETON_COLLECTIONS.includes(row.collection)) {
			state[row.collection] = value;
		} else {
			state[row.collection].push(value);
		}
	}

	return json(state);
}
