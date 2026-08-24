-- Flight quotes table
CREATE TABLE flight_quotes (
  id              TEXT        PRIMARY KEY,
  token           TEXT        NOT NULL UNIQUE,
  "duffelOfferId" TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',
  "clientName"    TEXT,
  "clientEmail"   TEXT,
  "clientPhone"   TEXT,
  origin          TEXT        NOT NULL,
  destination     TEXT        NOT NULL,
  "departureDate" TIMESTAMPTZ NOT NULL,
  "returnDate"    TIMESTAMPTZ,
  airline         TEXT        NOT NULL,
  "cabinClass"    TEXT        NOT NULL,
  "displayPrice"  NUMERIC(10,2) NOT NULL,
  currency        TEXT        NOT NULL,
  "createdBy"     TEXT        NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "viewedAt"      TIMESTAMPTZ,
  "approvedAt"    TIMESTAMPTZ,
  "expiresAt"     TIMESTAMPTZ NOT NULL,
  CONSTRAINT flight_quotes_status_check CHECK (
    status IN ('pending','viewed','approved','expired','booked')
  )
);

ALTER TABLE flight_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON flight_quotes FOR ALL TO service_role USING (true);

CREATE INDEX flight_quotes_token_idx    ON flight_quotes (token);
CREATE INDEX flight_quotes_status_idx   ON flight_quotes (status);
CREATE INDEX flight_quotes_created_by_idx ON flight_quotes ("createdBy");
