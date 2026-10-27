/**
 * plena-backup-cron — Worker de backup automático do Plena.
 *
 * Roda diariamente às 06:00 UTC via Cloudflare Cron Trigger.
 * Exporta todos os documentos do D1 (plena-db) para R2 (plena-backups)
 * com retenção de 30 dias.
 *
 * Deploy: npx wrangler deploy  (a partir da pasta plena-backup-cron/)
 * Bucket:  npx wrangler r2 bucket create plena-backups  (apenas 1ª vez)
 */

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runBackup(env));
  },
};

async function runBackup(env) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const key = `backups/${today}.json`;

  // Evita duplicar se o cron disparar mais de uma vez no mesmo dia
  const existing = await env.BACKUPS.head(key);
  if (existing) {
    console.log(`[backup] ${key} já existe — ignorando.`);
    return;
  }

  // Exporta tudo do D1
  const [docs, users, consents] = await Promise.all([
    env.DB.prepare(
      'SELECT owner_email, collection, id, data, updated_at FROM documents ORDER BY owner_email, collection, id'
    ).all(),
    env.DB.prepare(
      'SELECT email, name, created_at, updated_at FROM auth_users'
    ).all(),
    env.DB.prepare(
      'SELECT owner, purpose, version, accepted_at, revoked_at FROM privacy_consents'
    ).all(),
  ]);

  const payload = {
    backupAt: new Date().toISOString(),
    version: 1,
    app: 'plena',
    documents: docs.results.map((r) => ({ ...r, data: JSON.parse(r.data) })),
    users: users.results,
    consents: consents.results,
  };

  await env.BACKUPS.put(key, JSON.stringify(payload), {
    httpMetadata: { contentType: 'application/json' },
  });

  console.log(`[backup] ${key} salvo (${docs.results.length} docs, ${users.results.length} users).`);

  // Mantém apenas os 30 backups mais recentes
  const list = await env.BACKUPS.list({ prefix: 'backups/' });
  const sorted = [...list.objects].sort((a, b) => a.key.localeCompare(b.key));
  if (sorted.length > 30) {
    const toDelete = sorted.slice(0, sorted.length - 30);
    await Promise.all(toDelete.map((obj) => env.BACKUPS.delete(obj.key)));
    console.log(`[backup] Removidos ${toDelete.length} backups antigos.`);
  }
}
