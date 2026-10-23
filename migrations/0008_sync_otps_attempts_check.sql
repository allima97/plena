-- Reforço de integridade: teto de tentativas do OTP de sync no nível do banco.
-- A coluna attempts entrou na 0005 sem CHECK; aqui a tabela é recriada com a mesma
-- garantia de auth_challenges (attempts BETWEEN 0 AND 5), pra que nenhum caminho de
-- código consiga estourar o limite mesmo sob concorrência.

CREATE TABLE sync_otps_new (
  id          TEXT    PRIMARY KEY,                 -- UUID
  owner_email TEXT    NOT NULL,                    -- e-mail do usuário no Plena
  code_hash   TEXT    NOT NULL,                    -- HMAC do código de 6 dígitos
  expires_at  INTEGER NOT NULL,                    -- Unix ms
  used        INTEGER NOT NULL DEFAULT 0,          -- 1 após ser consumido
  created_at  INTEGER NOT NULL,                    -- Unix ms
  attempts    INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);

INSERT INTO sync_otps_new (id, owner_email, code_hash, expires_at, used, created_at, attempts)
SELECT id, owner_email, code_hash, expires_at, used, created_at, MIN(attempts, 5)
FROM sync_otps;

DROP TABLE sync_otps;
ALTER TABLE sync_otps_new RENAME TO sync_otps;

CREATE INDEX IF NOT EXISTS idx_sync_otps_email ON sync_otps (owner_email, expires_at);
