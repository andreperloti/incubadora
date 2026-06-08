-- Schema completo MeuZapDesk — estado atual
-- Executar em banco vazio: psql -h 127.0.0.1 -U meuzapdesk -d meuzapdesk_prod -f schema.sql

-- Enums
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MECHANIC', 'SUPER_ADMIN');
CREATE TYPE "ConversationStatus" AS ENUM ('waiting_menu', 'in_queue', 'in_progress', 'resolved');
CREATE TYPE "Direction" AS ENUM ('in', 'out');

-- Businesses
CREATE TABLE "businesses" (
    "id"               SERIAL PRIMARY KEY,
    "name"             TEXT NOT NULL,
    "whatsapp_number"  TEXT NOT NULL DEFAULT '',
    "waha_session"     TEXT NOT NULL DEFAULT 'default',
    "settings_json"    JSONB,
    "last_imported_at" TIMESTAMP,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE "users" (
    "id"            SERIAL PRIMARY KEY,
    "business_id"   INTEGER,
    "name"          TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role"          "UserRole" NOT NULL DEFAULT 'MECHANIC',
    "active"        BOOLEAN NOT NULL DEFAULT true,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_email_key" UNIQUE ("email"),
    CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Bot menus
CREATE TABLE "bot_menus" (
    "id"          SERIAL PRIMARY KEY,
    "business_id" INTEGER NOT NULL,
    "name"        TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "is_root"     BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bot_menus_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Bot menu options
CREATE TABLE "bot_menu_options" (
    "id"            SERIAL PRIMARY KEY,
    "menu_id"       INTEGER NOT NULL,
    "order"         INTEGER NOT NULL,
    "label"         TEXT NOT NULL,
    "next_menu_id"  INTEGER,
    "final_message" TEXT,
    "sector_name"   TEXT,
    CONSTRAINT "bot_menu_options_menu_id_fkey"      FOREIGN KEY ("menu_id")      REFERENCES "bot_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bot_menu_options_next_menu_id_fkey" FOREIGN KEY ("next_menu_id") REFERENCES "bot_menus"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Conversations
CREATE TABLE "conversations" (
    "id"                       SERIAL PRIMARY KEY,
    "business_id"              INTEGER NOT NULL,
    "customer_phone"           TEXT NOT NULL,
    "customer_name"            TEXT,
    "customer_avatar"          TEXT,
    "customer_real_phone"      TEXT,
    "unread_count"             INTEGER NOT NULL DEFAULT 0,
    "status"                   "ConversationStatus" NOT NULL DEFAULT 'waiting_menu',
    "option_selected"          INTEGER,
    "priority_score"           INTEGER NOT NULL DEFAULT 0,
    "assigned_user_id"         INTEGER,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_customer_message_at" TIMESTAMP(3),
    "customer_waiting_since"   TIMESTAMP(3),
    "resolved_at"              TIMESTAMP(3),
    "current_menu_id"          INTEGER,
    "sector"                   TEXT,
    CONSTRAINT "conversations_business_id_fkey"     FOREIGN KEY ("business_id")     REFERENCES "businesses"("id")  ON DELETE RESTRICT  ON UPDATE CASCADE,
    CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id")      ON DELETE SET NULL  ON UPDATE CASCADE,
    CONSTRAINT "conversations_current_menu_id_fkey" FOREIGN KEY ("current_menu_id") REFERENCES "bot_menus"("id")   ON DELETE SET NULL  ON UPDATE CASCADE
);

-- Messages
CREATE TABLE "messages" (
    "id"              SERIAL PRIMARY KEY,
    "conversation_id" INTEGER NOT NULL,
    "direction"       "Direction" NOT NULL,
    "content"         TEXT NOT NULL,
    "sender_user_id"  INTEGER,
    "sent_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wa_message_id"   TEXT,
    "media_url"       TEXT,
    "media_type"      TEXT,
    CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_sender_user_id_fkey"  FOREIGN KEY ("sender_user_id")  REFERENCES "users"("id")         ON DELETE SET NULL  ON UPDATE CASCADE
);

-- Conversation alerts
CREATE TABLE "conversation_alerts" (
    "id"              SERIAL PRIMARY KEY,
    "conversation_id" INTEGER NOT NULL,
    "alert_level"     TEXT NOT NULL,
    "minutes_waiting" DOUBLE PRECISION NOT NULL,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversation_alerts_conversation_id_alert_level_key" UNIQUE ("conversation_id", "alert_level"),
    CONSTRAINT "conversation_alerts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Prisma migration table (marca como aplicada para o CLI não reclamar)
CREATE TABLE "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
