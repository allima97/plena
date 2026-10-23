-- Keeps the scope/version of integration authorization, never OTPs or secrets.
CREATE TABLE IF NOT EXISTS privacy_consents (
  owner TEXT NOT NULL,
  purpose TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY(owner, purpose)
);
