-- Adiciona campo queued_at para ordenação imutável da fila de atendimento.
-- Representa o momento em que a conversa foi aberta (criada ou reaberta),
-- e nunca muda durante o ciclo de vida da conversa aberta.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS queued_at TIMESTAMP WITH TIME ZONE;

-- Backfill: conversas ativas usam customer_waiting_since (mais preciso),
-- com fallback para created_at quando o agente já respondeu (campo nulo).
UPDATE conversations
SET queued_at = COALESCE(customer_waiting_since, created_at)
WHERE queued_at IS NULL
  AND status IN ('in_queue', 'in_progress', 'waiting_menu');

CREATE INDEX IF NOT EXISTS conversations_queued_at_idx ON conversations (queued_at);
