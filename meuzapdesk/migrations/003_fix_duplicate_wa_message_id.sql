-- Migration 003: Remove mensagens duplicadas e cria índice unique em wa_message_id
-- Mantém o registro mais antigo (menor id) de cada wa_message_id duplicado

DELETE FROM messages
WHERE wa_message_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id)
    FROM messages
    WHERE wa_message_id IS NOT NULL
    GROUP BY wa_message_id
  );

-- Cria índice unique (agora sem duplicatas)
CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_message_id_key
  ON messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
