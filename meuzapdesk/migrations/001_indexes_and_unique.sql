-- Migration 001: Índices de performance e constraint unique em wa_message_id
-- Todos os comandos são idempotentes (IF NOT EXISTS)

-- Conversations: índice composto para queries por status e por telefone
CREATE INDEX IF NOT EXISTS conversations_business_status_idx
  ON conversations(business_id, status);

CREATE INDEX IF NOT EXISTS conversations_business_phone_idx
  ON conversations(business_id, customer_phone);

CREATE INDEX IF NOT EXISTS conversations_waiting_since_idx
  ON conversations(customer_waiting_since);

-- Messages: índice para listagem de mensagens por conversa + dedup atômico por wa_message_id
CREATE INDEX IF NOT EXISTS messages_conv_sent_idx
  ON messages(conversation_id, sent_at);

CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_message_id_key
  ON messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
