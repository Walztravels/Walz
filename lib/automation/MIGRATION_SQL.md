# AutomationAuditLog — Supabase Migration SQL

Run this in the **Supabase SQL editor** for the walz-travels project.
Do NOT use `prisma db push` — this table is managed outside Prisma migrations.

## CREATE TABLE

```sql
create table if not exists "AutomationAuditLog" (
  id                  text        not null primary key,
  "createdAt"         timestamptz not null default now(),
  action              text        not null,
  "automationClass"   text        not null,
  "entityType"        text,
  "entityId"          text,
  "tripId"            text,
  "leadId"            text,
  "opportunityId"     text,
  "staffId"           text,
  blockers            jsonb       not null default '[]'::jsonb,
  reasons             jsonb       not null default '[]'::jsonb,
  warnings            jsonb       not null default '[]'::jsonb,
  "auditMetadata"     jsonb       not null default '{}'::jsonb,
  approved            boolean,
  "approvalRequestId" text
);
```

## INDEXES

```sql
create index if not exists "AutomationAuditLog_entityId_idx"
  on "AutomationAuditLog" ("entityId");

create index if not exists "AutomationAuditLog_leadId_idx"
  on "AutomationAuditLog" ("leadId");

create index if not exists "AutomationAuditLog_opportunityId_idx"
  on "AutomationAuditLog" ("opportunityId");

create index if not exists "AutomationAuditLog_createdAt_idx"
  on "AutomationAuditLog" ("createdAt");

create index if not exists "AutomationAuditLog_action_idx"
  on "AutomationAuditLog" (action);
```

## ROW LEVEL SECURITY

```sql
-- Enable RLS
alter table "AutomationAuditLog" enable row level security;

-- Only service-role (server-side) can insert audit records
create policy "service_role_insert_audit"
  on "AutomationAuditLog"
  for insert
  to service_role
  with check (true);

-- Only service-role can read audit records (staff reads via admin API, not direct)
create policy "service_role_select_audit"
  on "AutomationAuditLog"
  for select
  to service_role
  using (true);
```

## NOTES

- No passport, supplier, or margin fields are stored in this table (privacy-safe).
- `approvalRequestId` links to `ApprovalRequest.id` when a STAFF_APPROVAL_REQUIRED
  class results in a queued approval — kept as a plain text reference, not a FK,
  so audit logs survive if an approval record is deleted.
- This table is append-only. No UPDATE or DELETE policies are granted.
