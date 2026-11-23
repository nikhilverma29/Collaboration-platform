# Syncra — Architecture & Engineering Documentation

Welcome to the engineering documentation for **Syncra** (*Project Ramayana*).

This directory houses the foundational system design records, architectural decision history, and API interface specifications for the platform. It is structured to provide an immediate, rigorous technical breakdown of the system for new engineers, evaluators, and system architects.

---

## Directory Structure

```
docs/
├── README.md                      # This master index
├── openapi.yaml                   # OpenAPI 3.0 specification for core APIs (Auth, Tasks, Chat)
└── adr/                           # Architecture Decision Records (ADRs)
    ├── README.md                  # ADR index & decision methodology
    ├── 001-sha256-vs-bcrypt-refresh-tokens.md
    ├── 002-fractional-indexing-kanban-ordering.md
    ├── 003-httponly-cookies-vs-localstorage.md
    ├── 004-socket-workspace-room-privacy-tradeoffs.md
    ├── 005-socketio-inmemory-to-redis-adapter.md
    ├── 006-cross-entity-search-prisma-vs-postgres-fts.md
    ├── 007-tenant-context-omission-on-token-refresh.md
    └── 008-refresh-token-rotation-toctou-race-condition.md
```

---

## 1. Architecture Decision Records (ADRs)

Architecture Decision Records capture consequential design choices, the context behind them, alternatives evaluated, and their explicit operational trade-offs.

| ADR | Decision Topic | Status | Primary Trade-off / Focus |
| :--- | :--- | :---: | :--- |
| [**ADR 001**](./adr/001-sha256-vs-bcrypt-refresh-tokens.md) | SHA-256 vs. Bcrypt for Refresh Tokens | **Accepted** | High-entropy random tokens vs. low-entropy passwords; latency profile. |
| [**ADR 002**](./adr/002-fractional-indexing-kanban-ordering.md) | Fractional Indexing (Floats) for Tasks | **Accepted** | $O(1)$ single-row reorder vs. IEEE 754 precision exhaustion. |
| [**ADR 003**](./adr/003-httponly-cookies-vs-localstorage.md) | HttpOnly Cookie Sessions vs. LocalStorage | **Accepted** | Complete XSS token exfiltration immunity vs. CSRF mitigation. |
| [**ADR 004**](./adr/004-socket-workspace-room-privacy-tradeoffs.md) | Workspace Socket Rooms & DM Privacy | **Accepted / Known Gap** | Fast prototyping vs. private channel / DM event leakage. |
| [**ADR 005**](./adr/005-socketio-inmemory-to-redis-adapter.md) | Socket.io In-Memory to Redis Migration | **Accepted / Planned** | Zero-dependency dev setup vs. multi-instance horizontal scaling. |
| [**ADR 006**](./adr/006-cross-entity-search-prisma-vs-postgres-fts.md) | Prisma Fan-Out vs. Postgres FTS | **Accepted / Prototype** | Type-safe multi-entity search vs. `LIKE '%term%'` table scans. |
| [**ADR 007**](./adr/007-tenant-context-omission-on-token-refresh.md) | Tenant Context Loss During Token Refresh | **Accepted** | Global refresh semantics vs. 403 route drops & re-switch handling. |
| [**ADR 008**](./adr/008-refresh-token-rotation-toctou-race-condition.md) | Refresh Token TOCTOU Race Condition | **Known Tech Debt** | Concurrent tab race conditions vs. atomic SQL conditional updates. |

---

## 2. API Specifications

* **[OpenAPI 3.0 Specification](./openapi.yaml):** Formal schema and route definitions for Authentication, Kanban & Task management, and Chat channels/messages. Can be imported into Swagger UI, Postman, or Insomnia.

