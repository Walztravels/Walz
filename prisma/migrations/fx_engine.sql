-- ══════════════════════════════════════════════════════════════════════════
-- Walz central FX engine — NGN pricing settings + persisted quote locks.
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Purely ADDITIVE: creates two new tables, touches nothing existing.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Admin FX configuration (single row, id = 'fx-settings') ─────────────
CREATE TABLE IF NOT EXISTS fx_settings (
  id             TEXT PRIMARY KEY,
  "rateMode"     TEXT NOT NULL DEFAULT 'AUTO_MONIERATE',
  manual_rates   JSONB NOT NULL DEFAULT '{}',
  adjustment_usd DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  cache_minutes  INTEGER NOT NULL DEFAULT 10,
  lock_minutes   INTEGER NOT NULL DEFAULT 15,
  is_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by     TEXT,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the singleton row with the documented defaults (no-op when present).
INSERT INTO fx_settings (id) VALUES ('fx-settings')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Persisted customer-facing FX quotes (rate locks) ────────────────────
CREATE TABLE IF NOT EXISTS fx_quote_locks (
  id              TEXT PRIMARY KEY,
  context         TEXT NOT NULL,
  base_currency   TEXT NOT NULL,
  quote_currency  TEXT NOT NULL,
  base_amount     DECIMAL(14,2) NOT NULL,
  raw_rate        DECIMAL(18,8) NOT NULL,
  effective_rate  DECIMAL(18,8) NOT NULL,
  rate_source     TEXT NOT NULL,
  provider        TEXT,
  adjustment_usd  DECIMAL(10,2) NOT NULL,
  adjustment_in_base_currency DECIMAL(14,4) NOT NULL,
  adjusted_base_amount        DECIMAL(16,4) NOT NULL,
  converted_amount            DECIMAL(18,2) NOT NULL,
  rate_timestamp  TIMESTAMP(3),
  reference       TEXT,
  used_at         TIMESTAMP(3),
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fx_quote_locks_expires   ON fx_quote_locks (expires_at);
CREATE INDEX IF NOT EXISTS idx_fx_quote_locks_reference ON fx_quote_locks (reference);

-- ── 3. Verification — paste this output back for review ────────────────────
SELECT 'VERIFY: fx_settings row exists (must be 1)' AS check, count(*)::text AS value
  FROM fx_settings WHERE id = 'fx-settings'
UNION ALL SELECT 'VERIFY: fx_settings defaults',
  (SELECT "rateMode" || ' / adj=' || adjustment_usd || ' / cache=' || cache_minutes || 'm / lock=' || lock_minutes || 'm'
     FROM fx_settings WHERE id = 'fx-settings')
UNION ALL SELECT 'VERIFY: fx_quote_locks table (0 rows until first quote)', count(*)::text
  FROM fx_quote_locks;
