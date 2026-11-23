# Syncra

<div align="center">

**High-Concurrency Multi-Tenant Collaboration & Real-Time Workspace Engine**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%2F6.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-black?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-white?logo=socket.io&logoColor=black)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0.3-6BA539?logo=openapi-initiative&logoColor=white)](docs/openapi.yaml)

</div>

---

## 📌 Executive Summary

**Syncra** is an enterprise-grade, real-time collaboration engine engineered for high-concurrency team environments. Designed from the ground up as a type-safe TypeScript monorepo, Syncra delivers seamless multi-tenant organization workspaces, event-driven real-time messaging, and interactive Kanban project tracking.

Unlike toy demonstration applications, Syncra is built with production constraints in mind: zero-leakage tenant boundaries, cryptographic token rotation, sub-millisecond session authentication, $\mathcal{O}(1)$ fractional indexing for drag-and-drop state machines, and documented architecture decision records (ADRs).

---

## 🏗️ System Architecture

Syncra utilizes a decoupled client-server architecture orchestrated within a Turborepo monorepo, pairing an asynchronous Express 5 event-loop backend with a reactive React 19 single-page application.

```mermaid
flowchart TD
    subgraph ClientLayer ["Client Layer (apps/web)"]
        UI["React 19 SPA (Vite)"]
        State["Zustand Store + TanStack Query"]
        WSClient["Socket.IO Client"]
    end

    subgraph GatewayLayer ["Application Gateway (apps/api)"]
        HTTP["Express 5 HTTP Engine"]
        WSServer["Socket.IO WebSocket Server"]
        AuthMiddleware["RBAC & Tenant Context Guard"]
        RateLimiter["Helmet & Rate Limiter"]
    end

    subgraph PersistenceLayer ["Data & Storage Layer"]
        PrismaClient["Prisma 7 ORM"]
        Postgres[(PostgreSQL DB)]
        S3Storage["Supabase Storage / S3 CDN"]
    end

    UI -->|HTTP REST Requests (Axios)| RateLimiter
    RateLimiter --> AuthMiddleware
    AuthMiddleware --> HTTP
    WSClient <-->|Bidirectional WebSockets (WSS)| WSServer
    HTTP --> PrismaClient
    WSServer --> PrismaClient
    PrismaClient --> Postgres
    HTTP -->|Presigned Asset Uploads| S3Storage
```

---

## ⚡ Key Engineering Highlights

### 1. $\mathcal{O}(1)$ Fractional Indexing for Kanban Ordering
Traditional position columns rely on integer sequences ($1, 2, 3, \dots, N$). Moving an item to the top of a column forces an $\mathcal{O}(N)$ write cascade (`UPDATE tasks SET position = position + 1 WHERE position >= target`), which triggers heavy database row locks and lock contention during concurrent operations.
* **Syncra Solution**: Implemented midpoint fractional indexing. Reordering a task calculates its new position as $P_{\text{new}} = \frac{P_{\text{before}} + P_{\text{after}}}{2}$.
* **Performance**: Yields deterministic $\mathcal{O}(1)$ single-row updates regardless of column size.
* **Precision Protection**: Includes a bounded rebalancing trigger to gracefully prevent 64-bit IEEE 754 floating-point underflow.
* 👉 Read the full architectural trade-off: [**`ADR-002: Fractional Indexing for Kanban Card Reordering`**](docs/adr/002-fractional-indexing-kanban-ordering.md)

