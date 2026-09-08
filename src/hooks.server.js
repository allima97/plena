// Gate de autenticação para as rotas /api/*. A proteção de verdade acontece
// no Cloudflare Access (Zero Trust), na frente do domínio inteiro -- isso
// aqui é a camada de defesa extra dentro do próprio Worker: confere o
// crachá (JWT) que o Access injeta em toda requisição autenticada e nunca
// deixa a API responder sem ele. Mesma filosofia do worker.js do nextgoals:
// "fechado por padrão" -- até TEAM_DOMAIN/POLICY_AUD estarem configurados em
// wrangler.jsonc, toda chamada a /api/* recebe 401 e o app cai para o
// localStorage sozinho (ver fetchRemoteState em $lib/fin/persist.js).
import { verifyAccessJWT } from '$lib/server/access.js';

export async function handle({ event, resolve }) {
	if (event.url.pathname.startsWith('/api/')) {
		const env = event.platform?.env;
		const user = env ? await verifyAccessJWT(event.request, env) : null;
		if (!user) {
			return new Response(JSON.stringify({ error: 'unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json; charset=utf-8' }
			});
		}
		event.locals.user = user;
	}
	return resolve(event);
}
