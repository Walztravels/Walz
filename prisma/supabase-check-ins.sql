-- ── Staff Check-In System — run in Supabase SQL editor ──────────────────────
-- Run this entire script as a single transaction in the SQL editor.
-- Tracking is opt-in: only staff explicitly set checkInTracked = true are tracked.

-- 1. Add checkInTracked flag to Staff (opt-in, defaults to FALSE)
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "checkInTracked" boolean NOT NULL DEFAULT false;

-- 2. Set ALL existing staff to not-tracked (opt-in model: nobody tracked until explicitly enabled)
UPDATE "Staff" SET "checkInTracked" = false;

-- 3. Opt in the two confirmed tracked staff members
UPDATE "Staff" SET "checkInTracked" = true
WHERE name IN ('Oluchi Uko', 'Pricilla Ofei');

-- 4. Create CheckInRecord table
CREATE TABLE IF NOT EXISTS "CheckInRecord" (
  "id"            text        NOT NULL DEFAULT gen_random_uuid()::text,
  "staffId"       text        NOT NULL,
  "windowStart"   timestamptz NOT NULL,
  "present"       boolean     NOT NULL DEFAULT false,
  "autoDetected"  boolean     NOT NULL DEFAULT false,
  "manualCheckin" boolean     NOT NULL DEFAULT false,
  "flagged"       boolean     NOT NULL DEFAULT false,
  "waived"        boolean     NOT NULL DEFAULT false,
  "deductionAmt"  float8      NOT NULL DEFAULT 0,
  "waivedById"    text,
  "waivedAt"      timestamptz,
  "dispute"       text,
  "disputeStatus" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("staffId", "windowStart"),
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CheckInRecord_staffId_idx"     ON "CheckInRecord"("staffId");
CREATE INDEX IF NOT EXISTS "CheckInRecord_windowStart_idx" ON "CheckInRecord"("windowStart");
CREATE INDEX IF NOT EXISTS "CheckInRecord_flagged_idx"     ON "CheckInRecord"("flagged");

-- 5. Create CheckInSettings singleton
CREATE TABLE IF NOT EXISTS "CheckInSettings" (
  "id"               text    NOT NULL DEFAULT 'singleton',
  "enabled"          boolean NOT NULL DEFAULT false,
  "workStartHour"    integer NOT NULL DEFAULT 8,
  "workEndHour"      integer NOT NULL DEFAULT 18,
  "deductionPerMiss" float8  NOT NULL DEFAULT 0,
  "trackedRoles"     text    NOT NULL DEFAULT '',
  "updatedAt"        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);

INSERT INTO "CheckInSettings" ("id", "updatedAt")
VALUES ('singleton', now())
ON CONFLICT ("id") DO NOTHING;

-- 6. Enable Row-Level Security
ALTER TABLE "CheckInRecord"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckInSettings" ENABLE ROW LEVEL SECURITY;

-- 7. GRANT table access to all Supabase roles (same pattern as CallLog fix)
GRANT ALL ON "CheckInRecord"   TO postgres, anon, authenticated, service_role;
GRANT ALL ON "CheckInSettings" TO postgres, anon, authenticated, service_role;

-- 8. RLS policies: service_role bypass (Next.js API routes use service key via Prisma)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'CheckInRecord' AND policyname = 'service_role_bypass_checkin_record'
  ) THEN
    CREATE POLICY "service_role_bypass_checkin_record"
      ON "CheckInRecord" FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'CheckInSettings' AND policyname = 'service_role_bypass_checkin_settings'
  ) THEN
    CREATE POLICY "service_role_bypass_checkin_settings"
      ON "CheckInSettings" FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
