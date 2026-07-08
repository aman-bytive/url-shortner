# ADR-0005: Soft delete, codes never reused

**Status:** Accepted

## Context
Deleting a URL could hard-delete the row or flag it. Codes are public and may be embedded in already-shared links.

## Decision
**Soft delete** (`is_deleted=true`). A deleted code's row stays forever; the code is never reused.

## Consequences
- Reusing a code would silently redirect old inbound links to a new destination — a correctness and security hazard. Keeping the row reserved prevents it.
- Preserves `clicks` history, which references the code.
- Recoverable from accidental deletes.
- Public redirect/metadata treat deleted as 404; owner metadata still sees the row for audit.
- Cost: table grows monotonically. Acceptable — rows are small; archive very old deleted rows if needed.
