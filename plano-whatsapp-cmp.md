# Plano: Sistema de Atendimento WhatsApp para Oficina Mecânica (SaaS)

## Contexto

André possui uma oficina com 3 mecânicos que atendem clientes via WhatsApp. O objetivo é criar uma solução de automação que:
- Apresente um menu inicial com 4 opções ao cliente
- Permita que cada mecânico responda identificado por sua assinatura automática
- Gerencie prioridade de atendimento por tempo sem resposta
- Alerte sobre clientes não respondidos
- Seja empacotada para comercialização como SaaS (uma instância Docker por cliente)

---

## Arquitetura Geral

```
Cliente WhatsApp
      │
      ▼
WhatsApp Business API (Meta)
      │  Webhooks
      ▼
n8n (orquestrador de fluxos)  ◄──── Backend API (Node.js/TS)  ◄──── App CMP
      │                                     │                    (Android / iOS / Web)
      ▼                                     ▼
PostgreSQL (dados, filas, histórico)   Redis (sessões, alertas, WebSocket)
      │
      ▼
  Docker Compose (1 stack por cliente SaaS)
```

---

## Stack Tecnológica

| Camada           | Tecnologia                                    |
|------------------|-----------------------------------------------|
| Orquestração     | n8n (self-hosted via Docker)                  |
| WhatsApp         | WhatsApp Business API (Meta/Cloud)            |
| App (UI)         | Compose Multiplatform (Android + iOS + Web)   |
| Backend API      | Node.js + TypeScript (Fastify ou Hono)        |
| Banco de dados   | PostgreSQL                                    |
| Cache / filas    | Redis                                         |
| Autenticação     | JWT (backend) + Kotlinx Serialization         |
| Infraestrutura   | Docker Compose                                |
| Proxy reverso    | Traefik ou Nginx                              |

---

## Componentes e Fluxos

### 1. Fluxo de Entrada (n8n)

Quando o cliente envia uma mensagem nova:
1. Webhook recebe a mensagem da WhatsApp Business API
2. n8n verifica se é uma conversa nova ou existente (lookup no PostgreSQL)
3. **Se novo**: envia menu automático com as 4 opções
4. **Se existente**: roteia para a fila de atendimento humano

**Menu inicial (bot):**
```
Olá! Bem-vindo à [Nome da Oficina]. Como podemos ajudar?

1️⃣ Orçamento — Já sei as peças e serviço
2️⃣ Orçamento — Preciso de diagnóstico
3️⃣ Status do meu serviço
4️⃣ Fornecedores e outros assuntos
```

### 2. Fila de Atendimento com Prioridade

Após o cliente selecionar uma opção, o atendimento entra na fila:
- **Prioridade = tempo sem resposta** (configurável, ex: alerta em 5 min, urgente em 15 min)
- Fila armazenada no PostgreSQL com campo `last_customer_message_at` e `status`
- n8n executa workflow agendado a cada 1 minuto para verificar SLAs

**Estados de uma conversa:**
- `waiting_menu` — aguardando cliente selecionar opção
- `in_queue` — aguardando atendimento humano
- `in_progress` — sendo atendida por um mecânico
- `resolved` — encerrada

### 3. Sistema de Alertas

- n8n workflow agendado (cron a cada 60s) verifica conversas com `status = in_queue`
- Se `last_customer_message_at` > 5 minutos → notificação no app (badge)
- Se > 15 minutos → alerta visual destacado + notificação push
- Limites de tempo configuráveis por cliente/plano SaaS

### 4. App CMP — Compose Multiplatform (Android + iOS + Web)

**Telas:**
- `LoginScreen` — autenticação do mecânico (email + senha)
- `DashboardScreen` — fila de conversas ordenada por prioridade (tempo sem resposta)
- `ChatScreen` — conversa individual com campo de resposta
- `AdminScreen` — gestão de mecânicos e configurações (apenas dono)

**Plataformas:**
- **Android**: app nativo com notificações push (Firebase Cloud Messaging)
- **iOS**: app nativo com notificações push (APNs)
- **Web**: Kotlin/Wasm — acessível pelo browser sem instalação

**Funcionalidade de assinatura:**
- Mecânico faz login → token JWT armazena `userId` e `displayName`
- Ao enviar mensagem, o CMP envia payload para o backend: `{ conversationId, text: "minha mensagem" }`
- O backend adiciona automaticamente o prefixo: `André: minha mensagem` antes de enviar para WA API

**Atualização em tempo real:**
- App CMP conecta via WebSocket ao backend para receber novas mensagens e alertas instantaneamente
- No Web: fallback para SSE caso WebSocket não esteja disponível

### 5. Envio de Respostas (App → Backend → WhatsApp)

Ao mecânico clicar em "Enviar" no app:
1. App faz POST para o backend: `{ conversationId, text: "minha mensagem" }`
2. Backend compõe: `"André: minha mensagem"` e chama a WhatsApp Business API
3. n8n registra a mensagem no PostgreSQL com `sender_id`, `sent_at`

