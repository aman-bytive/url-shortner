# Data Model

PostgreSQL is the source of truth. Redis is a derived cache and holds no authoritative state.

## Tables

### `urls`

The mapping table. One row per short link.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (identity) | internal PK, also feeds code generation |
| `short_code` | `varchar(32)` | the public code; unique lookup key |
| `long_url` | `text` | destination |
| `user_id` | `bigint` | owner (nullable for anonymous) |
| `is_permanent` | `boolean` | true → 301 on redirect, false → 302 |
| `expires_at` | `timestamptz` | null = never expires |
| `click_count` | `bigint` | denormalized counter, updated by worker |
| `is_deleted` | `boolean` | soft delete |
| `created_at` | `timestamptz` | default now() |

**Indexes**

- `UNIQUE (short_code)` — redirect lookup filters on this; uniqueness also guarantees no collisions at the DB level. B-tree, since lookups are exact-match equality.
- `(user_id, created_at DESC) WHERE NOT is_deleted` — powers the owner's dashboard/list.

The redirect query is `WHERE short_code = $1 AND NOT is_deleted` — served by the unique index; `is_deleted` filtered in the fetched row (cheap, one row).

### `clicks`

Append-only analytics. Written by the worker, never on the redirect hot path.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `bigint` (identity) | PK |
| `short_code` | `varchar(32)` | FK-ish reference to `urls.short_code` |
| `clicked_at` | `timestamptz` | event time |
| `referrer` | `text` | nullable |
| `ip_hash` | `bytea` | hashed, never raw IP (privacy) |

**Indexes**

- `(short_code, clicked_at)` — time-series queries per link.

Not a hard FK to `urls` — decouples the write-heavy analytics ingest from the mapping table and avoids lock contention on insert. Referential integrity enforced at app level.

## Delete strategy

**Soft delete** on `urls`. Reasons:

- `clicks` references codes; hard-deleting a URL would orphan or force-cascade analytics history.
- Accidental deletes are recoverable.
- Codes must **not** be reused after delete — a recycled code would silently redirect old inbound links to a new destination. Soft delete keeps the row (and its unique code) reserved forever.

Public redirect and metadata treat `is_deleted=true` as 404. Owner metadata still sees the row for audit.

## Schema DDL

Canonical DDL lives in [`db/schema.sql`](../db/schema.sql). Summary:

```sql
CREATE TABLE urls (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    short_code   varchar(32) NOT NULL,
    long_url     text        NOT NULL,
    user_id      bigint,
    is_permanent boolean     NOT NULL DEFAULT false,
    expires_at   timestamptz,
    click_count  bigint      NOT NULL DEFAULT 0,
    is_deleted   boolean     NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX urls_short_code_key ON urls (short_code);
CREATE INDEX urls_user_recent ON urls (user_id, created_at DESC) WHERE NOT is_deleted;

CREATE TABLE clicks (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    short_code  varchar(32) NOT NULL,
    clicked_at  timestamptz NOT NULL DEFAULT now(),
    referrer    text,
    ip_hash     bytea
);

CREATE INDEX clicks_code_time ON clicks (short_code, clicked_at);
```

## Capacity note

`bigint` id supports ~9.2e18 rows — never the bottleneck. `short_code` at 7 base62 chars = 62^7 ≈ 3.5e12 codes. See [scaling.md](scaling.md) for the length-vs-collision math.
