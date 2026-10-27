#!/bin/bash
set -e

echo "=== Deploy plena ==="

echo "Limpando build antigo..."
rm -rf .svelte-kit/output 2>/dev/null || true

# Se node_modules estiver incompleto (< 100 entradas), limpa e reinstala
NM_COUNT=$(ls node_modules 2>/dev/null | wc -l || echo 0)
if [ "$NM_COUNT" -lt 100 ]; then
  echo "node_modules incompleto ($NM_COUNT entradas). Reinstalando..."
  rm -rf node_modules
fi

echo "Instalando dependências..."
npm install

echo "Fazendo build..."
npm run build

echo "Fazendo deploy para Cloudflare..."
npx wrangler deploy

npx wrangler r2 bucket create plena-backups 2>/dev/null || true

echo "Fazendo deploy do backup automático (cron R2)..."
cd plena-backup-cron && npx wrangler deploy && cd ..

echo "=== plena deploy OK ==="