---

## Modelo de Dados (PostgreSQL)

```sql
-- Negócios (multi-tenant por instância, mas útil para SaaS)
businesses (id, name, whatsapp_number, wa_api_token, settings_json)

-- Usuários / Mecânicos
users (id, business_id, name, email, password_hash, role)

-- Conversas com clientes
conversations (
  id, business_id, customer_phone, customer_name,
  status, option_selected, priority_score,
  assigned_user_id, created_at, last_customer_message_at, resolved_at
)

-- Mensagens
messages (
  id, conversation_id, direction (in/out),
  content, sender_user_id, sent_at, wa_message_id
)
```

---

## Estrutura Docker Compose (por cliente)

```yaml
version: "3.9"
services:
  n8n:
    image: n8nio/n8n
    environment:
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
    volumes:
      - n8n_data:/home/node/.n8n

  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://...
      - JWT_SECRET=${SECRET}
      - N8N_WEBHOOK_URL=http://n8n:5678
      - WA_API_TOKEN=${WA_TOKEN}

  postgres:
    image: postgres:16
    volumes:
      - pg_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
```

---

## Modelo SaaS (uma instância por cliente)

- Cada oficina cliente recebe um subdomínio: `oficina-xyz.seudominio.com`
- Script de provisionamento cria nova stack Docker Compose com variáveis do cliente
- Isolamento total: banco, n8n e backend separados por cliente
- Painel administrativo central (separado) para gerenciar clientes/planos

---

## Fases de Desenvolvimento

### Fase 1 — MVP (sua oficina)
1. Configurar conta WhatsApp Business API (Meta for Developers)
2. Subir n8n + PostgreSQL + Redis + backend via Docker Compose
3. Criar workflows n8n: recepção de mensagem, menu automático, envio de resposta
4. Criar backend Node.js: API REST + WebSocket + lógica de assinatura
5. Criar app CMP: login, fila (DashboardScreen), chat (ChatScreen) — começar pelo Android
6. Implementar cron de alertas no n8n + endpoint de alertas no backend

### Fase 2 — Polimento e multiplataforma
7. Adicionar target iOS ao app CMP
8. Adicionar target Web (Kotlin/Wasm) ao app CMP
9. Notificações push (FCM para Android, APNs para iOS)
10. Relatórios básicos (tempo médio de resposta, volume por mecânico)
11. Histórico de conversas por cliente (pelo número)

### Fase 3 — SaaS
12. Script de provisionamento automático de novas instâncias
13. Painel administrativo central (gestão de clientes/planos)
14. Cobrança / planos (integração com Stripe ou Pagar.me)

---

## Estrutura de Repositórios

```
/whatsapp-oficina/
├── docker-compose.yml              # Stack principal
├── .env.example
├── n8n-workflows/                  # Workflows exportados do n8n (JSON)
│   ├── receive-message.json
│   ├── send-reply.json
│   └── alert-cron.json
├── backend/                        # Node.js + TypeScript (Fastify/Hono)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts             # Login, JWT
│   │   │   ├── conversations.ts    # Fila, prioridade
│   │   │   └── messages.ts         # Envio com assinatura
│   │   ├── services/
│   │   │   ├── whatsapp.ts         # Integração WA Business API
│   │   │   └── alerts.ts           # Lógica de SLA / alertas
│   │   └── ws/                     # WebSocket handler
│   └── prisma/schema.prisma
├── app/                            # Compose Multiplatform (Kotlin)
│   ├── androidApp/
│   ├── iosApp/
│   ├── webApp/
│   └── shared/
│       ├── commonMain/
│       │   ├── screens/            # LoginScreen, DashboardScreen, ChatScreen
│       │   ├── viewmodels/
│       │   └── network/            # Ktor client (HTTP + WebSocket)
│       └── ...
└── scripts/
    └── provision-client.sh         # SaaS: cria nova instância
```

**Libs CMP recomendadas:**
- `Ktor` — cliente HTTP e WebSocket multiplataforma
- `Koin` — injeção de dependência multiplataforma
- `Kotlinx Serialization` — parse de JSON
- `Kotlinx Coroutines` — async/Flow
- `Coil` — carregamento de imagens (com suporte CMP)

---

## Verificação (como testar)

1. **Fluxo básico**: Enviar mensagem para o número → receber menu → selecionar opção → verificar que apareceu na fila do app
2. **Assinatura**: Logar como André no app → responder → verificar no WhatsApp do cliente que chegou "André: mensagem"
3. **Prioridade**: Deixar conversa sem resposta por 5 min → verificar alerta no app
4. **Multi-mecânico**: Três logins simultâneos → cada um vê a mesma fila → atribuição correta
5. **n8n workflows**: Testar cada workflow individualmente pelo painel do n8n com payloads de exemplo
