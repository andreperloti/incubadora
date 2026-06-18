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
  ⚠️ **Requer SQL no container para ter efeito em produção:**
  ```sql
  CREATE UNIQUE INDEX CONCURRENTLY "messages_wa_message_id_key" ON "messages"("wa_message_id") WHERE "wa_message_id" IS NOT NULL;
  ```

- [x] **parseInt sem validação em messages/route.ts** — `app/api/messages/route.ts:19`
  `parseInt(user.businessId)` e `parseInt(user.id)` sem validação de NaN — os outros endpoints já foram corrigidos com `getSessionBusinessId()`, esse ficou de fora.
  _Fix: aplicado helper `getSessionBusinessId()` e `getSessionUserId()` de `lib/auth.ts`._

- [x] **unreadCount não é awaited** — `app/api/conversations/[id]/route.ts:39`
  `prisma.conversation.update()` que zera `unreadCount` roda fire-and-forget. Se a request abortar, o badge de não-lidas não é zerado.
  _Fix: update agora é awaited._

---

## Segurança

- [ ] **SSRF via avatar URL** — `lib/whatsapp.ts:414`
  O filtro rejeita non-HTTPS, mas `https://192.168.0.1/...` passa. O servidor faz request para IP interno da rede.
  _Fix: rejeitar IPs privados/localhost após validar HTTPS (`127.`, `10.`, `192.168.`, `172.16-31.`)._

- [ ] **execFileSync(ffmpeg) sem sandbox** — `app/api/messages/audio/route.ts`
  Executa binário externo com dados do usuário. Vulnerável se ffmpeg tiver exploits conhecidos.
  _Fix: isolar em Worker thread ou substituir por biblioteca Node pura._

- [ ] **Endpoint SSE broadcast sem autenticação** — verificar `app/api/sse/`
  Confirmar se existe endpoint de broadcast aberto. Se existir, qualquer cliente pode injetar eventos SSE para todos os usuários.
  _Fix: adicionar `verifyInternalSecret()` igual ao `bot-send`._

---

## Performance

- [x] **Índices faltando no banco** — `prisma/schema.prisma`
  Toda busca de conversa por status ou telefone é full table scan. Com volume alto, webhook e listagem de fila ficam lentos.
  _Fix: adicionados `@@index([businessId, status])`, `@@index([businessId, customerPhone])`, `@@index([customerWaitingSince])` em Conversation e `@@index([conversationId, sentAt])` em Message._
  ⚠️ **Requer SQL no container para ter efeito em produção:**
  ```sql
  CREATE INDEX CONCURRENTLY "conversations_business_status_idx" ON "conversations"("business_id", "status");
  CREATE INDEX CONCURRENTLY "conversations_business_phone_idx" ON "conversations"("business_id", "customer_phone");
  CREATE INDEX CONCURRENTLY "conversations_waiting_since_idx" ON "conversations"("customer_waiting_since");
  CREATE INDEX CONCURRENTLY "messages_conv_sent_idx" ON "messages"("conversation_id", "sent_at");
  ```

- [x] **Polling de 3s + SSE redundante** — `app/atendimento/AtendimentoClient.tsx`
  Com 100 usuários simultâneos → ~33 req/s desnecessárias ao banco. SSE já cobre atualizações em tempo real.
  _Fix: polling de 30s com `sseActiveRef` — só dispara quando SSE está offline._

- [x] **Dedup em memória O(n²) em recent/route.ts** — `app/api/conversations/recent/route.ts`
  Buscava 100 conversas e filtrava com double loop em JavaScript.
  _Fix: exclusão de telefones ativos movida para SQL (`notIn`), take reduzido para 30._

---

## UX / Runtime

- [ ] **SSE sem reconexão com backoff** — `app/atendimento/AtendimentoClient.tsx`
  Reconecta sempre após 3s fixos. Em sobrecarga, reconexões constantes agravam o problema.
  _Fix: backoff exponencial no frontend (3s → 6s → 15s → 30s max)._

- [ ] **Chamadas WAHA sem timeout** — `app/api/conversations/[id]/route.ts:47`
  `getWahaContactAvatar()` e `getWahaContactPhone()` bloqueiam a resposta indefinidamente se WAHA estiver lento.
  _Fix: `Promise.race()` com timeout de 5s ou `AbortSignal.timeout(5000)`._

- [ ] **Business não encontrado retorna 200 silencioso** — `app/api/webhook/whatsapp/route.ts:113`
  Mensagens de clientes são descartadas sem nenhum alerta se a sessão WAHA não tiver Business associado.
  _Fix: retornar 422 e logar com nível `error` para alertar operador._
