ALTER TABLE sync_links ADD COLUMN reconciled_at INTEGER;
CREATE TABLE IF NOT EXISTS sync_tombstones (
  owner TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, deleted_at INTEGER NOT NULL,
  PRIMARY KEY(owner, collection, id)
);
