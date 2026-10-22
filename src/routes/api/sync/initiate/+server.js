/**
 * POST /api/sync/initiate
 *
 * Inicia o fluxo de ativação do sync:
 *  1. Verifica se o usuário já tem um link ativo.
 *  2. Verifica se a conta Nextgoals existe (via NEXTGOALS_URL/api/sync/check).
 *  3. Gera um OTP de 6 dígitos e envia por e-mail.
 *
 * Body: {} (nenhum parâmetro necessário — o e-mail vem da sessão)
 *
 * Resposta:
 *   200 { ok: true }       — OTP enviado, aguardar /api/sync/verify
 *   409 { error: '...' }   — já existe link ativo
 *   502 { error: '...' }   — conta Nextgoals não encontrada
 */

import { json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { dataOwner } from '$lib/server/data-owner.js';
import { randomId, randomSyncOtpCode, hashOtp, timingSafeEqual } from '$lib/server/sync.js';

export const prerender = false;

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
const OTP_RATE_LIMIT_MS = 60 * 1000; // 1 OTP por minuto

export async function POST({ locals }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });

  const ngUrl = env.NEXTGOALS_URL;
  const syncSecret = env.SYNC_SECRET;
  if (!ngUrl || !syncSecret) {
    return json({ error: 'Serviço de sync não configurado' }, { status: 503 });
  }

  // 1. Já tem link ativo?
  const existing = await db
    .prepare('SELECT enabled FROM sync_links WHERE plena_user_id = ?')
    .bind(owner)
    .first();
  if (existing && existing.enabled) {
    return json({ error: 'Sync já está ativo para esta conta.' }, { status: 409 });
  }

  // 2. Rate limit: não permite disparar OTP mais de 1x/min
  const now = Date.now();
  const recentOtp = await db
    .prepare(
      'SELECT created_at FROM sync_otps WHERE owner_email = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(owner, now)
    .first();
  if (recentOtp && now - Number(recentOtp.created_at) < OTP_RATE_LIMIT_MS) {
    return json({ error: 'Aguarde 1 minuto antes de solicitar um novo código.' }, { status: 429 });
  }

  // 3. Verifica se a conta Nextgoals existe
  let ngResp;
  try {
    ngResp = await fetch(`${ngUrl}/api/sync/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ user_id: owner }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    return json({ error: 'Não foi possível contactar o Nextgoals. Tente novamente.' }, { status: 502 });
  }

  if (!ngResp.ok) {
    if (ngResp.status === 404) {
      return json(
        { error: 'Conta Nextgoals não encontrada para este e-mail. Crie uma conta em nextgoals.app primeiro.' },
        { status: 404 }
      );
    }
    return json({ error: 'Erro ao verificar conta Nextgoals.' }, { status: 502 });
  }

  // 4. Gera OTP e envia por e-mail
  const code = randomSyncOtpCode();
  const codeHash = await hashOtp(code);
  const otpId = randomId();
  const expiresAt = now + OTP_TTL_MS;

  await db.prepare(
    'INSERT INTO sync_otps (id, owner_email, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).bind(otpId, owner, codeHash, expiresAt, now).run();

  // Envia e-mail usando o mesmo binding de e-mail do Plena
  const email = env.EMAIL;
  const from = env.AUTH_EMAIL_FROM || 'conta@salaonamao.com';
  if (email) {
    try {
      const { EmailMessage } = await import('cloudflare:email');
      const { createMimeMessage } = await import('mimetext');
      const msg = createMimeMessage();
      msg.setSender({ name: 'Plena', addr: from });
      msg.setRecipient(owner);
      msg.setSubject('Código de confirmação — Sincronização Plena ↔ Nextgoals');
      msg.addMessage({
        contentType: 'text/html',
        data: `
<p>Olá,</p>
<p>Você solicitou a sincronização entre o <strong>Plena</strong> e o <strong>Nextgoals</strong>.</p>
<p>Seu código de confirmação é:</p>
<h2 style="letter-spacing:8px;font-size:36px">${code}</h2>
<p>Este código expira em <strong>10 minutos</strong>.</p>
<p>Se não foi você que solicitou, ignore este e-mail.</p>
<p>— Equipe Plena</p>
        `.trim(),
      });
      await email.send(new EmailMessage(from, owner, msg.asRaw()));
    } catch (e) {
      // E-mail falhou, mas não bloqueamos o fluxo — o código foi salvo no DB.
      console.error('[sync/initiate] erro ao enviar e-mail:', e.message);
    }
  }

  return json({ ok: true });
}
