# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**MeuZapDesk** — WhatsApp customer service panel for auto-repair shops, packaged as SaaS (one Docker instance per client). The main application is in `meuzapdesk/panel/` (Next.js 14).

## Common Commands

```bash
# Start dev infrastructure (PostgreSQL:5433, Redis:6379, WAHA:3002)
docker compose -f meuzapdesk/docker-compose.dev.yml up -d

# Start panel (port 3000)
npm --prefix meuzapdesk/panel run dev

# Start marketing site (port 3001)
npm --prefix meuzapdesk/site run dev -- --port 3001

# Regenerate Prisma client after schema changes
npx --prefix meuzapdesk/panel prisma generate

# Apply raw SQL to the dev database (Prisma Migrate does not connect from host)
docker exec meuzapdesk-postgres-1 psql -U meuzapdesk -d meuzapdesk_dev -c "SQL HERE"
```

> **CRITICAL:** Never run `npm run build` while the dev server is active. The build overwrites chunks referenced by the dev server, corrupting the cache (symptom: CSS disappears). Fix: `rm -rf meuzapdesk/panel/.next` then restart the dev server.

## Architecture

### Tech stack
- **Next.js 14 App Router** — Server Components fetch data; Client Components handle interaction
- **Prisma + PostgreSQL** — ORM with schema at `meuzapdesk/panel/prisma/schema.prisma`
- **WAHA** (WhatsApp HTTP API, self-hosted) — replaces Meta Cloud API; runs on port 3002 in dev
- **Redis** — available but currently used only by SSE (in-memory per process in dev)
- **NextAuth.js** — JWT strategy; session contains `id`, `role`, `businessId`, `businessName`, `image`

### Multi-tenancy
Each `Business` has a `wahaSession` string (the WAHA session name). All Prisma queries are scoped by `businessId` extracted from the session token. The webhook route resolves the business by matching `body.session` against `wahaSession`.

### Real-time updates (SSE)
`lib/sse.ts` maintains an in-memory Map of connected clients per process. The webhook and the messages API call `broadcastToBusinessClients(businessId, payload)` after DB writes. The client (`AtendimentoClient.tsx`) connects to `/api/sse` on mount and listens for `new_message` events to update the conversation list and chat in real time.

> SSE clients are stored in-memory per process — not compatible with multi-instance deployments. For production scale, this must be migrated to Redis Pub/Sub.

### Message flow

**Inbound (customer → panel):**
1. WAHA POST → `/api/webhook/whatsapp?secret=...`
2. Webhook finds the Business by session name, finds or creates the Conversation
3. Saves the Message to DB, broadcasts SSE
4. If new conversation: sends welcome menu via WAHA
5. If customer selected an option (1–4): sends auto-reply, moves status to `in_queue`

**Outbound (agent → customer):**
1. Agent POST → `/api/messages` with `{ conversationId, message }`
2. API wraps text with `buildSignedMessage(name, text)` → `*Name:*\nmessage`
3. Sends via `sendWhatsAppMessage()` (WAHA `POST /api/sendText`)
4. Saves to DB, sets `customerWaitingSince: null`, broadcasts SSE

### Queue ordering (`customerWaitingSince`)
The sidebar sorts active conversations by `customerWaitingSince ASC` (NULLs last). This field:
- Is set when a new conversation is created or when a customer messages after a human already responded
- Is **preserved** when the customer sends follow-up messages or the bot replies (so queue position is not lost)
- Is reset to `null` when a human agent sends a message

### Authorization
`middleware.ts` uses `withAuth` from NextAuth:
- `/admin/*` → OWNER only (redirects to `/atendimento`)
- `/dashboard/*` → OWNER only
- All other protected routes → any authenticated user

### Outgoing message format
`buildSignedMessage` in `lib/whatsapp.ts` produces:
```
*André (Admin):*
message text here
```
The UI parser in `AtendimentoClient.tsx` detects messages starting with `*` and containing `:*\n` to split prefix from body and render the sender name in blue bold.

### Database migrations
Prisma Migrate is not run directly from the host (the DB is inside Docker). Workflow for schema changes:
1. Edit `prisma/schema.prisma`
2. Apply the SQL manually: `docker exec meuzapdesk-postgres-1 psql -U meuzapdesk -d meuzapdesk_dev -c "ALTER TABLE ..."`
3. Run `npx --prefix meuzapdesk/panel prisma generate` to regenerate the client

### Key files
| File | Purpose |
|------|---------|
| `panel/lib/whatsapp.ts` | All WAHA API calls + `buildSignedMessage`, `buildMenuMessage` |
| `panel/lib/auth.ts` | NextAuth config; JWT fields; Gravatar avatar |
| `panel/lib/sse.ts` | In-memory SSE client registry |
| `panel/lib/db.ts` | Prisma client singleton |
| `panel/middleware.ts` | Route protection by role |
| `panel/components/LeftNavStrip.tsx` | Shared left nav (used by all pages) |
| `panel/app/atendimento/AtendimentoClient.tsx` | Main UI: queue sidebar + chat |
| `panel/app/api/webhook/whatsapp/route.ts` | WAHA webhook entry point |
| `panel/app/api/messages/route.ts` | Human agent send message |

### UI theme (WhatsApp dark mode)
| Element | Color |
|---------|-------|
| Chat background | `#0b141a` |
| Nav strip background | `#202c33` |
| Incoming bubble | `#202c33` |
| Outgoing bubble | `#005c4b` |
| Bubble text | `#e9edef` |
| Sender name prefix | `#53bdeb` |
