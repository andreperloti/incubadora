# MeuZapDesk

Sistema de atendimento WhatsApp para oficinas mecânicas — SaaS com uma instância Docker por cliente.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Orquestração | n8n (self-hosted) |
| WhatsApp | WhatsApp Business API (Meta Cloud) |
| Painel Web | Next.js 14 + TypeScript (App Router) |
| Banco de dados | PostgreSQL 16 |
| Cache / sessões | Redis 7 |
| Autenticação | NextAuth.js (JWT) |
| Infraestrutura | Docker Compose |
| Proxy | Nginx |

## Estrutura

```
meuzapdesk/
├── docker-compose.yml          # Stack principal
├── .env.example                # Variáveis de ambiente (copiar para .env)
├── nginx.conf                  # Configuração do proxy reverso
├── n8n-workflows/              # Workflows exportados do n8n
│   ├── receive-message.json    # Recepção de mensagem + menu automático
│   ├── send-reply.json         # Envio de resposta via n8n
│   └── alert-cron.json         # Cron de alertas de SLA (a cada 1 min)
├── panel/                      # Aplicação Next.js
│   ├── app/
│   │   ├── (auth)/login/       # Tela de login
│   │   ├── dashboard/          # Fila de atendimento
│   │   ├── chat/[id]/          # Conversa individual
│   │   └── api/
│   │       ├── auth/           # NextAuth
│   │       ├── conversations/  # CRUD de conversas
│   │       ├── messages/       # Envio de mensagens
│   │       ├── sse/            # Server-Sent Events (tempo real)
│   │       └── webhook/whatsapp/ # Webhook da Meta
│   ├── lib/
│   │   ├── db.ts               # Prisma client
│   │   ├── whatsapp.ts         # Helper WhatsApp API
│   │   ├── auth.ts             # Configuração NextAuth
│   │   └── sse.ts              # Gerenciador SSE
│   └── prisma/schema.prisma    # Schema do banco
└── scripts/
    └── provision-client.sh     # Provisionamento SaaS
```

## Início Rápido (MVP)

### 1. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

### 2. Suba o stack

```bash
docker compose --env-file .env up -d --build
```

### 3. Execute as migrations

```bash
docker compose exec nextjs npx prisma migrate deploy
```

### 4. Crie o primeiro usuário (admin)

```bash
docker compose exec nextjs node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('SuaSenha123', 12);
  const biz = await prisma.business.create({
    data: { name: 'Minha Oficina', whatsappNumber: '5511999999999', waApiToken: 'SEU_TOKEN', waPhoneNumberId: 'SEU_ID' }
  });
  await prisma.user.create({
    data: { businessId: biz.id, name: 'André', email: 'andre@oficina.com', passwordHash: hash, role: 'OWNER' }
  });
  console.log('Usuário criado!');
}
main().finally(() => prisma.\$disconnect());
"
```

### 5. Configure o Webhook no Meta for Developers

- URL: `https://painel.seudominio.com/api/webhook/whatsapp`
- Verify Token: valor de `WA_VERIFY_TOKEN` no `.env`
- Assine o evento: `messages`

### 6. Importe os workflows no n8n

Acesse `https://n8n.seudominio.com` e importe os arquivos de `n8n-workflows/`.

## Provisionamento SaaS

Para criar uma nova instância de cliente:

```bash
./scripts/provision-client.sh oficina-xyz admin@oficina.com SenhaSegura123
```

## Fluxo de Atendimento

1. Cliente envia mensagem → Webhook recebe → menu automático enviado
2. Cliente escolhe opção (1-4) → conversa entra na fila (`in_queue`)
3. Mecânico vê a fila no painel, ordenada por tempo sem resposta
4. Mecânico abre a conversa e responde → mensagem enviada com assinatura automática (`André: texto`)
5. Se conversa ficar sem resposta por 5+ min → alerta amarelo no painel
6. Se 15+ min → alerta vermelho urgente
7. Mecânico encerra a conversa → status `resolved`
