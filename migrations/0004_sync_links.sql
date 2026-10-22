-- Sincronismo Plena ↔ Nextgoals
-- Migração ADITIVA: cria apenas novas tabelas, nunca toca nos dados existentes.

-- Vínculo ativo entre conta Plena e conta Nextgoals do mesmo usuário.
-- O email é o mesmo nos dois sistemas (owner_email no Plena, user_id no Nextgoals).
CREATE TABLE IF NOT EXISTS sync_links (
  id              TEXT    PRIMARY KEY,             -- UUID gerado pelo Plena
  plena_user_id   TEXT    NOT NULL UNIQUE,         -- owner_email no Plena
  nextgoals_user_id TEXT  NOT NULL UNIQUE,         -- user_id no Nextgoals (mesmo email)
  enabled         INTEGER NOT NULL DEFAULT 1,      -- 1=ativo, 0=pausado pelo usuário
  created_at      TEXT    NOT NULL,                -- ISO-8601
  disabled_at     TEXT,                            -- preenchido quando enabled=0
  last_sync_at    TEXT,                            -- última sincronização bem-sucedida
  last_sync_error TEXT                             -- mensagem do último erro (NULL quando OK)
);

-- OTP de confirmação: antes de ativar o sync, o usuário recebe um código
-- no e-mail e precisa digitá-lo, confirmando que entende as consequências.
CREATE TABLE IF NOT EXISTS sync_otps (
  id          TEXT    PRIMARY KEY,                 -- UUID
  owner_email TEXT    NOT NULL,                    -- e-mail do usuário no Plena
  code_hash   TEXT    NOT NULL,                    -- SHA-256 do código de 6 dígitos
  expires_at  INTEGER NOT NULL,                    -- Unix ms
  used        INTEGER NOT NULL DEFAULT 0,          -- 1 após ser consumido
  created_at  INTEGER NOT NULL                     -- Unix ms
);

CREATE INDEX IF NOT EXISTS idx_sync_otps_email ON sync_otps (owner_email, expires_at);
