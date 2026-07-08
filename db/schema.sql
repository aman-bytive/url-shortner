-- URL Shortener — PostgreSQL schema
-- Source of truth for URL mappings. Redis is a derived, rebuildable cache.

BEGIN;

CREATE TABLE IF NOT EXISTS urls (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    short_code   varchar(32) NOT NULL,
    long_url     text        NOT NULL,
    user_id      bigint,
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
