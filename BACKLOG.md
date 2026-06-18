# MeuZapDesk — Backlog de Correções

Marcar com `[x]` ao concluir cada item.

---

## Bugs Críticos

- [x] **saveBotMessage fire-and-forget** — `app/api/webhook/whatsapp/route.ts:248`
  Broadcast SSE é enviado antes de confirmar que o INSERT no banco foi bem-sucedido. Mensagem aparece na tela mas some ao recarregar se o INSERT falhar.
  _Fix: retornar Promise em saveBotMessage e awaitar antes de broadcastar._

- [x] **Dedup de waMessageId sem constraint UNIQUE** — `app/api/webhook/whatsapp/route.ts:549`
  O par `findFirst() + create()` não é atômico. Dois webhooks simultâneos com o mesmo `waMessageId` passam pela checagem antes de qualquer um commitar, gerando mensagem duplicada no banco.
  _Fix: `@@unique([waMessageId])` adicionado ao schema + try-catch P2002 no código._
  ✅ **Migration criada:** `meuzapdesk/migrations/001_indexes_and_unique.sql`
  Será aplicada automaticamente no próximo deploy via `deploy/migrate.sh`.

- [x] **parseInt sem validação em messages/route.ts** — `app/api/messages/route.ts:19`
  `parseInt(user.businessId)` e `parseInt(user.id)` sem validação de NaN — os outros endpoints já foram corrigidos com `getSessionBusinessId()`, esse ficou de fora.
  _Fix: aplicado helper `getSessionBusinessId()` e `getSessionUserId()` de `lib/auth.ts`._

- [x] **unreadCount não é awaited** — `app/api/conversations/[id]/route.ts:39`
  `prisma.conversation.update()` que zera `unreadCount` roda fire-and-forget. Se a request abortar, o badge de não-lidas não é zerado.
  _Fix: update agora é awaited._

---

## Segurança

- [x] **SSRF via avatar URL** — `lib/whatsapp.ts:414`
  O filtro rejeita non-HTTPS, mas `https://192.168.0.1/...` passa. O servidor faz request para IP interno da rede.
  _Fix: hostname validado com regex de IPs privados/localhost após checar HTTPS._

- [x] **execFileSync(ffmpeg) sem sandbox** — `app/api/messages/audio/route.ts`
  Executa binário externo com dados do usuário. Vulnerável se ffmpeg tiver exploits conhecidos.
  _Fix: limite de 25MB no input, timeout de 30s no execFileSync e fix de parseInt._

- [x] **Endpoint SSE broadcast sem autenticação** — `app/api/sse/broadcast/route.ts`
  Qualquer cliente podia fazer POST e injetar eventos SSE para todos os usuários.
  _Fix: autenticação via header `X-Internal-Secret`._

---

## Performance

- [x] **Índices faltando no banco** — `prisma/schema.prisma`
  Toda busca de conversa por status ou telefone é full table scan. Com volume alto, webhook e listagem de fila ficam lentos.
  _Fix: adicionados `@@index([businessId, status])`, `@@index([businessId, customerPhone])`, `@@index([customerWaitingSince])` em Conversation e `@@index([conversationId, sentAt])` em Message._
  ✅ **Migration criada:** `meuzapdesk/migrations/001_indexes_and_unique.sql`
  Será aplicada automaticamente no próximo deploy via `deploy/migrate.sh`.

- [x] **Polling de 3s + SSE redundante** — `app/atendimento/AtendimentoClient.tsx`
  Com 100 usuários simultâneos → ~33 req/s desnecessárias ao banco. SSE já cobre atualizações em tempo real.
  _Fix: polling de 30s com `sseActiveRef` — só dispara quando SSE está offline._

- [x] **Dedup em memória O(n²) em recent/route.ts** — `app/api/conversations/recent/route.ts`
  Buscava 100 conversas e filtrava com double loop em JavaScript.
  _Fix: exclusão de telefones ativos movida para SQL (`notIn`), take reduzido para 30._

---

## UX / Runtime

- [x] **SSE sem reconexão com backoff** — `app/atendimento/AtendimentoClient.tsx`
  Reconectava sempre após 3s fixos. Em sobrecarga, reconexões constantes agravam o problema.
  _Fix: backoff exponencial (3s → 6s → 12s → 30s max), reset no `onopen`._

- [x] **Chamadas WAHA sem timeout** — `lib/whatsapp.ts`
  `getWahaContactAvatar()` e `getWahaContactPhone()` bloqueavam a resposta se WAHA estivesse lento.
  _Fix: `AbortSignal.timeout(5000)` nas duas funções._

- [x] **Business não encontrado retorna 200 silencioso** — `app/api/webhook/whatsapp/route.ts:113`
  Mensagens de clientes eram descartadas sem alerta se a sessão WAHA não tivesse Business associado.
  _Fix: retorna 422 — visível nos logs do WAHA para alertar operador._
