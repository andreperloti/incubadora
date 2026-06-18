# MeuZapDesk

Sistema de atendimento WhatsApp para oficinas mecânicas — SaaS com uma instância Docker por cliente.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| WhatsApp | WAHA Plus (Chrome engine, self-hosted) |
| Painel Web | Next.js 14 + TypeScript (App Router) |
| Banco de dados | PostgreSQL 16 (Docker) |
| Cache / filas | Redis 7 (Docker) |
| Autenticação | NextAuth.js (JWT) + Gravatar |
| Infraestrutura | Docker Compose + PM2 + Nginx |
| Proxy reverso | Nginx |

---

## Requisitos do Servidor (Produção)

> Ambiente testado: GCP VM com Ubuntu 22.04 LTS (x86_64).

### Sistema Operacional
- Ubuntu 22.04 LTS (recomendado) — x86_64
- **Não use ARM** para produção: a imagem Chrome do WAHA não tem build ARM nativo

### Dependências obrigatórias

| Dependência | Versão testada | Por que é necessária |
|-------------|---------------|----------------------|
| **Node.js** | v22.x (via nvm) | Rodar o painel Next.js via PM2 |
| **npm** | v10.x | Instalar dependências |
| **Docker** | v29.x | Rodar PostgreSQL, Redis e WAHA |
| **Docker Compose** | v2.x (plugin) | Orquestrar os containers |
| **PM2** | v6.x | Processo daemon do painel e site |
| **Nginx** | v1.18.x | Proxy reverso (HTTPS + vhosts) |
| **ffmpeg** | v4.4+ | Converter áudio OGG/Opus do WhatsApp para WebM (necessário para reprodução no browser) |

### Instalar dependências no servidor

```bash
# Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# PM2
npm install -g pm2

# Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# (logout + login para aplicar o grupo)

# ffmpeg — necessário para conversão de áudio
sudo apt-get install -y ffmpeg

# Nginx
sudo apt-get install -y nginx
```

### Imagem WAHA — IMPORTANTE

Sempre use a engine **Chrome**. A engine `noweb` **não suporta** sincronização de histórico.

```yaml
# docker-compose.prod.yml
image: perloti/waha-plus:chrome-amd64   # mirror pessoal, sem expiração de credenciais
```

> As credenciais do Docker Hub da devlikeapro expiram. Use sempre a imagem `perloti/waha-plus:chrome-amd64`.

---

## Desenvolvimento Local

**Pré-requisitos:** Docker Desktop + Node.js 22 + ffmpeg.

```bash
# 1. Suba PostgreSQL (5433), Redis (6379) e WAHA (3002)
docker compose -f meuzapdesk/docker-compose.dev.yml up -d

# 2. Configure o ambiente
cp meuzapdesk/panel/.env.local.example meuzapdesk/panel/.env.local
# Edite .env.local se necessário (credenciais já configuradas para dev)

# 3. Instale dependências e gere o Prisma client
npm --prefix meuzapdesk/panel install
npx --prefix meuzapdesk/panel prisma generate

# 4. Aplique o schema inicial no banco dev
docker exec meuzapdesk-postgres-1 psql -U meuzapdesk -d meuzapdesk_dev \
  -f meuzapdesk/deploy/schema.sql

# 5. Rode o painel
npm --prefix meuzapdesk/panel run dev        # http://localhost:3000

# 6. (Opcional) Rode o site de marketing
npm --prefix meuzapdesk/site run dev -- --port 3001   # http://localhost:3001
```

> **ATENÇÃO:** Nunca rode `npm run build` com o dev server ativo. O build sobrescreve
> chunks do cache e o servidor perde o CSS. Se acontecer: `rm -rf meuzapdesk/panel/.next`
> e reinicie o dev server.

### Credenciais de dev

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin (dono) | `admin@teste.com` | `admin123` |
| Mecânico | `mecanico@teste.com` | `mecanico123` |

### Migrations em dev

Prisma CLI não conecta ao banco dentro do Docker a partir do host. Aplique via psql:

```bash
# Aplicar migrations pendentes (mesmo script do deploy)
POSTGRES_DB=meuzapdesk_dev bash meuzapdesk/deploy/migrate.sh

# Ou manualmente:
docker exec meuzapdesk-postgres-1 psql -U meuzapdesk -d meuzapdesk_dev -c "SQL AQUI"
```

---

## Deploy em Produção

O deploy é feito a partir do servidor GCP via script:

```bash
# No servidor (GCP):
bash ~/Documents/meuzapdesk/meuzapdesk/deploy/deploy.sh
```

O script executa automaticamente:
1. `git pull origin main`
2. `npm ci` (painel + site)
3. `prisma generate`
4. `bash migrate.sh` — aplica migrations SQL pendentes
5. `next build` (painel + site)
6. `pm2 restart` dos processos

### Migrations SQL

Ficam em `meuzapdesk/migrations/` e são gerenciadas por `deploy/migrate.sh`:
- Rastreia migrations aplicadas na tabela `_migrations` do banco
- Cada arquivo é executado apenas uma vez (idempotente por design)
- Executadas automaticamente a cada deploy

```
meuzapdesk/migrations/
├── 001_indexes_and_unique.sql   # Índices de performance + unique wa_message_id
├── 002_system_logs.sql          # Tabela de logs do sistema
└── 003_fix_duplicate_wa_message_id.sql  # Limpeza de duplicatas (histórico)
```

