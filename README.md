# MeuZapDesk

Sistema de atendimento WhatsApp para oficinas mecânicas — SaaS com uma instância Docker por cliente.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| WhatsApp | WAHA (WhatsApp HTTP API, self-hosted) |
| Painel Web | Next.js 14 + TypeScript (App Router) |
| Banco de dados | PostgreSQL 16 |
| Cache / sessões | Redis 7 |
| Autenticação | NextAuth.js (JWT) + Gravatar |
| Infraestrutura | Docker Compose |
| Proxy | Nginx |

## Estrutura

```
meuzapdesk/
├── docker-compose.yml          # Stack de produção
├── docker-compose.dev.yml      # Dev local: PostgreSQL (5433), Redis (6379), WAHA (3002)
├── .env.example                # Variáveis de ambiente (copiar para .env)
├── nginx.conf                  # Configuração do proxy reverso
├── n8n-workflows/              # Workflows exportados do n8n
│   ├── receive-message.json    # Recepção de mensagem + menu automático
│   ├── send-reply.json         # Envio de resposta
│   └── alert-cron.json         # Cron de alertas de SLA (a cada 1 min)
└── panel/                      # Aplicação Next.js
    ├── app/
    │   ├── (auth)/login/       # Tela de login
    │   ├── atendimento/        # Fila + chat de atendimento (página principal)
    │   ├── dashboard/          # Métricas e relatórios (OWNER)
    │   ├── admin/
    │   │   ├── users/          # Gestão de usuários (OWNER)
    │   │   └── whatsapp/       # Configuração da sessão WAHA (OWNER)
    │   └── api/
    │       ├── auth/           # NextAuth
    │       ├── conversations/  # CRUD de conversas
    │       ├── messages/       # Envio de mensagens com assinatura
    │       ├── sse/            # Server-Sent Events (tempo real)
    │       └── webhook/whatsapp/ # Webhook do WAHA
    ├── components/
    │   └── LeftNavStrip.tsx    # Barra de navegação lateral (estilo WhatsApp)
    ├── lib/
    │   ├── db.ts               # Prisma client
    │   ├── whatsapp.ts         # Helper WAHA API + buildSignedMessage
    │   ├── auth.ts             # NextAuth + Gravatar
    │   └── sse.ts              # Gerenciador SSE
    └── prisma/schema.prisma    # Schema do banco
```

## Desenvolvimento Local

**Pré-requisito:** Docker Desktop rodando.

### 1. Suba o banco, Redis e WAHA

```bash
cd meuzapdesk
docker compose -f docker-compose.dev.yml up -d
```

### 2. Configure o ambiente do painel

```bash
cd panel
cp .env.local.example .env.local
# Edite .env.local se necessário (credenciais já configuradas para dev)
```

### 3. Instale dependências e inicialize o banco

```bash
npm install
npx prisma generate
# Aplicar migrations via psql (Prisma CLI não conecta direto ao container):
docker exec meuzapdesk-postgres-1 psql -U meuzapdesk -d meuzapdesk_dev -f prisma/migrations/...
npx prisma db seed          # cria usuários de teste
```

### 4. Rode o painel

```bash
npm run dev
```

> **ATENÇÃO:** Nunca rode `npm run build` com o dev server ativo. O build sobrescreve chunks do cache e
> o servidor perde o CSS. Se isso acontecer: `rm -rf .next` e reinicie o dev server.

Acesse [http://localhost:3000](http://localhost:3000) e faça login com:

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin (dono) | `admin@teste.com` | `admin123` |
| Mecânico | `mecanico@teste.com` | `mecanico123` |

---

## Interface

### Navegação lateral (estilo WhatsApp)
A barra de navegação fica na lateral esquerda (62px), com ícones para:
- **Atendimento** — fila de conversas + chat
- **Métricas** — dashboard (OWNER)
- **Admin** — usuários e sessão WhatsApp (OWNER)

O avatar do usuário usa Gravatar com fallback para iniciais do nome.

### Chat (tema escuro)
O chat usa a paleta do WhatsApp Web no tema escuro:

| Elemento | Cor |
|----------|-----|
| Fundo do chat | `#0b141a` |
| Bolha recebida | `#202c33` |
| Bolha enviada | `#005c4b` |
| Texto das bolhas | `#e9edef` |
| Nome do remetente | `#53bdeb` (azul) |

### Assinatura de mensagens
Mensagens enviadas por atendentes chegam ao cliente com o nome em negrito:

```
*André (Admin):*
Que horas você pode vir?
```

---

## Fluxo de Atendimento

1. Cliente envia mensagem → Webhook WAHA recebe → menu automático enviado
2. Cliente escolhe opção (1-4) → conversa entra na fila (`in_queue`)
3. Mecânico vê a fila no painel, ordenada por `customerWaitingSince` (tempo que o cliente espera por humano)
4. Mecânico abre a conversa e responde → mensagem enviada com assinatura (`*Nome:*\nmensagem`)
5. Se conversa ficar sem resposta por 5+ min → alerta amarelo no painel
6. Se 15+ min → alerta vermelho urgente
7. Mecânico encerra a conversa → status `resolved`

### Lógica da fila (`customerWaitingSince`)

A posição na fila é determinada pelo campo `customerWaitingSince`, que representa o momento em que o cliente **começou a esperar por um atendente humano**:

- **Preservado** quando o cliente manda mensagens de acompanhamento ou o bot responde automaticamente
- **Resetado para `null`** quando um humano responde (conversa saiu da fila)
- **Renovado** quando o cliente envia nova mensagem após ter sido atendido

Isso garante que um cliente não perca sua posição na fila por causa de respostas automáticas do bot.

---

## Início Rápido (Produção)

### 1. Configure as variáveis de ambiente

```bash
cp meuzapdesk/.env.example meuzapdesk/.env
# Edite .env com suas credenciais
```

### 2. Suba o stack

```bash
cd meuzapdesk
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
    data: {
      name: 'Minha Oficina',
      whatsappNumber: '5511999999999',
      wahaSession: 'minha-sessao'
    }
  });
  await prisma.user.create({
    data: { businessId: biz.id, name: 'André', email: 'andre@oficina.com', passwordHash: hash, role: 'OWNER' }
  });
  console.log('Usuário criado!');
}
main().finally(() => prisma.\$disconnect());
"
```

### 5. Configure o Webhook no WAHA

- URL: `https://painel.seudominio.com/api/webhook/whatsapp?secret=SEU_WAHA_WEBHOOK_SECRET`
- Configure via painel WAHA em `https://waha.seudominio.com`

### 6. (Opcional) Importe os workflows no n8n

Acesse o painel n8n e importe os arquivos de `n8n-workflows/`.

---

## Roles

| Role | Permissões |
|------|-----------|
| `OWNER` | Acessa tudo: atendimento, métricas, admin, sessão WhatsApp |
| `MECHANIC` | Acessa apenas fila e chat de atendimento |

O middleware em `panel/middleware.ts` protege as rotas por role.
