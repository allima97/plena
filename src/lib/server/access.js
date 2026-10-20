// Verifica localmente o JWT emitido pelo Cloudflare Access. O backend falha
// fechado caso configuração, assinatura ou claims não sejam válidos.
function base64UrlToUint8Array(base64Url) {
	if (!/^[A-Za-z0-9_-]+$/.test(base64Url)) throw new Error('base64url inválido');
	const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

function base64UrlDecodeJSON(base64Url) {
	const bytes = base64UrlToUint8Array(base64Url);
	return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

let jwksCache = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_REFRESH_COOLDOWN_MS = 30 * 1000;

async function fetchJWKS(teamDomain) {
	const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
	if (!res.ok) throw new Error(`falha ao buscar as chaves do Access: ${res.status}`);
	const jwks = await res.json();
	if (!Array.isArray(jwks?.keys)) throw new Error('JWKS inválido');
	return jwks;
}

async function getJWKS(teamDomain, forceRefresh = false) {
	const now = Date.now();
	const expired = !jwksCache || now - jwksFetchedAt > JWKS_TTL_MS;
	const refreshAllowed = now - jwksFetchedAt > JWKS_REFRESH_COOLDOWN_MS;
	if ((expired || forceRefresh) && (!forceRefresh || refreshAllowed || !jwksCache)) {
		const next = await fetchJWKS(teamDomain);
		jwksCache = next;
		jwksFetchedAt = now;
	}
	return jwksCache;
}

async function importRS256Key(jwk) {
	return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifySignature(jwk, headerB64, payloadB64, signatureB64) {
	const key = await importRS256Key(jwk);
	const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
	return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToUint8Array(signatureB64), data);
}

function validEmail(value) {
	return typeof value === 'string' && value.length <= 320 && value === value.trim() &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** @returns {Promise<{email: string, name: string|null}|null>} */
export async function verifyAccessJWT(request, env) {
	const teamDomain = env?.TEAM_DOMAIN;
	const policyAud = env?.POLICY_AUD;
	if (typeof teamDomain !== 'string' || typeof policyAud !== 'string' || !policyAud) return null;
	try {
		const issuer = new URL(teamDomain);
		if (issuer.protocol !== 'https:' || issuer.pathname !== '/' || issuer.search || issuer.hash) return null;
	} catch {
		return null;
	}

	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token || token.length > 8192) return null;
	const parts = token.split('.');
	if (parts.length !== 3 || parts.some((part) => !part)) return null;
	const [headerB64, payloadB64, signatureB64] = parts;

	let header, payload;
	try {
		header = base64UrlDecodeJSON(headerB64);
		payload = base64UrlDecodeJSON(payloadB64);
	} catch {
		return null;
	}
	if (!header || typeof header !== 'object' || header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) return null;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

	try {
		let jwks = await getJWKS(teamDomain);
		let jwk = jwks.keys.find((key) => key.kid === header.kid);
		if (!jwk) {
			jwks = await getJWKS(teamDomain, true);
			jwk = jwks.keys.find((key) => key.kid === header.kid);
		}
		if (!jwk || jwk.kty !== 'RSA' || (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== 'RS256')) return null;
		if (!(await verifySignature(jwk, headerB64, payloadB64, signatureB64))) return null;

		const now = Math.floor(Date.now() / 1000);
		if (!Number.isSafeInteger(payload.exp) || payload.exp <= now) return null;
		if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) return null;
		if (payload.iat !== undefined && (!Number.isSafeInteger(payload.iat) || payload.iat > now + 60)) return null;
		if (payload.iss !== teamDomain || !validEmail(payload.email)) return null;
		const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!aud.includes(policyAud)) return null;

		return { email: payload.email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name.slice(0, 200) : null };
	} catch (err) {
		console.error('[access] verificação do JWT falhou:', err?.message || err);
		return null;
	}
}
