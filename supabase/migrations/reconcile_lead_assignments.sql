-- Reconciliation: copy assignedToId from the raw 'leads' table into Prisma's "Lead" table
-- Match by phone number (whatsapp column) since the tables have different IDs.
--
-- Step 1: DRY RUN — count affected rows before making changes
SELECT count(*)
FROM   "Lead"      p
JOIN   leads       raw ON raw.whatsapp = p.whatsapp
WHERE  raw."assignedToId" IS NOT NULL
  AND  p."assignedToId" IS NULL;

-- Step 2: Execute reconciliation (run ONLY after Step 1 confirms expected count)
UPDATE "Lead" p
SET    "assignedToId"   = raw."assignedToId",
       "lastContactedAt" = COALESCE(p."lastContactedAt", raw."lastContactedAt"),
       status            = CASE WHEN p.status = 'New' THEN 'Contacted' ELSE p.status END
FROM   leads raw
WHERE  raw.whatsapp       = p.whatsapp
  AND  raw."assignedToId" IS NOT NULL
  AND  p."assignedToId"   IS NULL;

-- Step 3: Confirm — run the original diagnostic query, now against Prisma "Lead" table
SELECT s.name, s.role, count(p.id) AS assigned_clients
FROM   "Lead"  p
JOIN   "Staff" s ON p."assignedToId" = s.id
GROUP BY s.name, s.role
ORDER BY assigned_clients DESC;
