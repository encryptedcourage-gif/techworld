-- Schema is applied automatically on server startup (idempotent).

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  public_key    TEXT NOT NULL,
  push_token    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store-and-forward mailbox. The server only ever stores ciphertext; it cannot
-- read message contents (end-to-end encryption).
CREATE TABLE IF NOT EXISTS messages (
  id                BIGSERIAL PRIMARY KEY,
  sender_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_public_key TEXT NOT NULL,
  ciphertext        TEXT NOT NULL,
  nonce             TEXT NOT NULL,
  delivered         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient
  ON messages (recipient_id, delivered);

-- Server-verified purchases. This is the source of truth for paid features.
CREATE TABLE IF NOT EXISTS entitlements (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku            TEXT NOT NULL,
  platform       TEXT NOT NULL,
  purchase_token TEXT NOT NULL,
  expires_at     TIMESTAMPTZ,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sku)
);
