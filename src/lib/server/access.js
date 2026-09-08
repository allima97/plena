// Verificação do login do Cloudflare Access (Zero Trust), sem depender de
// nenhuma lib externa — só Web Crypto, que os Workers já têm nativamente.
// Mesma ideia do worker.js do nextgoals (que usa a lib `jose`), reimplementada
// aqui à mão para não precisar adicionar uma dependência nova ao projeto.
//
// "Fechado por padrão": se TEAM_DOMAIN/POLICY_AUD não estiverem configurados
// em wrangler.jsonc, ou o token não bater (assinatura, emissor, audiência,
// expiração), retorna null — nunca deixa passar por engano.

function base64UrlToUint8Array(base64Url) {
	const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob(padded);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

function base64UrlDecodeJSON(base64Url) {
	const bytes = base64UrlToUint8Array(base64Url);
	return JSON.parse(new TextDecoder().decode(bytes));
}

// createRemoteJWKSet do `jose` cacheia as chaves públicas do Access e só
// busca de novo quando aparece um `kid` desconhecido — replicando isso aqui
// com uma variável de módulo simples (vale por instância do Worker).
let jwksCache = null;
let jwksFetchedAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJWKS(teamDomain) {
	const res = await fetch(`${teamDomain}/cdn-cgi/access/certs`);
	if (!res.ok) throw new Error(`falha ao buscar as chaves do Access: ${res.status}`);
	return res.json();
}

async function getJWKS(teamDomain, forceRefresh = false) {
	const now = Date.now();
	if (forceRefresh || !jwksCache || now - jwksFetchedAt > JWKS_TTL_MS) {
		jwksCache = await fetchJWKS(teamDomain);
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
	const signature = base64UrlToUint8Array(signatureB64);
	return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
}

/**
 * Confere o header `Cf-Access-Jwt-Assertion` que o Access injeta em toda
 * requisição que passou pelo login. Retorna `{ email, name }` da pessoa
 * logada, ou `null` se o Access não estiver configurado, o header não
 * existir, ou o token não for válido.
 * @returns {Promise<{email: string, name: string|null}|null>}
 */
export async function verifyAccessJWT(request, env) {
	const teamDomain = env?.TEAM_DOMAIN;
	const policyAud = env?.POLICY_AUD;
	if (!teamDomain || !policyAud) return null;

	const token = request.headers.get('Cf-Access-Jwt-Assertion');
	if (!token) return null;

	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [headerB64, payloadB64, signatureB64] = parts;

	let header, payload;
	try {
		header = base64UrlDecodeJSON(headerB64);
		payload = base64UrlDecodeJSON(payloadB64);
	} catch {
		return null;
	}
	if (header.alg !== 'RS256') return null;

	try {
		let jwks = await getJWKS(teamDomain);
		let jwk = jwks.keys?.find((k) => k.kid === header.kid);
		if (!jwk) {
			// kid pode ter rotacionado -- busca de novo uma vez antes de desistir.
			jwks = await getJWKS(teamDomain, true);
			jwk = jwks.keys?.find((k) => k.kid === header.kid);
		}
		if (!jwk) return null;

		const valid = await verifySignature(jwk, headerB64, payloadB64, signatureB64);
		if (!valid) return null;

		const now = Math.floor(Date.now() / 1000);
		if (typeof payload.exp === 'number' && payload.exp < now) return null;
		if (typeof payload.nbf === 'number' && payload.nbf > now) return null;
		if (payload.iss !== teamDomain) return null;
		const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (!aud.includes(policyAud)) return null;
		if (!payload.email) return null;

		return { email: payload.email, name: payload.name || null };
	} catch (err) {
		console.error('[access] verificação do JWT falhou:', err?.message || err);
		return null;
	}
}
