-- Role-based sending addresses for Email Hub
-- Run in Supabase SQL Editor
-- Adds sendingEmail column and sets per-staff values for 5 staff members.

-- 1. Add the column (nullable, code falls back to 'bookings@walztravels.com' if NULL)
ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "sendingEmail" TEXT;

-- 2. Set per-staff sending addresses
--    WHERE uses name match — verify output of the SELECT at the bottom before accepting.

UPDATE "Staff" SET "sendingEmail" = 'admin@walztravels.com'
  WHERE name ILIKE '%olawale%';

UPDATE "Staff" SET "sendingEmail" = 'joseph@walztravels.com'
  WHERE name ILIKE '%joseph%' AND name ILIKE '%emele%';

UPDATE "Staff" SET "sendingEmail" = 'reservations@walztravels.com'
  WHERE name ILIKE '%glory%';

-- Oluchi: title/address mismatch (roleTitle = "Sales Representative", address = visa@)
-- Confirmed as intentional — do not change roleTitle.
UPDATE "Staff" SET "sendingEmail" = 'visa@walztravels.com'
  WHERE name ILIKE '%oluchi%';

-- Note: "Pricilla" — exact spelling from Staff table, not a typo
UPDATE "Staff" SET "sendingEmail" = 'priscilla.fsr@walztravels.com'
  WHERE name ILIKE '%pricilla%' OR name ILIKE '%priscilla%';

-- 3. Verify — paste this result back to confirm before deploying
SELECT id, name, email, "roleTitle", "sendingEmail"
FROM "Staff"
WHERE "sendingEmail" IS NOT NULL
ORDER BY name;
