#!/bin/bash
# deploy.sh — Deploy/atualização MeuZapDesk em produção
# Uso: bash deploy.sh
# Pré-requisito: .env.local já configurado em panel/

set -e

REPO_DIR="/home/andreperloti/Documents/meuzapdesk"
PANEL_DIR="$REPO_DIR/meuzapdesk/panel"
SITE_DIR="$REPO_DIR/meuzapdesk/site"
COMPOSE_FILE="$REPO_DIR/meuzapdesk/docker-compose.prod.yml"

echo "==> [1/6] Atualizando código..."
cd "$REPO_DIR"
git pull origin main

echo "==> [2/6] Instalando dependências do panel..."
npm --prefix "$PANEL_DIR" ci

echo "==> [3/6] Instalando dependências do site..."
npm --prefix "$SITE_DIR" ci

echo "==> [3b/6] Regenerando Prisma client..."
(cd "$PANEL_DIR" && npx prisma generate)

echo "==> [4/6] Build do panel..."
npm --prefix "$PANEL_DIR" run build

echo "==> [5/6] Build do site..."
npm --prefix "$SITE_DIR" run build

echo "==> [6/6] Reiniciando processos PM2..."
source "$HOME/.nvm/nvm.sh"
pm2 restart meuzapdesk-panel meuzapdesk-site 2>/dev/null || true

echo ""
echo "Deploy concluído."
pm2 list