### 2. Cryptographic Dual-Token Session Authentication
Many web applications unsafely store raw JWT tokens in browser `localStorage`, exposing entire user sessions to cross-site scripting (XSS) exfiltration.
* **Syncra Solution**: Employs short-lived 15-minute access tokens coupled with 7-day cryptographic refresh tokens stored in hardened `HttpOnly; Secure; SameSite=Strict` browser cookies.
* **High-Throughput Hashing**: Refresh tokens are 512-bit CSPRNG secrets hashed via **SHA-256** before database persistence. Unlike bcrypt (which consumes 100–300ms of CPU time and exhausts Node.js worker pools), SHA-256 hashes high-entropy secrets in sub-millisecond execution time.
* **Theft & TOCTOU Race Mitigation**: Token rotation implements an atomic conditional query to prevent Time-of-Check to Time-of-Use token recycling attacks.
* 👉 Read the full architectural trade-off: [**`ADR-001: SHA-256 vs. bcrypt for Refresh Tokens`**](docs/adr/001-sha256-vs-bcrypt-refresh-tokens.md) and [**`ADR-003: HttpOnly Cookies vs. localStorage`**](docs/adr/003-httponly-cookies-vs-localstorage.md)

### 3. Bidirectional Real-Time Event Engine
Collaboration requires instant feedback loops for presence, active typing, and task board changes.
* **Syncra Solution**: Real-time event transport driven by Socket.IO with strict room-based routing.
* **Tenant & Channel Isolation**: Sockets join explicit workspace (`workspace:${workspaceId}`) and channel rooms (`channel:${channelId}`). Messages and typing events are isolated to authorized participants, preventing cross-tenant and cross-channel data snooping.
* 👉 Read the full architectural trade-off: [**`ADR-004: Socket.IO Room Privacy Isolation`**](docs/adr/004-socket-workspace-room-privacy-tradeoffs.md) and [**`ADR-005: In-Memory Pub/Sub vs. Redis Adapter`**](docs/adr/005-socketio-inmemory-to-redis-adapter.md)

### 4. Multi-Tenant Data Isolation & RBAC
* **Hierarchical Role Matrix**: Supports granular role inheritance (`OWNER` > `ADMIN` > `MEMBER` > `VIEWER`).
* **Tenant-Scoped Context**: All operational queries automatically inject the active workspace ID (`WHERE workspaceId = ...`), ensuring zero cross-tenant data bleed.
* 👉 Read the full architectural trade-off: [**`ADR-007: Tenant Context Omission on Token Refresh`**](docs/adr/007-tenant-context-omission-on-token-refresh.md)

---

## 📂 Monorepo Structure

```text
Collaboration Platform/
├── apps/
│   ├── api/                     # Backend API & WebSocket Engine (Express 5, Prisma 7, Socket.IO)
│   │   ├── prisma/              # Schema definitions and SQL migrations
│   │   └── src/
│   │       ├── middleware/      # Auth, RBAC, tenant resolution, rate limiters
│   │       ├── modules/         # Domain modules: auth, workspace, project, chat, storage, ai
│   │       └── lib/             # Supabase storage, Prisma client singleton, logger
│   └── web/                     # Frontend SPA (React 19, Vite 8, Tailwind v4, Zustand)
│       └── src/
│           ├── components/      # Modular UI primitives and compound components
│           ├── pages/           # Workspace, Kanban, Chat, Settings views
│           ├── stores/          # Zustand global state slices
│           └── routes/          # Protected and public route trees
├── packages/
│   └── validators/              # Shared Zod schemas for contracts, RBAC, and socket events
├── docs/                        # Architectural specifications and OpenAPI contract
│   ├── adr/                     # 8 Formal Architecture Decision Records
│   ├── README.md                # Documentation index
│   └── openapi.yaml             # Complete OpenAPI 3.0.3 API Contract
└── turbo.json                   # Turborepo task pipeline orchestration
```

---

## 📑 Architecture Decision Records (ADRs)

Every major engineering decision in Syncra is documented with its threat model, alternatives considered, and failure modes:

