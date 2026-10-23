#!/usr/bin/env bash
# =============================================================================
# sync_deploy.sh — Finaliza a configuração de sync Plena <-> Nextgoals
# Execute: bash ~/Documents/GitHub/plena/scripts/sync_deploy.sh
# =============================================================================
set -euo pipefail

PLENA_DIR="$HOME/Documents/GitHub/plena"
NEXTGOALS_DIR="$HOME/Documents/GitHub/nextgoals"

echo ""
echo "======================================================="
echo "  Deploy final: sync Plena <-> Nextgoals"
echo "======================================================="
echo ""

# 1. Descobrir account subdomain via wrangler whoami
echo ">> Descobrindo account subdomain no Cloudflare..."
cd "$PLENA_DIR"
WHOAMI=$(npx wrangler whoami 2>&1 || true)
SUBDOMAIN=$(echo "$WHOAMI" | grep -oE 'https://[a-z0-9-]+\.workers\.dev' | head -1 | sed -E 's|https://||;s|\.workers\.dev||')
if [ -z "$SUBDOMAIN" ]; then
  SUBDOMAIN=$(echo "$WHOAMI" | grep -iE 'subdomain[^:]*:[[:space:]]*([a-z0-9-]+)' | grep -oE '[a-z0-9-]+$' | head -1)
fi

if [ -z "$SUBDOMAIN" ]; then
  echo ""
  echo "Nao consegui detectar o subdomain automaticamente."
  echo "Verifique em: https://dash.cloudflare.com -> Workers"
  echo "Exemplo: se a URL e 'plena.meuconta.workers.dev', o subdomain e 'meuconta'"
  echo ""
  read -p "Digite seu workers.dev subdomain: " SUBDOMAIN
fi

PLENA_URL="https://plena.${SUBDOMAIN}.workers.dev"
NEXTGOALS_URL="https://nextgoals.${SUBDOMAIN}.workers.dev"

echo "   Plena URL:     $PLENA_URL"
echo "   Nextgoals URL: $NEXTGOALS_URL"
echo ""

# 2. Atualizar wrangler configs
echo ">> Atualizando wrangler.jsonc (Plena)..."
cd "$PLENA_DIR"
python3 - <<PYEOF
import re, sys
with open('wrangler.jsonc', 'r') as f: s = f.read()
s2 = re.sub(r'"NEXTGOALS_URL":\s*"[^"]*"', '"NEXTGOALS_URL": "$NEXTGOALS_URL"', s)
assert s != s2, 'NEXTGOALS_URL nao encontrada'
with open('wrangler.jsonc', 'w') as f: f.write(s2)
print('   OK')
PYEOF

echo ">> Atualizando wrangler.toml (Nextgoals)..."
cd "$NEXTGOALS_DIR"
python3 - <<PYEOF
import re, sys
with open('wrangler.toml', 'r') as f: s = f.read()
s2 = re.sub(r'PLENA_URL\s*=\s*"[^"]*"', 'PLENA_URL = "$PLENA_URL"', s)
assert s != s2, 'PLENA_URL nao encontrada'
with open('wrangler.toml', 'w') as f: f.write(s2)
print('   OK')
PYEOF

# 3. Aplicar migrations D1
echo ""
echo ">> Aplicando migration D1 - Plena (plena-db)..."
cd "$PLENA_DIR"
npx wrangler d1 migrations apply plena-db --remote

echo ""
echo ">> Aplicando migration D1 - Nextgoals (rumo-financeiro-db)..."
cd "$NEXTGOALS_DIR"
npx wrangler d1 execute rumo-financeiro-db \
  --file=migrations/0001_sync_registrations.sql \
  --remote

# 4. Commit dos configs
echo ""
echo ">> Commitando URLs preenchidas..."
cd "$PLENA_DIR"
git add wrangler.jsonc
git commit -m "chore: preenche NEXTGOALS_URL no wrangler.jsonc

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H86pcqAKeXYEmPSAWsapNr"

cd "$NEXTGOALS_DIR"
git add wrangler.toml
git commit -m "chore: preenche PLENA_URL no wrangler.toml

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H86pcqAKeXYEmPSAWsapNr"

# 5. Git push
echo ""
echo ">> git push..."
cd "$PLENA_DIR" && git push origin main
cd "$NEXTGOALS_DIR" && git push origin main

# 6. Deploy workers
echo ""
echo ">> Deploy Plena..."
cd "$PLENA_DIR" && npx wrangler deploy

echo ""
echo ">> Deploy Nextgoals..."
cd "$NEXTGOALS_DIR" && npx wrangler deploy

echo ""
echo "======================================================="
echo "  PRONTO!"
echo "  Plena:     $PLENA_URL"
echo "  Nextgoals: $NEXTGOALS_URL"
echo ""
echo "  Abra o Nextgoals > engrenagem (ao lado de 'Sair')"
echo "  > Integracao com Plena > informe o e-mail Plena"
echo "  > confirme o OTP recebido por e-mail."
echo "======================================================="
