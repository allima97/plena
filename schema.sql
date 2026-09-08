-- Tabela genérica: cada lançamento, conta, categoria, objetivo, modelo de
-- relatório etc. vira uma linha aqui, guardada como JSON em `data`. Assim o
-- formato de cada coleção pode evoluir sem precisar de migração de banco.
CREATE TABLE IF NOT EXISTS documents (
	collection TEXT NOT NULL,
	id TEXT NOT NULL,
	data TEXT NOT NULL,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (collection, id)
);

CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents (collection);
