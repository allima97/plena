const SESSION_COOKIE = '__Host-plena_session';
const CHALLENGE_COOKIE = '__Host-plena_challenge';
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL = 5 * 60 * 1000;
// Cloudflare Workers rejects PBKDF2 iteration counts above 100,000.
const PASSWORD_ITERATIONS = 100_000;
// The account-wide included email quota is shared with Salão na Mão. Reserve
// 500 of its 3,000 monthly messages for that app.
const MONTHLY_EMAIL_LIMIT = 2_500;
const EMAIL_BILLING_CYCLE_DAY = 18;
const encoder = new TextEncoder();

function base64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function randomToken(size = 32) {
	const bytes = crypto.getRandomValues(new Uint8Array(size));
	return base64url(bytes);
}

function randomCode() {
	const max = 4_294_000_000; // largest multiple of one million below 2^32
	let value;
	do value = crypto.getRandomValues(new Uint32Array(1))[0]; while (value >= max);
	return String(value % 1_000_000).padStart(6, '0');
}

async function sha256(value) {
	return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function hmac(value, secret) {
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function equal(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return mismatch === 0;
}

function validEmail(value) {
	return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeEmail(value) {
	return value.trim().toLowerCase();
}

async function derivePassword(password, salt, iterations = PASSWORD_ITERATIONS) {
	const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, 256);
	return base64url(new Uint8Array(bits));
}

async function hashPassword(password) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await derivePassword(password, salt);
	return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${base64url(salt)}$${hash}`;
}

function decodeBase64url(value) {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
	return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function verifyPassword(password, stored) {
	const [algorithm, iterationValue, saltValue, expected] = stored.split('$');
	const iterations = Number(iterationValue);
	if (algorithm !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
	const actual = await derivePassword(password, decodeBase64url(saltValue), iterations);
	return equal(actual, expected);
}

function cookieOptions(maxAge) {
	return `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function setCookie(headers, name, value, maxAge) {
	headers.append('Set-Cookie', `${name}=${value}; ${cookieOptions(maxAge)}`);
}

function clearCookie(headers, name) {
	headers.append('Set-Cookie', `${name}=; ${cookieOptions(0)}`);
}

function cookie(request, name) {
	const raw = request.headers.get('Cookie') || '';
	for (const part of raw.split(';')) {
		const [key, ...value] = part.trim().split('=');
		if (key === name) return value.join('=');
	}
	return null;
}

function json(data, status = 200, headers = new Headers()) {
	headers.set('Content-Type', 'application/json; charset=utf-8');
	headers.set('Cache-Control', 'private, no-store, max-age=0');
	headers.set('Pragma', 'no-cache');
	return new Response(JSON.stringify(data), { status, headers });
}

async function parseBody(request) {
	const raw = await request.text().catch(() => '');
	if (!raw || encoder.encode(raw).byteLength > 4096) return null;
	try { return JSON.parse(raw); } catch { return null; }
}

async function rateLimit(db, key, limit, windowMs) {
	const now = Date.now();
	await db.prepare('DELETE FROM auth_rate_limits WHERE window_started_at < ?').bind(now - 7 * 24 * 60 * 60_000).run();
	const result = await db.prepare(
		`INSERT INTO auth_rate_limits (key, window_started_at, count) VALUES (?, ?, 1)
		 ON CONFLICT(key) DO UPDATE SET
		 window_started_at = CASE WHEN window_started_at + ? <= ? THEN ? ELSE window_started_at END,
		 count = CASE WHEN window_started_at + ? <= ? THEN 1 ELSE count + 1 END
		 RETURNING count`
	).bind(key, now, windowMs, now, now, windowMs, now).first();
	return Number(result?.count) <= limit;
}

function emailBillingPeriod(now) {
	const date = new Date(now);
	if (date.getUTCDate() < EMAIL_BILLING_CYCLE_DAY) date.setUTCMonth(date.getUTCMonth() - 1);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${EMAIL_BILLING_CYCLE_DAY}`;
}

async function reserveMonthlyEmail(db, now) {
	const period = emailBillingPeriod(now);
	return db.prepare(
		`INSERT INTO auth_email_usage (billing_period, count) VALUES (?, 1)
		 ON CONFLICT(billing_period) DO UPDATE SET count = count + 1
		 WHERE count < ? RETURNING count`
	).bind(period, MONTHLY_EMAIL_LIMIT).first();
}

async function requestAllowed(event) {
	const origin = event.request.headers.get('Origin');
	if (!origin || origin !== event.url.origin) return false;
	const type = event.request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
	if (type !== 'application/json') return false;
	const length = Number(event.request.headers.get('Content-Length') || 0);
	return !length || length <= 4096;
}

async function sendCode(env, email, code, purpose) {
	if (!env.EMAIL || !env.AUTH_EMAIL_FROM || !env.AUTH_SECRET) throw new Error('Autenticação por e-mail não configurada');
	const purposeText = purpose === 'register' ? 'confirme seu cadastro' : purpose === 'reset' ? 'redefina sua senha' : 'entre na sua conta';
	const subject = purpose === 'register' ? 'Confirme seu cadastro no PLENA' : purpose === 'reset' ? 'Redefina sua senha no PLENA' : 'Seu código de acesso ao PLENA';
	const text = `Seu código de verificação do PLENA é ${code}. Use-o para ${purposeText}. Ele expira em 5 minutos. Se você não solicitou este código, ignore esta mensagem.`;
	const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#1c2733"><h1 style="font-size:24px">PLENA</h1><p>Use este código para ${purposeText}:</p><p style="font-size:36px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p><p>O código expira em 5 minutos. Se você não solicitou este código, ignore esta mensagem.</p></div>`;
	await env.EMAIL.send({ to: email, from: env.AUTH_EMAIL_FROM, subject, text, html });
}

async function requestCode(event, env) {
	const body = await parseBody(event.request);
	if (!body || !['login', 'register', 'reset'].includes(body.mode)) return json({ error: 'request_invalid' }, 400);
	const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
	const password = typeof body.password === 'string' ? body.password : '';
	const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
	if (!validEmail(email) || (body.mode !== 'reset' && (password.length < 12 || password.length > 128)) || (body.mode === 'register' && name.length < 2))
		return json({ error: 'request_invalid', message: 'Confira o e-mail, a senha (mínimo de 12 caracteres) e o nome.' }, 400);

	const db = env.DB;
	if (!db || typeof env.AUTH_SECRET !== 'string' || env.AUTH_SECRET.length < 32 || !env.EMAIL) return json({ error: 'auth_unavailable' }, 503);
	const ip = event.request.headers.get('CF-Connecting-IP') || 'unknown';
	const ipKey = await sha256(ip);
	const emailKey = await sha256(email);
	if (!(await rateLimit(db, `start:${ipKey}`, 15, 60_000)) || !(await rateLimit(db, `email:${emailKey}`, 5, 60 * 60_000)))
		return json({ error: 'rate_limited', message: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);

	const existing = await db.prepare('SELECT email, name, password_hash FROM auth_users WHERE email = ? COLLATE NOCASE').bind(email).first();
	let passwordHash;
	let accountName = name || email.split('@')[0];
	if (body.mode === 'login') {
		if (!existing || !(await verifyPassword(password, existing.password_hash)))
			return json({ error: 'invalid_credentials', message: 'E-mail ou senha incorretos.' }, 401);
		passwordHash = existing.password_hash;
		accountName = existing.name;
	} else if (body.mode === 'register') {
		if (existing) return json({ error: 'account_exists', message: 'Já existe uma conta com este e-mail. Entre com sua senha.' }, 409);
		passwordHash = await hashPassword(password);
	} else {
		passwordHash = existing?.password_hash || 'reset-request-only';
		accountName = existing?.name || accountName;
	}

	const challengeToken = randomToken();
	const challengeId = await sha256(challengeToken);
	const code = randomCode();
	const codeHash = await hmac(`${challengeId}:${code}`, env.AUTH_SECRET);
	const now = Date.now();
	await db.prepare('DELETE FROM auth_challenges WHERE email = ? OR expires_at <= ?').bind(email, now).run();
	await db.prepare(
		'INSERT INTO auth_challenges (id, email, name, password_hash, code_hash, purpose, created_at, expires_at, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(challengeId, email, accountName, passwordHash, codeHash, body.mode, now, now + CHALLENGE_TTL, now).run();
	if (body.mode !== 'reset' || existing) {
		const emailReservation = await reserveMonthlyEmail(db, now);
		if (!emailReservation) {
			await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challengeId).run();
			return json({ error: 'email_quota_reached', message: 'O limite mensal de envio de códigos foi atingido. Tente novamente no próximo ciclo.' }, 429);
		}
		try {
			await sendCode(env, email, code, body.mode);
		} catch (error) {
			await db.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challengeId).run();
			console.error('[auth] falha ao enviar código de acesso:', error?.message || error);
			return json({ error: 'email_unavailable', message: 'Não foi possível enviar o código agora. Tente novamente em instantes.' }, 503);
		}
	}

	const headers = new Headers();
	setCookie(headers, CHALLENGE_COOKIE, challengeToken, Math.floor(CHALLENGE_TTL / 1000));
	return json({ ok: true, email, expiresInSeconds: CHALLENGE_TTL / 1000 }, 200, headers);
}

async function verifyCode(event, env) {
	const body = await parseBody(event.request);
	const code = typeof body?.code === 'string' ? body.code.trim() : '';
	if (!/^\d{6}$/.test(code)) return json({ error: 'invalid_code', message: 'Digite o código de 6 dígitos.' }, 400);
	const token = cookie(event.request, CHALLENGE_COOKIE);
	if (!token || !env.DB || typeof env.AUTH_SECRET !== 'string' || env.AUTH_SECRET.length < 32) return json({ error: 'challenge_expired', message: 'Sua solicitação expirou. Informe sua senha novamente.' }, 401);
	const id = await sha256(token);
	const challenge = await env.DB.prepare('SELECT * FROM auth_challenges WHERE id = ?').bind(id).first();
	const now = Date.now();
	if (!challenge || challenge.expires_at <= now || challenge.attempts >= 5)
		return json({ error: 'challenge_expired', message: 'Sua solicitação expirou. Informe sua senha novamente.' }, 401);

	const received = await hmac(`${id}:${code}`, env.AUTH_SECRET);
	if (!equal(received, challenge.code_hash)) {
		const attempts = await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ? AND attempts < 5 RETURNING attempts').bind(id).first();
		if (Number(attempts?.attempts) >= 5) {
			await env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(id).run();
			const headers = new Headers();
			clearCookie(headers, CHALLENGE_COOKIE);
			return json({ error: 'too_many_attempts', message: 'Muitas tentativas. Faça login novamente.' }, 429, headers);
		}
		return json({ error: 'invalid_code', message: 'Código inválido. Confira o e-mail e tente novamente.' }, 400);
	}
	let newPasswordHash = null;
	if (challenge.purpose === 'reset') {
		const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
		if (newPassword.length < 12 || newPassword.length > 128)
			return json({ error: 'request_invalid', message: 'A nova senha deve ter pelo menos 12 caracteres.' }, 400);
		if (challenge.password_hash === 'reset-request-only')
			return json({ error: 'challenge_expired', message: 'Solicitação inválida ou expirada. Tente novamente.' }, 401);
		newPasswordHash = await hashPassword(newPassword);
	}

	const consumed = await env.DB.prepare('DELETE FROM auth_challenges WHERE id = ? AND code_hash = ? AND expires_at > ? AND attempts < 5 RETURNING email, name, password_hash, purpose')
		.bind(id, challenge.code_hash, now).first();
	if (!consumed) return json({ error: 'challenge_expired', message: 'Sua solicitação expirou. Faça login novamente.' }, 401);

	if (consumed.purpose === 'register') {
		try {
			await env.DB.prepare('INSERT INTO auth_users (email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
				.bind(consumed.email, consumed.name, consumed.password_hash, now, now).run();
		} catch {
			return json({ error: 'account_exists', message: 'Já existe uma conta com este e-mail. Entre com sua senha.' }, 409);
		}
	}
	if (consumed.purpose === 'reset') {
		await env.DB.prepare('UPDATE auth_users SET password_hash = ?, updated_at = ? WHERE email = ? COLLATE NOCASE')
			.bind(newPasswordHash, now, consumed.email).run();
		await env.DB.prepare('DELETE FROM auth_sessions WHERE email = ? COLLATE NOCASE').bind(consumed.email).run();
		const headers = new Headers();
		clearCookie(headers, CHALLENGE_COOKIE);
		return json({ ok: true, passwordReset: true }, 200, headers);
	}

	const sessionToken = randomToken();
	const sessionId = await sha256(sessionToken);
	await env.DB.prepare('INSERT INTO auth_sessions (id, email, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
		.bind(sessionId, consumed.email, now, now + SESSION_TTL, now).run();
	const headers = new Headers();
	clearCookie(headers, CHALLENGE_COOKIE);
	setCookie(headers, SESSION_COOKIE, sessionToken, Math.floor(SESSION_TTL / 1000));
	return json({ ok: true, email: consumed.email, name: consumed.name }, 200, headers);
}

export async function handleAuthRoute(event, env) {
	if (!event.url.pathname.startsWith('/api/auth/')) return null;
	if (event.request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'POST, GET, OPTIONS' } });
	if (event.request.method === 'GET' && event.url.pathname === '/api/auth/status') {
		const user = await getSessionUser(event.request, env);
		return json(user ? { authenticated: true, email: user.email, name: user.name } : { authenticated: false });
	}
	if (event.request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, new Headers({ Allow: 'POST, GET, OPTIONS' }));
	if (!(await requestAllowed(event))) return json({ error: 'forbidden' }, 403);
	if (event.url.pathname === '/api/auth/start') return requestCode(event, env);
	if (event.url.pathname === '/api/auth/verify') return verifyCode(event, env);
	if (event.url.pathname === '/api/auth/logout') return logout(event, env);
	return json({ error: 'not_found' }, 404);
}

export async function getSessionUser(request, env) {
	const token = cookie(request, SESSION_COOKIE);
	if (!token || !env?.DB) return null;
	const id = await sha256(token);
	const now = Date.now();
	const row = await env.DB.prepare(
		'SELECT s.email, u.name, s.expires_at, s.last_seen_at FROM auth_sessions s JOIN auth_users u ON u.email = s.email WHERE s.id = ?'
	).bind(id).first();
	if (!row || row.expires_at <= now) {
		await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(id).run();
		return null;
	}
	if (now - row.last_seen_at > 5 * 60_000)
		await env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').bind(now, id).run();
	return { email: normalizeEmail(row.email), name: row.name };
}

async function logout(event, env) {
	const token = cookie(event.request, SESSION_COOKIE);
	if (token && env?.DB) await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(await sha256(token)).run();
	const headers = new Headers();
	clearCookie(headers, SESSION_COOKIE);
	clearCookie(headers, CHALLENGE_COOKIE);
	return new Response(null, { status: 204, headers });
}

export const sessionCookieName = SESSION_COOKIE;
