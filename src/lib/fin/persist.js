// Persistence for Plena. Two tiers: same-origin API (once a backend/Worker
// is deployed for this app) falling back to this browser's localStorage.
// Own storage key (plena-*) so it never collides with other apps sharing
// the same browser (e.g. the Rumo Financeiro / nextgoals app).

const LEGACY_LS_KEY = 'plena-state-v1';
let activeLSKey = `${LEGACY_LS_KEY}:anonymous`;
let activeIdentity = '';

/** Seleciona a área local da identidade atual, sem ler dados de outra conta. */
export function setLocalIdentity(email) {
	const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
	activeIdentity = normalized;
	activeLSKey = `${LEGACY_LS_KEY}:${encodeURIComponent(normalized || 'anonymous')}`;
}

export function loadLocal({ allowLegacy = false } = {}) {
	try {
		let raw = localStorage.getItem(activeLSKey);
		if (!raw && allowLegacy) {
			raw = localStorage.getItem(LEGACY_LS_KEY);
			if (raw) {
				localStorage.setItem(activeLSKey, raw);
				localStorage.removeItem(LEGACY_LS_KEY);
			}
		}
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function saveLocal(data) {
	try {
		localStorage.setItem(activeLSKey, JSON.stringify(data));
	} catch {
		// storage full or disabled -- the app still works for this session
	}
}

/** @returns {Promise<{finAccounts:any[], finCategories:any[], finTransactions:any[], goals:any[], reportTemplates:any[], reportHistory:any[], reportSchedule:any, alertThresholds:any, purchaseInstallments:any[]}|null>} */
export async function fetchRemoteState(expectedEmail = activeIdentity) {
	const expectedOwner = typeof expectedEmail === 'string' ? expectedEmail.trim().toLowerCase() : '';
	if (!expectedOwner || expectedOwner !== activeIdentity) return null;
	try {
		const res = await fetch('/api/plena/state', {
		headers: { accept: 'application/json', 'X-Plena-Owner': expectedOwner }
		});
		inspectSession(res);
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || data.owner !== expectedOwner || !Array.isArray(data.finCategories)) return null;
		return data;
	} catch {
		return null;
	}
}

/** @returns {Promise<boolean>} true se a API confirmou a escrita (2xx). */
export async function apiPut(collection, id, data) {
	if (!activeIdentity) return false;
	try {
		const res = await fetch(`/api/${collection}/${encodeURIComponent(id)}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json', 'X-Plena-Owner': activeIdentity },
			body: JSON.stringify(data)
		});
		inspectSession(res);
		return res.ok;
	} catch {
		// offline/unreachable -- the local copy already has the change,
		// it just won't sync to other devices until the API is back
		return false;
	}
}

/** @returns {Promise<boolean>} true se a API confirmou a remoção (2xx). */
export async function apiRemove(collection, id) {
	if (!activeIdentity) return false;
	try {
		const res = await fetch(`/api/${collection}/${encodeURIComponent(id)}`, {
			method: 'DELETE',
			headers: { 'X-Plena-Owner': activeIdentity }
		});
		inspectSession(res);
		return res.ok;
	} catch {
		return false;
	}
}

/** Identidade da pessoa autenticada no Plena, ou null quando não há sessão. */
export async function fetchMe() {
	try {
		const res = await fetch('/api/me', { headers: { accept: 'application/json' } });
		inspectSession(res);
		if (!res.ok) return null;
		const data = await res.json();
		if (!data || !data.email) return null;
		return data;
	} catch {
		return null;
	}
}

export function clearPrivateLocalData() {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(LEGACY_LS_KEY)) localStorage.removeItem(key); } catch {}
}
function inspectSession(response) {
  if ([401, 409].includes(response.status)) {
    clearPrivateLocalData();
    window.location.replace('/login');
  }
  return response;
}
