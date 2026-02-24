#!/usr/bin/env bash
# ============================================================
# MeuZapDesk — Script de Provisionamento de Novo Cliente (SaaS)
# Uso: ./provision-client.sh [nome-slug] [email-admin] [senha-admin]
# Exemplo: ./provision-client.sh oficina-xyz admin@oficina.com Senha@123
# ============================================================

set -e

SLUG="${1:?Informe o slug do cliente (ex: oficina-xyz)}"
ADMIN_EMAIL="${2:?Informe o e-mail do admin}"
ADMIN_PASS="${3:?Informe a senha do admin}"

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="/opt/meuzapdesk/clients/${SLUG}"

echo "🚀 Provisionando cliente: ${SLUG}"
echo "   Diretório: ${CLIENT_DIR}"

# --- 1. Cria diretório isolado do cliente ---
mkdir -p "${CLIENT_DIR}"
cp -r "${BASE_DIR}/." "${CLIENT_DIR}/"

# --- 2. Gera segredos únicos ---
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
N8N_PASSWORD=$(openssl rand -base64 16 | tr -d '/+=')
NEXTAUTH_SECRET=$(openssl rand -base64 32)
WA_VERIFY_TOKEN=$(openssl rand -hex 20)

# --- 3. Cria .env específico do cliente ---
cat > "${CLIENT_DIR}/.env" << EOF
# Cliente: ${SLUG}
# Criado em: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

POSTGRES_DB=meuzapdesk_${SLUG//-/_}
POSTGRES_USER=mzd_${SLUG//-/_}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

N8N_USER=admin
N8N_PASSWORD=${N8N_PASSWORD}
N8N_HOST=n8n.${SLUG}.seudominio.com
N8N_PROTOCOL=https
N8N_WEBHOOK_URL=https://n8n.${SLUG}.seudominio.com

NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://painel.${SLUG}.seudominio.com

WA_PHONE_NUMBER_ID=PREENCHER
WA_ACCESS_TOKEN=PREENCHER
WA_VERIFY_TOKEN=${WA_VERIFY_TOKEN}

ALERT_WARN_MINUTES=5
ALERT_URGENT_MINUTES=15
EOF

echo "✅ .env gerado"

# --- 4. Sobe o stack Docker Compose ---
cd "${CLIENT_DIR}"
docker compose --env-file .env up -d --build

echo "⏳ Aguardando PostgreSQL ficar pronto..."
sleep 15

# --- 5. Executa migrations do Prisma ---
docker compose exec nextjs npx prisma migrate deploy

echo "✅ Migrations executadas"

# --- 6. Cria usuário admin inicial ---
HASHED_PASS=$(docker compose exec -T nextjs node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync('${ADMIN_PASS}', 12));
")

docker compose exec -T postgres psql \
  -U "mzd_${SLUG//-/_}" \
  -d "meuzapdesk_${SLUG//-/_}" \
  -c "
    INSERT INTO businesses (name, whatsapp_number, wa_api_token, wa_phone_number_id)
    VALUES ('${SLUG}', 'PREENCHER', 'PREENCHER', 'PREENCHER')
    RETURNING id;
  "

BUSINESS_ID=$(docker compose exec -T postgres psql \
  -U "mzd_${SLUG//-/_}" \
  -d "meuzapdesk_${SLUG//-/_}" \
  -tAc "SELECT id FROM businesses WHERE name='${SLUG}' LIMIT 1")

docker compose exec -T postgres psql \
  -U "mzd_${SLUG//-/_}" \
  -d "meuzapdesk_${SLUG//-/_}" \
  -c "
    INSERT INTO users (business_id, name, email, password_hash, role)
    VALUES (${BUSINESS_ID}, 'Administrador', '${ADMIN_EMAIL}', '${HASHED_PASS}', 'OWNER');
  "

echo ""
echo "============================================"
echo "✅ Cliente '${SLUG}' provisionado com sucesso!"
echo ""
echo "  Painel:  https://painel.${SLUG}.seudominio.com"
echo "  n8n:     https://n8n.${SLUG}.seudominio.com"
echo "  Login:   ${ADMIN_EMAIL}"
echo "  n8n pw:  ${N8N_PASSWORD}"
echo ""
echo "  IMPORTANTE: Preencha WA_PHONE_NUMBER_ID e WA_ACCESS_TOKEN no .env"
echo "  e reinicie com: docker compose --env-file .env up -d"
echo "============================================"
