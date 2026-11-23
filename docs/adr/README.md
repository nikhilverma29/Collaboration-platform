# Architecture Decision Records (ADRs)

This directory contains records of consequential architectural decisions made during the design and engineering of Syncra.

## Why ADRs?

Code shows *how* something is implemented. ADRs document *why* it was chosen, *what alternatives were rejected*, and *what failure modes or trade-offs were accepted*.

Each record follows the standard format:
1. **Title & Metadata:** Number, date, status (`Accepted`, `Proposed`, `Superseded`, `Known Tech Debt`).
2. **Context & Problem Statement:** What technical problem or threat model required a decision?
3. **Decision:** The exact approach taken in this codebase.
4. **Alternatives Considered:** Options analyzed with their specific pros and cons.
5. **Consequences & Trade-offs:** What we gained, what limits we accepted, and the production migration path.

---

## Index of Records

* [**ADR-001: Why SHA-256 Over Bcrypt for Refresh Token Hashing**](./001-sha256-vs-bcrypt-refresh-tokens.md)
* [**ADR-002: Fractional Indexing (Floating-Point Positions) for Task Ordering**](./002-fractional-indexing-kanban-ordering.md)
* [**ADR-003: Cookie-Based Authentication with HttpOnly & SameSite over LocalStorage**](./003-httponly-cookies-vs-localstorage.md)
* [**ADR-004: Workspace-Scoped Socket Rooms and Direct Message Privacy Trade-offs**](./004-socket-workspace-room-privacy-tradeoffs.md)
* [**ADR-005: Socket.io In-Memory Adapter Strategy and Multi-Instance Redis Migration Path**](./005-socketio-inmemory-to-redis-adapter.md)
* [**ADR-006: Cross-Entity Search — Prisma Fan-Out vs. PostgreSQL Full-Text Search (FTS)**](./006-cross-entity-search-prisma-vs-postgres-fts.md)
* [**ADR-007: Omission of Tenant Context on Token Refresh and Client-Side Resynchronization**](./007-tenant-context-omission-on-token-refresh.md)
* [**ADR-008: Refresh Token Rotation Concurrency and TOCTOU Race Condition Mitigation**](./008-refresh-token-rotation-toctou-race-condition.md)

