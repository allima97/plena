-- The old Plena database stored every user's records in one shared collection.
-- Keep those records quarantined under an empty owner until the configured
-- legacy account claims them through the authenticated API.
CREATE TABLE documents_scoped (
	owner_email TEXT NOT NULL,
	collection TEXT NOT NULL,
	id TEXT NOT NULL,
	data TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (owner_email, collection, id)
);

INSERT INTO documents_scoped (owner_email, collection, id, data, updated_at)
SELECT '', collection, id, data, updated_at FROM documents;

DROP TABLE documents;
ALTER TABLE documents_scoped RENAME TO documents;
CREATE INDEX idx_documents_owner_collection ON documents (owner_email, collection);