| ADR ID | Decision Title | Status | Core Trade-off |
| :--- | :--- | :--- | :--- |
| [**ADR-001**](docs/adr/001-sha256-vs-bcrypt-refresh-tokens.md) | SHA-256 vs. bcrypt for Refresh Tokens | `ACCEPTED` | High-entropy CSPRNG tokens vs. worker pool CPU saturation |
| [**ADR-002**](docs/adr/002-fractional-indexing-kanban-ordering.md) | Fractional Indexing for Kanban Card Reordering | `ACCEPTED` | $\mathcal{O}(1)$ single-row updates vs. $\mathcal{O}(N)$ integer shifting cascades |
| [**ADR-003**](docs/adr/003-httponly-cookies-vs-localstorage.md) | HttpOnly Cookies vs. localStorage for Auth | `ACCEPTED` | XSS attack surface elimination vs. CSRF header defense |
| [**ADR-004**](docs/adr/004-socket-workspace-room-privacy-tradeoffs.md) | Socket.IO Workspace-Wide Rooms vs. Channel Rooms | `ACCEPTED` | Privacy boundary isolation vs. connection complexity |
| [**ADR-005**](docs/adr/005-socketio-inmemory-to-redis-adapter.md) | In-Memory Socket.IO vs. Redis Pub/Sub Adapter | `ACCEPTED` | Zero-dependency local dev vs. horizontal scale-out roadmap |
| [**ADR-006**](docs/adr/006-cross-entity-search-prisma-vs-postgres-fts.md) | Cross-Entity Search: Prisma vs. PostgreSQL FTS | `ACCEPTED` | Parallel Prisma queries vs. PostgreSQL `tsvector` + GIN index |
| [**ADR-007**](docs/adr/007-tenant-context-omission-on-token-refresh.md) | Tenant Context Omission on Token Refresh | `ACCEPTED` | Global user identity tokens vs. workspace tenant scoping |
| [**ADR-008**](docs/adr/008-refresh-token-rotation-toctou-race-condition.md) | Refresh Token Rotation TOCTOU Race Condition | `ACCEPTED` | Atomic SQL conditional updates vs. app-level read-check-write |

---

## 🚀 Quickstart & Local Setup

### Prerequisites
* **Node.js**: `v20.x` or `v22.x` (LTS recommended)
* **Package Manager**: `pnpm` (v9+) or `npm` (v10+)
* **Database**: PostgreSQL 15+ instance (local or hosted via Supabase / Neon)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/nikhilverma29/Collaboration-platform.git
cd Collaboration-platform
npm install
```

### 2. Configure Environment Variables
Create `.env` inside `apps/api/`:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/syncra?schema=public"

JWT_SECRET="your-256-bit-access-token-secret"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN_DAYS=7

CORS_ORIGIN="http://localhost:5173"
CLIENT_URL="http://localhost:5173"

SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_KEY="your-supabase-service-role-key"
```

Create `.env` inside `apps/web/`:
```env
VITE_API_URL="http://localhost:5000/api"
VITE_SOCKET_URL="http://localhost:5000"
```

### 3. Database Migration & Prisma Generation
```bash
# Push Prisma schema to your database
npx prisma migrate dev --schema=apps/api/prisma/schema.prisma

# Generate Prisma Client
npx prisma generate --schema=apps/api/prisma/schema.prisma
```

### 4. Run Development Servers
```bash
# Starts both Express API (:5000) and Vite Web (:5173) in parallel
npm run dev
```

Visit **`http://localhost:5173`** to access the Syncra workspace dashboard.

---

## 📡 API Contract Specification

Syncra adheres strictly to an OpenAPI 3.0.3 contract covering:
* Authentication & Token Lifecycle (`/api/auth/*`)
* Workspace Management & Multi-Tenancy (`/api/workspaces/*`)
* Projects, Columns & Kanban Tasks (`/api/projects/*`, `/api/tasks/*`)
* Messaging Channels & Real-Time Chat (`/api/channels/*`, `/api/messages/*`)

The full contract is documented at [**`docs/openapi.yaml`**](docs/openapi.yaml). You can visualize it by importing the file directly into [Swagger Editor](https://editor.swagger.io/) or Postman.

---

## 🛡️ License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
