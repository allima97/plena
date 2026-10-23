import { rateLimit, reserveMonthlyEmail } from '$lib/server/auth.js';
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
import { randomId, randomSyncOtpCode, hashOtp, nextgoalsFetch } from '$lib/server/sync.js';

export const prerender = false;

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos

export async function POST({ locals, request }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 não configurado' }, { status: 503 });
  const owner = dataOwner(locals);
  if (!owner) return json({ error: 'unauthorized' }, { status: 401 });
  const consent = await request.json().catch(() => null);
  if (consent?.confirm !== true) return json({ error:'Confirme o compartilhamento antes de ativar a integração.' }, { status:400 });

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

  // 2. Rate limit atômico (upsert em statement único): 1 OTP/min por usuário.
  // É a ÚNICA fonte de verdade do limite — um SELECT separado aqui seria uma
  // condição de corrida (TOCTOU) e deixaria requisições simultâneas passarem juntas.
  const now = Date.now();
  if (!(await rateLimit(db, 'sync-start:' + await hashOtp('rate', owner, env.AUTH_SECRET || env.SYNC_SECRET), 1, 60_000))) return json({error:'Aguarde 1 minuto antes de solicitar outro código.'}, {status:429});
  await db.prepare('DELETE FROM sync_otps WHERE expires_at <= ? OR used = 1').bind(now).run();

  // 3. Verifica se a conta Nextgoals existe
  let ngResp;
  try {
    ngResp = await nextgoalsFetch(env, '/api/sync/check', {
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
        { error: 'Conta Nextgoals não encontrada para este e-mail. Acesse o NextGoals com o mesmo e-mail primeiro.' },
        { status: 404 }
      );
    }
    return json({ error: 'Erro ao verificar conta Nextgoals.' }, { status: 502 });
  }

  if (!(await reserveMonthlyEmail(db))) return json({error:'O limite mensal de envio de códigos foi atingido.'}, {status:429});

  // 4. Gera OTP e envia por e-mail
  const code = randomSyncOtpCode();
  const codeHash = await hashOtp(code, owner, env.AUTH_SECRET || env.SYNC_SECRET);
  const otpId = randomId();
  const expiresAt = now + OTP_TTL_MS;

  await db.prepare(
    'INSERT INTO sync_otps (id, owner_email, code_hash, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).bind(otpId, owner, codeHash, expiresAt, now).run();

  try {
    if (!env.EMAIL || !env.AUTH_EMAIL_FROM) throw new Error('email_unavailable');
    await env.EMAIL.send({
      to: owner, from: env.AUTH_EMAIL_FROM,
      subject: 'Código de confirmação — Sincronização Plena ↔ NextGoals',
      text: `Seu código para ativar a sincronização entre Plena e NextGoals é ${code}. Expira em 10 minutos. Se você não solicitou, ignore esta mensagem.`,
      html: `<p>Confirme a sincronização entre Plena e NextGoals:</p><h2 style="letter-spacing:8px">${code}</h2><p>Expira em 10 minutos. Se você não solicitou, ignore esta mensagem.</p>`,
    });
  } catch (e) {
    await db.prepare('DELETE FROM sync_otps WHERE id = ?').bind(otpId).run();
    console.error('[sync/initiate] email delivery failed');
    return json({ error: 'Não foi possível enviar o código por e-mail. Tente novamente.' }, { status: 502 });
  }
  return json({ ok: true });
}
