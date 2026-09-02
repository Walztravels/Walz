-- ── Orbit Brand Assets ────────────────────────────────────────────────────────
-- Uploaded logo variants for the Walz Travels brand.
-- Run this in the Supabase SQL editor.
-- One active asset per variant; managed via API (not direct client writes).

create table if not exists orbit_brand_assets (
  id           text        primary key default (concat('oba_', replace(gen_random_uuid()::text, '-', ''))),
  variant      text        not null check (variant in ('PRIMARY','LIGHT','DARK','MONOCHROME','ICON')),
  storage_path text        not null,
  public_url   text        not null,
  mime_type    text        not null,
  width        integer,
  height       integer,
  created_by   text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists orbit_brand_assets_variant_idx    on orbit_brand_assets(variant);
create index if not exists orbit_brand_assets_created_by_idx on orbit_brand_assets(created_by);

-- Auto-update updated_at
create or replace function update_orbit_brand_assets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orbit_brand_assets_updated_at
  before update on orbit_brand_assets
  for each row execute function update_orbit_brand_assets_updated_at();

-- Row Level Security: block direct client access; only service role can write
alter table orbit_brand_assets enable row level security;

create policy "orbit_brand_assets_service_only"
  on orbit_brand_assets for all
  using (false)
  with check (false);
