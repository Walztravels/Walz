-- =============================================================================
-- V2 Acceptance History Migration
-- =============================================================================
-- Stores one immutable row per accepted revision cycle.
--   revision_number = 0 → original acceptance (written at first revision creation)
--   revision_number = 1 → first revision accepted
--   revision_number = N → N-th revision accepted
--
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- =============================================================================

CREATE TABLE IF NOT EXISTS itinerary_acceptance_history (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TEXT: Prisma generates CUIDs for Itinerary.id, not RFC-4122 UUIDs
  itinerary_id     TEXT          NOT NULL,
  revision_number  INTEGER       NOT NULL DEFAULT 0,
  -- 1 = AcceptedConfigurationV1, 2 = AcceptedConfigurationV2
  version          INTEGER       NOT NULL,
  -- Immutable: the full AcceptedConfiguration JSON stored at acceptance
  snapshot         JSONB         NOT NULL,
  -- Itinerary content captured at the time this row was written:
  -- { flights, hotels, days, inclusions, exclusions, totalPrice }
  -- Used for diff generation between revisions.
  content_snapshot JSONB,
  proposal_hash    TEXT,
  accepted_at      TIMESTAMPTZ   NOT NULL,
  accepted_by      TEXT          NOT NULL,
  accepted_total   NUMERIC(12,2),
  currency         TEXT          NOT NULL DEFAULT 'GBP',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT uq_acceptance_history UNIQUE (itinerary_id, revision_number)
);

ALTER TABLE itinerary_acceptance_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON itinerary_acceptance_history;
CREATE POLICY "service_role_full_access"
  ON itinerary_acceptance_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_acceptance_history_itinerary_id
  ON itinerary_acceptance_history (itinerary_id);

-- ROLLBACK:
-- DROP TABLE IF EXISTS itinerary_acceptance_history;
