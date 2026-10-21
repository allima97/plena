import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { claimLegacyData, dataOwner } from '$lib/server/data-owner.js';

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
	'patrimonySnapshots',
	'patrimonyItemMoves',
	'scoreSnapshots',
	'purchaseInstallments', 'sales', 'salesPlans', 'salesTypes', 'salesSections'
];
const SINGLETON_COLLECTIONS = ['reportSchedule', 'alertThresholds', 'settings', 'budgetGlobal'];

/** GET /api/plena/state — junta todas as coleções do usuário num só payload. */
export async function GET({ locals }) {
	const db = env.DB;
	if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
	const owner = dataOwner(locals);
	if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
	await claimLegacyData(db, owner, env);

	const { results } = await db
		.prepare('SELECT collection, id, data FROM documents WHERE owner_email = ? AND collection IN (' + [...ARRAY_COLLECTIONS, ...SINGLETON_COLLECTIONS].map(() => '?').join(',') + ')')
		.bind(owner, ...ARRAY_COLLECTIONS, ...SINGLETON_COLLECTIONS)
		.all();

	const state = {
		owner,
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
		patrimonySnapshots: [],
		patrimonyItemMoves: [],
		scoreSnapshots: [],
		purchaseInstallments: [],
		sales: [],
		salesPlans: [],
		salesTypes: [],
		salesSections: [],
		budgetGlobal: null
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
