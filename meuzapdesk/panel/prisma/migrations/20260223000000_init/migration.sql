-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MECHANIC');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('waiting_menu', 'in_queue', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('in', 'out');

-- CreateTable
CREATE TABLE "businesses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "wa_api_token" TEXT NOT NULL,
    "wa_phone_number_id" TEXT NOT NULL,
    "settings_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'MECHANIC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" SERIAL NOT NULL,
    "business_id" INTEGER NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_name" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'waiting_menu',
    "option_selected" INTEGER,
    "priority_score" INTEGER NOT NULL DEFAULT 0,
    "assigned_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_customer_message_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "direction" "Direction" NOT NULL,
    "content" TEXT NOT NULL,
    "sender_user_id" INTEGER,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wa_message_id" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_alerts" (
    "id" SERIAL NOT NULL,
    "conversation_id" INTEGER NOT NULL,
    "alert_level" TEXT NOT NULL,
    "minutes_waiting" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_alerts_conversation_id_alert_level_key" ON "conversation_alerts"("conversation_id", "alert_level");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_alerts" ADD CONSTRAINT "conversation_alerts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
