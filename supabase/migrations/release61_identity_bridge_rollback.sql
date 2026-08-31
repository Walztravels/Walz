-- Release 6.1 — Identity Bridge ROLLBACK
-- Reverses release61_identity_bridge.sql.
-- Only run this if the forward migration needs to be reverted.
-- All existing data in the user_id column will be lost.

DROP INDEX IF EXISTS idx_itinerary_client_email_lower;
DROP INDEX IF EXISTS idx_itinerary_user_id;
ALTER TABLE itinerary DROP COLUMN IF EXISTS user_id;
