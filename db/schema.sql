-- URL Shortener — PostgreSQL schema
-- Source of truth for URL mappings. Redis is a derived, rebuildable cache.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext;  -- case-insensitive email column

-- Registered accounts. Passwords hashed (bcrypt/argon2), never plaintext.
CREATE TABLE IF NOT EXISTS users (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         citext      NOT NULL,
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
    ON users (email);

-- Refresh tokens, one row per issued session. Enables per-session revocation/logout.
-- Store a hash of the token, not the token itself (same reason passwords are hashed).
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint      NOT NULL REFERENCES users (id),
    token_hash  bytea       NOT NULL,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_key
    ON refresh_tokens (token_hash);

CREATE INDEX IF NOT EXISTS refresh_tokens_user
    ON refresh_tokens (user_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS urls (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    short_code   varchar(32) NOT NULL,
    long_url     text        NOT NULL,
    user_id      bigint REFERENCES users (id),
    is_permanent boolean     NOT NULL DEFAULT false,  -- true -> 301, false -> 302
    expires_at   timestamptz,                         -- null = never expires
    click_count  bigint      NOT NULL DEFAULT 0,       -- denormalized, updated by worker
    is_deleted   boolean     NOT NULL DEFAULT false,   -- soft delete; codes never reused
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Redirect lookup is exact-match on short_code; unique index also enforces no collisions.
CREATE UNIQUE INDEX IF NOT EXISTS urls_short_code_key
    ON urls (short_code);

-- Owner dashboard: recent links per user, excluding deleted.
CREATE INDEX IF NOT EXISTS urls_user_recent
    ON urls (user_id, created_at DESC)
    WHERE NOT is_deleted;

-- Append-only click analytics. Written by the worker off the redirect hot path.
-- No hard FK to urls: decouples write-heavy ingest and avoids lock contention.
CREATE TABLE IF NOT EXISTS clicks (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    short_code  varchar(32) NOT NULL,
    clicked_at  timestamptz NOT NULL DEFAULT now(),
    referrer    text,
    ip_hash     bytea                               -- hashed, never raw IP (privacy)
);

CREATE INDEX IF NOT EXISTS clicks_code_time
    ON clicks (short_code, clicked_at);

COMMIT;

-- Scaling note: partition `clicks` by month (range on clicked_at) once volume grows;
-- archive/expire old partitions. See docs/scaling.md.
