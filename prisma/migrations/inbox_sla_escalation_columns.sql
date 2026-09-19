-- ============================================================
-- INBOX SLA ESCALATION SYSTEM — staged-escalation columns on
-- "ConversationRoute" (idempotent, hand-run in the Supabase SQL Editor —
--  NEVER prisma db push; after running, only `npx prisma generate` is
--  needed locally.)
--
-- Extends the SAME 1:1 routing row (chatwootConversationId is @unique)
-- rather than creating a second table — this row already IS the durable
-- per-conversation routing state (assignedTo/assignedAt/status), and the
-- SLA lifecycle is a natural extension of it, not a new identity surface.
--
-- All six columns are additive and nullable:
--   firstUnattendedAt     anchor of the CURRENT unattended episode
--                         (= latest customer message time, recomputed
--                         from live Chatwoot data every cron tick)
--   agentReminderSentAt   Level 1 (30min)  idempotency gate + evidence
--   managerEscalatedAt    Level 2 (60min)    "
--   adminEscalatedAt      Level 3 (90min)    "
--   criticalEscalatedAt   Level 4 (120min)   "
--   escalationResolvedAt  set once a real, public staff reply lands (or
--                         Chatwoot reports the conversation resolved) —
--                         stops further stages for the current episode
--
-- See lib/inbox/sla-escalation.ts for the full state machine and the
-- episode-detection logic that reuses this row across multiple unattended
-- episodes on the same assignment.
-- ============================================================

ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "firstUnattendedAt"    timestamptz;
ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "agentReminderSentAt"  timestamptz;
ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "managerEscalatedAt"   timestamptz;
ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "adminEscalatedAt"     timestamptz;
ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "criticalEscalatedAt"  timestamptz;
ALTER TABLE "ConversationRoute" ADD COLUMN IF NOT EXISTS "escalationResolvedAt" timestamptz;

-- ── Validation ───────────────────────────────────────────────
SELECT
  'inbox_sla_escalation_columns' AS migration,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name = 'ConversationRoute'
       AND column_name IN (
         'firstUnattendedAt', 'agentReminderSentAt', 'managerEscalatedAt',
         'adminEscalatedAt', 'criticalEscalatedAt', 'escalationResolvedAt'
       ))                                                                    AS new_columns,
  (SELECT COUNT(*) FROM information_schema.table_constraints
     WHERE table_name = 'ConversationRoute' AND constraint_type = 'PRIMARY KEY') AS pk_intact;
-- Expect: inbox_sla_escalation_columns | 6 | 1
