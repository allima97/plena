/**
 * POST /api/sync/m2m/initiate
 *
 * Endpoint machine-to-machine chamado pelo Nextgoals para iniciar o fluxo OTP
 * no Plena em nome do usuário (mesmo e-mail nos dois sistemas).
 *
 * Auth : Authorization: Bearer <SYNC_SECRET>
 * Body : { user_id: "email@do.usuario" }
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { randomId, randomSyncOtpCode, hashOtp } from '$lib/server/sync.js';

export const prerender = false;

const OTP_TTL_MS        = 10 * 60 * 1000;
const OTP_RATE_LIMIT_MS = 60 * 1000;

function verifySyncSecret(request) {
  const auth   = request.headers.get('Authorization') || '';
  const token  = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = env.SYNC_SECRET;
  if (!secret || !token) return false;
  if (token.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST({ request }) {
  if (!verifySyncSecret(request)) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }

  const owner = typeof body?.user_id === 'string' ? body.user_id.toLowerCase().trim() : '';
  if (!owner) return json({ error: 'user_id é obrigatório.' }, { status: 400 });

  // Verifica se o usuário tem conta no Plena
  const plenaUser = await db
    .prepare('SELECT email FROM users WHERE email = ?')
    .bind(owner)
    .first()
    .catch(() => null);
  if (!plenaUser) {
    return json({ error: 'Conta Plena não encontrada para este e-mail.' }, { status: 404 });
  }

  // Já tem link ativo?
  const existing = await db
    .prepare('SELECT enabled FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first()
    .catch(() => null);
  if (existing?.enabled) {
    return json({ error: 'Sync já está ativo para esta conta.' }, { status: 409 });
  }

  // Rate limit: 1 OTP por minuto
  const now = Date.now();
  const recentOtp = await db
    .prepare(
      'SELECT created_at FROM sync_otps ' +
      'WHERE owner_email = ? AND used = 0 AND expires_at > ? ' +
      'ORDER BY created_at DESC LIMIT 1'
    )
    .bind(owner, now)
    .first()
    .catch(() => null);
  if (recentOtp && now - Number(recentOtp.created_at) < OTP_RATE_LIMIT_MS) {
    return json({ error: 'Aguarde 1 minuto antes de solicitar um novo código.' }, { status: 429 });
  }

  // Gera OTP
  const code      = randomSyncOtpCode();
  const codeHash  = await hashOtp(code);
  const otpId     = randomId();
  const expiresAt = now + OTP_TTL_MS;

  await db
    .prepare(
      'INSERT INTO sync_otps (id, owner_email, code_hash, expires_at, used, created_at) ' +
      'VALUES (?, ?, ?, ?, 0, ?)'
    )
    .bind(otpId, owner, codeHash, expiresAt, now)
    .run();

  // Envia e-mail (best-effort)
  const emailBinding = env.EMAIL;
  const from = env.AUTH_EMAIL_FROM || 'conta@salaonamao.com';
  if (emailBinding) {
    try {
      const { EmailMessage }      = await import('cloudflare:email');
      const { createMimeMessage } = await import('mimetext');
      const msg = createMimeMessage();
      msg.setSender({ name: 'Plena', addr: from });
      msg.setRecipient(owner);
      msg.setSubject('Código de confirmação — Sincronização Plena ↔ Nextgoals');
      msg.addMessage({
        contentType: 'text/html',
        data: [
          '<p>Olá,</p>',
          '<p>Você solicitou a sincronização entre o <strong>Plena</strong> e o <strong>Nextgoals</strong>.</p>',
          '<p>Seu código de confirmação é:</p>',
          '<h2 style="letter-spacing:8px;font-size:36px;font-family:monospace">' + code + '</h2>',
          '<p>Este código expira em <strong>10 minutos</strong>.</p>',
          '<p>Se não foi você que solicitou, ignore este e-mail.</p>',
          '<p>— Equipe Plena</p>',
        ].join(''),
      });
      await emailBinding.send(new EmailMessage(from, owner, msg.asRaw()));
    } catch (e) {
      console.error('[sync/m2m/initiate] erro ao enviar e-mail:', e?.message);
    }
  }

  return json({ ok: true });
}
