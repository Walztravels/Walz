-- ══════════════════════════════════════════════════════════════════════════
-- Orbit Creative Studio refactor — shared Media Library, versions, design
-- projects, campaign↔asset references, per-channel publish records.
-- Run manually in the Supabase SQL editor. Idempotent; safe to re-run.
-- Backfill only ADDS metadata/links — no rows are deleted or overwritten,
-- and legacy campaign_id links keep working during the transition.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. orbit_media: library + version + save-lifecycle columns ─────────────
ALTER TABLE orbit_media
  ADD COLUMN IF NOT EXISTS title              TEXT,
  ADD COLUMN IF NOT EXISTS tags               JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS readiness          TEXT  NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS asset_group_id     TEXT,
  ADD COLUMN IF NOT EXISTS version            INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_media_id    TEXT,
  ADD COLUMN IF NOT EXISTS mime_type          TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes         INTEGER,
  ADD COLUMN IF NOT EXISTS save_error         TEXT,
  ADD COLUMN IF NOT EXISTS design_project_id  TEXT,
  ADD COLUMN IF NOT EXISTS design_snapshot    JSONB;

CREATE INDEX IF NOT EXISTS idx_orbit_media_group_version ON orbit_media (asset_group_id, version);
CREATE INDEX IF NOT EXISTS idx_orbit_media_readiness     ON orbit_media (readiness, media_type);

-- ── 2. Design projects (durable editable layer configurations) ─────────────
CREATE TABLE IF NOT EXISTS orbit_design_projects (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL DEFAULT 'Untitled design',
  template_key      TEXT NOT NULL,
  format            TEXT NOT NULL DEFAULT '1080x1350',
  campaign_id       TEXT,
  commercial_fields JSONB NOT NULL DEFAULT '{}',
  controls          JSONB NOT NULL DEFAULT '{}',
  layer_overrides   JSONB NOT NULL DEFAULT '{}',
  structured_routes JSONB NOT NULL DEFAULT '[]',
  visual_media_id   TEXT,
  update_seq        INTEGER NOT NULL DEFAULT 0,
  archived          BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        TEXT NOT NULL,
  last_edited_by    TEXT,
  created_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_design_projects_campaign ON orbit_design_projects (campaign_id);
CREATE INDEX IF NOT EXISTS idx_design_projects_active   ON orbit_design_projects (archived, updated_at);

-- ── 3. Campaign↔media references (many-to-many, file never copied) ─────────
CREATE TABLE IF NOT EXISTS orbit_campaign_media (
  id               TEXT PRIMARY KEY,
  campaign_id      TEXT NOT NULL REFERENCES orbit_campaigns(id) ON DELETE CASCADE,
  media_id         TEXT NOT NULL REFERENCES orbit_media(id) ON DELETE RESTRICT,
  position         INTEGER NOT NULL DEFAULT 0,
  platform_variant TEXT,
  added_by         TEXT NOT NULL,
  added_at         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_media_media ON orbit_campaign_media (media_id);

-- ── 4. Per-channel publish record fields ───────────────────────────────────
ALTER TABLE orbit_publish_log
  ADD COLUMN IF NOT EXISTS attempt         INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS media_ids       JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS channel_id      TEXT,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS checked_at      TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS idx_publish_log_channel ON orbit_publish_log (campaign_id, platform, sent_at);

-- ── 5. Backfill: register every existing creative asset in the library ─────
-- 5a. Version identity: each legacy row becomes v1 of its own asset group.
UPDATE orbit_media SET asset_group_id = id WHERE asset_group_id IS NULL;

-- 5b. Titles from the best available existing text (never overwrites).
UPDATE orbit_media SET title = COALESCE(
    NULLIF(alt_text, ''),
    NULLIF(initcap(replace(COALESCE(campaign_type, ''), '_', ' ')), ''),
    'Untitled asset'
  )
WHERE title IS NULL;

-- 5c. Readiness from actual storage location — provider-hosted URLs are
--     NEVER marked ready (their links expire); they are reported as
--     missing_source for the retry-save flow to re-ingest.
UPDATE orbit_media SET readiness = CASE
    WHEN generation_status IN ('pending', 'processing', 'queued') THEN 'draft'
    WHEN generation_status = 'failed'                             THEN 'draft'
    WHEN public_url IS NULL OR public_url = ''                    THEN 'draft'
    WHEN public_url LIKE '%/storage/v1/object/public/orbit-media/%' THEN 'ready'
    WHEN storage_path LIKE 'media_library:%'                      THEN 'ready'  -- MarketingMedia ref
    WHEN source_type = 'media_library'                            THEN 'ready'  -- MarketingMedia ref
    ELSE 'missing_source'                                          -- expiring provider URL
  END
WHERE readiness = 'draft';   -- only rows the backfill hasn't classified yet

-- 5d. Campaign links from the legacy 1:1 ownership column (kept in place).
INSERT INTO orbit_campaign_media (id, campaign_id, media_id, position, added_by, added_at)
SELECT 'ocm_' || m.id,
       m.campaign_id,
       m.id,
       COALESCE(ord.position, 999),
       COALESCE(m.created_by, 'backfill'),
       m.created_at
FROM orbit_media m
LEFT JOIN LATERAL (
  SELECT idx - 1 AS position
  FROM orbit_campaigns c,
       jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.media_order) = 'array' THEN c.media_order ELSE '[]'::jsonb END)
         WITH ORDINALITY AS o(media_id, idx)
  WHERE c.id = m.campaign_id AND o.media_id = m.id
) ord ON TRUE
WHERE m.campaign_id IS NOT NULL
  AND m.is_reference = FALSE
ON CONFLICT (campaign_id, media_id) DO NOTHING;

-- ── 6. Report (run output) ─────────────────────────────────────────────────
SELECT 'library assets' AS t, count(*) FROM orbit_media
UNION ALL SELECT 'ready',            count(*) FROM orbit_media WHERE readiness = 'ready'
UNION ALL SELECT 'missing_source (expired provider URLs — need re-ingest)', count(*) FROM orbit_media WHERE readiness = 'missing_source'
UNION ALL SELECT 'campaign links',   count(*) FROM orbit_campaign_media
UNION ALL SELECT 'design projects',  count(*) FROM orbit_design_projects;