Para adicionar uma migration nova:
```bash
# Criar arquivo com próximo número sequencial
vim meuzapdesk/migrations/004_minha_mudanca.sql

# Testar em dev
POSTGRES_DB=meuzapdesk_dev bash meuzapdesk/deploy/migrate.sh

# Commit + push → próximo deploy aplica automaticamente
```

### Configuração de ambiente (produção)

Arquivo: `meuzapdesk/panel/.env.local`

```bash
DATABASE_URL="postgresql://meuzapdesk:SENHA@localhost:5432/meuzapdesk_prod"
NEXTAUTH_URL="https://app.meuzapdesk.com.br"
NEXTAUTH_SECRET="gere-com-openssl-rand-base64-32"

WAHA_API_URL="http://localhost:3002"
WAHA_API_KEY="sua-api-key"
WAHA_WEBHOOK_SECRET="sua-webhook-secret"
WAHA_WEBHOOK_BASE_URL="http://host.docker.internal:3004"  # porta do PM2

ALERT_WARN_MINUTES=5
ALERT_URGENT_MINUTES=15
```

### Infraestrutura PM2

| Processo | Porta | Domínio |
|----------|-------|---------|
| `meuzapdesk-panel` | 3004 | app.meuzapdesk.com.br |
| `meuzapdesk-site` | 3000 | meuzapdesk.com.br |

---

## Estrutura do Repositório

```
meuzapdesk/
├── docker-compose.dev.yml      # Dev: PostgreSQL (5433), Redis (6379), WAHA (3002)
├── docker-compose.prod.yml     # Prod: PostgreSQL (5432), Redis (6379), WAHA (3002)
├── deploy/
│   ├── deploy.sh               # Script de deploy completo
│   ├── migrate.sh              # Aplica migrations SQL pendentes
│   └── schema.sql              # Schema inicial (instalação do zero)
├── migrations/                 # Migrations SQL incrementais
└── panel/                      # Aplicação Next.js
    ├── app/
    │   ├── atendimento/        # Fila + chat (página principal)
    │   ├── dashboard/          # Métricas (OWNER)
    │   ├── admin/              # Usuários, sessão WhatsApp, logs (OWNER)
    │   ├── master/             # Gestão de empresas (SUPER_ADMIN)
    │   └── api/
    │       ├── webhook/whatsapp/  # Webhook WAHA (entrada de mensagens)
    │       ├── conversations/     # CRUD de conversas + paginação
    │       ├── messages/          # Envio de texto, áudio e arquivo
    │       ├── media/             # Proxy de mídia com conversão de áudio
    │       ├── sse/               # Server-Sent Events (tempo real)
    │       └── internal/          # Bot automático
    ├── components/
    │   ├── AudioPlayer.tsx     # Player de áudio estilo WhatsApp
    │   └── LeftNavStrip.tsx    # Barra de navegação lateral
    ├── lib/
    │   ├── db.ts               # Prisma client singleton
    │   ├── whatsapp.ts         # WAHA API helpers + buildSignedMessage
    │   ├── auth.ts             # NextAuth + Gravatar
    │   ├── sse.ts              # Gerenciador SSE em memória
    │   ├── import-queue.ts     # Worker BullMQ para importação de histórico
    │   └── logger.ts           # Logs persistidos em system_logs
    └── prisma/schema.prisma    # Schema do banco
```

---

## Fluxo de Atendimento

1. Cliente envia mensagem → Webhook WAHA → menu automático enviado
2. Cliente escolhe opção (1–4) → conversa entra na fila (`in_queue`)
3. Atendente vê a fila ordenada por tempo de espera (`customerWaitingSince`)
4. Atendente responde → mensagem enviada com assinatura `*Nome (Cargo):*\nmensagem`
5. SLA: alerta amarelo após `ALERT_WARN_MINUTES` min, vermelho após `ALERT_URGENT_MINUTES` min
6. Atendente encerra → status `resolved`

### Importação de histórico

Acesse **Admin → WhatsApp → Sincronizar histórico**:
- Importa as últimas 25 conversas × 25 mensagens por padrão
- "Reimportar" faz importação completa (ignora filtro incremental)
- Paginação no sidebar: "Ver mais conversas antigas" / "Ver mensagens anteriores"
- Áudio e imagens do histórico ficam disponíveis via proxy `/api/media`

### Mensagens enviadas fora do painel

Mensagens enviadas diretamente pelo celular (sem usar o painel) são capturadas automaticamente via evento `message.any` do WAHA e aparecem no chat em tempo real.

---

## Roles

| Role | Acesso |
|------|--------|
| `SUPER_ADMIN` | `/master/*` — gerencia todas as empresas |
| `OWNER` | `/admin/*`, `/dashboard/*`, `/atendimento` |
| `MECHANIC` | `/atendimento` apenas |

---

## Notas Técnicas

### SSE (tempo real)
Os clientes SSE são armazenados em memória por processo. Em implantações multi-instância, migrar para Redis Pub/Sub.

### Áudio
O WhatsApp envia áudios em formato OGG/Opus 16kHz. O Chrome rejeita esse formato diretamente. O proxy `/api/media` converte automaticamente para WebM/Opus 48kHz via `ffmpeg` antes de servir ao browser.

### WAHA Chrome vs NOWEB
| | Chrome | NOWEB |
|--|--------|-------|
| Sync de histórico | ✅ | ❌ |
| Suporte ARM nativo | ❌ | ✅ |
| Uso em produção | ✅ obrigatório | ❌ |
