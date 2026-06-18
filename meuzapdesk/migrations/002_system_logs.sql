-- Migration 002: Tabela de logs do sistema
-- Idempotente (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "system_logs" (
    "id"          SERIAL PRIMARY KEY,
    "level"       VARCHAR(10)  NOT NULL,
    "context"     VARCHAR(100) NOT NULL,
    "message"     TEXT         NOT NULL,
    "details"     JSONB,
    "business_id" INTEGER,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_logs_created_at_idx
  ON system_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS system_logs_level_idx
  ON system_logs(level);

CREATE INDEX IF NOT EXISTS system_logs_business_id_idx
  ON system_logs(business_id);
