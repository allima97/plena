// Persistence for Plena. Two tiers: same-origin API (once a backend/Worker
// is deployed for this app) falling back to this browser's localStorage.
// Own storage key (plena-*) so it never collides with other apps sharing
// the same browser (e.g. the Rumo Financeiro / nextgoals app).

const LS_KEY = 'plena-state-v1';

export function loadLocal() {
	try {
		const raw = localStorage.getItem(LS_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function saveLocal(data) {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify(data));
	} catch {
		// storage full or disabled -- the app still works for this session
	}
}

/** @returns {Promise<{finAccounts:any[], finCategories:any[], finTransactions:any[], goals:any[], reportTemplates:any[], reportHistory:any[], reportSchedule:any, alertThresholds:any}|null>} */
export async function fetchRemoteState() {
	try {
		const res = await fetch('/api/plena/state', { headers: { accept: 'application/json' } });
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || !Array.isArray(data.finCategories)) return null;
		return data;
	} catch {
		return null;
	}
}

/** @returns {Promise<boolean>} true se a API confirmou a escrita (2xx). */
export async function apiPut(collection, id, data) {
	try {
		const res = await fetch(`/api/${collection}/${id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(data)
		});
		return res.ok;
	} catch {
		// offline/unreachable -- the local copy already has the change,
		// it just won't sync to other devices until the API is back
		return false;
	}
}

/** @returns {Promise<boolean>} true se a API confirmou a remoção (2xx). */
export async function apiRemove(collection, id) {
	try {
		const res = await fetch(`/api/${collection}/${id}`, { method: 'DELETE' });
		return res.ok;
	} catch {
		return false;
	}
}

/** Identidade da pessoa logada via Cloudflare Access, ou null (Access ainda
 * não configurado, ou app rodando local/sem login). Nunca lança erro. */
export async function fetchMe() {
	try {
		const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || !data.email) return null;
		return data;
	} catch {
		return null;
	}
}
