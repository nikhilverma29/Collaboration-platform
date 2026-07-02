# Project Ramayana

## Section 1. Overview

**Project Ramayana** is the constitutional document for the collaboration platform. It is the single source of truth for the product vision, engineering principles, architecture boundaries, and long-term intent of the system.

This project is not a toy app, not a demo, and not a random collection of features. It is a serious, enterprise-style internal collaboration platform designed to simulate the kind of software used inside large companies for day-to-day work management, communication, document handling, governance, and operational coordination. 

The project exists to achieve one goal:

> **Build a portfolio-grade enterprise collaboration platform that looks and behaves like real corporate software, while also being architected in a way that a serious engineering team would respect.**

The project is being built for resume strength, placement value, architecture maturity, and technical depth. It should therefore be treated as a professional engineering product, not as a casual hobby project.

---

## Section 2. Product Identity

### Working product category
Enterprise collaboration platform / internal work operating system.

### Product personality
- Structured
- Secure
- Multi-tenant
- Realtime-capable
- Permission-aware
- Professional yet modern, minimal and aesthetic
- Scalable in design
- Easy to reason about
- Built for disciplined growth

### What the product is trying to achieve

The platform is designed as a collection of **enterprise-inspired collaboration modules**, where each module exists to demonstrate a specific real-world software engineering concept rather than replicate an existing commercial product.

The focus is on building a cohesive system that showcases:

* Secure workspace-based collaboration
* Multi-tenant architecture
* Real-time communication infrastructure
* Structured project and task management
* Secure document storage and management
* Role-based access control and governance
* Fast and scalable information retrieval
* AI-assisted productivity workflows

Each module should feel realistic, professionally designed, and well integrated with the rest of the platform. The objective is **not** to achieve feature parity with commercial enterprise software, but to demonstrate strong software engineering, clean architecture, and production-oriented system design through a unified portfolio project.


### What the product is not
This is **not**:
- a public social platform
- a startup MVP for raising funding
- a generic clone of Slack, Notion, or Jira
- a flashy “vibe-coded” frontend demo
- a backendless toy project
- a feature dump without architecture

---

## Section 3. Core Objective

The core objective is to build a product that can be shown to recruiters, interviewers, and experienced engineers as evidence of:
- architectural thinking
- multi-tenant system design
- access control design
- enterprise backend organization
- realtime system planning
- clean, modern, animated and minimal frontend state management
- proper data modeling
- AI-assisted development discipline
- production-style engineering judgment

The codebase must therefore communicate one message clearly:

> **This project was designed with the mindset of a real engineering team, not a student cloning a UI for fun.**

---

## Section 4. Target User Model

The software is designed around workspace-based corporate usage.

### Typical users inside a workspace
- Owner
- Admin
- Manager
- Employee

### Typical functional units
- Workspace / tenant
- Channels / communication spaces
- Projects / boards / tasks
- Documents / folders / files
- Audit logs / governance events
- Calendar / meetings / leave management
- Search / discovery
- AI copilot / summarization / retrieval

### Conceptual user behavior
A user joins a workspace, receives a role, works inside structured access boundaries, collaborates with teammates, uploads documents, manages tasks, participates in conversations, and uses the platform as an internal work hub.

---

## Section 5. Engineering Philosophy

This project follows a strict engineering philosophy.

### 5.1 Build like an enterprise product
Every choice should be made with long-term maintainability in mind:
- clear ownership boundaries
- proper tenant isolation
- server-side enforcement of security
- reusable shared schemas
- predictable folder structure
- consistent error handling
- intentional naming
- scalable module boundaries

### 5.2 Prefer architecture over improvisation
The project should not be assembled by random feature coding. Every phase should be built on top of stable foundations.

### 5.3 Keep the stack coherent
The stack must support the product, not fight it. The chosen technologies should remain stable unless a decision is deliberately revised.

### 5.4 Treat AI as a builder, not an architect
AI (claude, gemini), means you is used to accelerate implementation, not to invent the project’s identity on the fly. The architecture must come first, then the AI should be instructed to build inside that structure.

### 5.5 Favor depth over feature spam
A serious project is not impressive because it has twenty half-working modules. It is impressive because the critical modules are deep, consistent, and reliable and most IMPORTANTLY secured end to end.

---

## Section 6. Finalized Technical Stack

### Core engine and language
- **TypeScript** in strict mode
- **Node.js** runtime

### Frontend
- **React** with **Vite**
- **TanStack Query** for server state
- **Zustand** for client state
- **Tailwind CSS** for styling
- **shadcn/ui** for composable UI primitives
- **React Hook Form** for forms
- **Zod** for validation

### Backend
- **Express.js**
- **Zod** middleware validation
- **Helmet** for security headers
- **express-rate-limit** for abuse prevention

### Database and access layer
- **PostgreSQL hosted on Supabase**
- **Prisma ORM**
- **Supabase pgvector** for vector retrieval
- **PostgreSQL text search / trigram search** for discovery

### Realtime
- **Socket.io** with workspace-scoped rooms

### Auth and security
- **Native JWT — custom implementation. This decision is final.**
- Access tokens: 15-minute lifespan, stateless, signed with HS256
- Refresh tokens: 7-day lifespan, stored in the database, rotated on use
- Tokens are stored in HTTP-only, SameSite=Strict, Secure cookies 
  — never in localStorage or JavaScript-accessible memory
- bcryptjs for password hashing before any credential is written to the database
- Supabase Auth is NOT used in this project. Do not suggest it, do not introduce it, do not reference it as an alternative.
- The JWT payload contains: userId, workspaceId, role, and sessionId at minimum — giving every middleware instant access to tenant and permission context without an extra database call

### Storage and AI
- **Supabase Storage** or **AWS S3**
- **Vercel AI SDK**
- OpenAI / Anthropic or other approved model providers

### Repository structure
- TurboRepo monorepo
- Shared packages for UI, validators, and TypeScript configuration

---

## Section 7. Architectural Non-Negotiables

The following rules are not optional.

### 7.1 Tenant isolation first
Every important business query must be tenant-aware. Data belonging to one workspace must never leak into another workspace.

### 7.2 Backend enforcement, not frontend trust
Frontend masking is for user experience only. All permissions and access rules must be enforced on the server.

### 7.3 Shared validation schemas
Zod schemas should be reusable across frontend and backend whenever it reduces duplication.

### 7.4 No random architectural drift
Do not introduce new frameworks, patterns, or conventions in the middle of a phase without an intentional decision.

### 7.5 Consistent module layering
Controllers should not become dumping grounds. Services, repositories, and utility layers should exist for a reason.

### 7.6 Strong database discipline
Schema design should be intentional, with naming, indexing, and relationships defined before implementation is rushed.

### 7.7 Realtime as infrastructure
Socket.io is not just a chat tool. It is the realtime event bus for tasks, presence, notifications, chat, and document collaboration.

### 7.8 AI features are final-layer features
AI should be built on top of working product data, not used to compensate for a broken core.

---

## Section 8. Product Pillars
The platform is organized into several core capabilities.These capabilities represent the major functional domains of the system. They are intentionally not numbered because their implementation order is defined separately in ROADMAP.md. ROADMAP.md is the only document that defines build order.


### Phase 1 — Core Architecture + Multi-Tenancy
The foundation layer.
- workspace creation
- workspace switching
- auth foundation
- tenant isolation
- row-level security / workspace-scoped access
- core entity relationships

### Phase 2 — RBAC & Governance
The trust layer.
- role definitions
- permission checks
- middleware guards
- audit logs
- administrative boundaries

### Phase 2.5— Realtime Event Scaffold
The transport layer.
- Socket.io connection handling
- workspace rooms
- presence foundation
- event bus only
- no chat UI yet

### Phase 3 — Projects & Kanban
The execution layer.
- boards
- columns
- tasks
- drag and drop
- task state changes
- task history

### Phase 4 — Documents & Storage
The file and knowledge layer.
- folders
- uploads
- previews
- expiring links
- private access
- secure document flow

### Phase 5 — Full Realtime Communication
The communication layer.
- channels
- DMs
- threads
- reactions
- typing indicators
- read receipts
- message persistence

### Phase 6 — Global Search
The discovery layer.
- text search across tasks, chats, and docs
- filtered workspace search
- search ranking and relevance

### Phase 7 — Org Chart & Calendar
The coordination layer.
- reporting tree
- team calendar
- meeting scheduling
- leave / out-of-office flow
- presence integration

### Phase 8 — AI Copilot
The intelligence layer.
- message summarization
- task enrichment
- document Q&A
- command execution
- workspace aware assistance



---

## Section 9. Phase Sequencing Philosophy

The phase order is not arbitrary. It is designed to minimize rework.

### Correct dependency order
1. Core tenant architecture
2. RBAC and governance
3. Realtime event infrastructure
4. Projects / Kanban
5. Documents / storage
6. Communication
7. Search
8. Org chart / calendar
9. AI copilot

This order exists because:
- realtime needs a stable workspace identity
- chat needs working infrastructure
- search needs real data to search
- AI needs working data sources
- governance must exist before powerful actions are exposed

---

## Section 10. Data Design Principles

### 10.1 Workspace-first modeling
Most tables should be workspace-scoped when the domain requires isolation.

### 10.2 Stable identifiers
Use consistent identifiers across the system. IDs should be predictable, portable, and safe for distributed usage.

### 10.3 Clear ownership
Records should know who created them, who updated them, and which workspace they belong to.

### 10.4 Auditability
Important business actions should leave behind evidence in audit logs or history tables.

### 10.5 Searchability
If an entity is likely to be searched later, the schema should support indexing and queryability from the beginning.

### 10.6 Realtime compatibility
Entities that need live updates should be shaped so they can emit events without awkward schema hacks later.

---

## Section 11. Security Principles

### 11.1 Trust the server, never the UI
Hiding a button in the frontend does not count as security.

### 11.2 Enforce workspace membership
No user should access data for a workspace they do not belong to.

### 11.3 Enforce role-based permissions
Admin actions, billing-like actions, destructive actions, and governance actions must be protected.

### 11.4 Use secure auth mechanics
Session handling should be deliberate and suitable for a serious application.

### 11.5 Validate every input
All meaningful inputs should be validated before reaching business logic.

### 11.6 Preserve private assets
Document and file access should not be public by default.

---

## Section 12. AI Collaboration Principles (Working Contract with the AI Development Agent)

This section defines how Claude (Opus/Sonnet) is expected to operate within this project. It is written as a working contract, not a restriction policy. Claude is a capable engineering partner — this section exists to orient it, not to limit it.

### 12.1 Stay inside the active phase

The phase system exists to protect architectural integrity. You should build deeply inside the current phase rather than broadly across multiple phases. If a task clearly belongs to a future phase, flag it and defer it — do not implement it speculatively.

### 12.2 Reuse what already exists

Before creating a new utility, schema, type, or helper, you should check whether something equivalent already exists in the codebase. The shared validators package, the Prisma client singleton, the JWT utility, and the middleware pipeline should be reused across the system — not duplicated per feature.

### 12.3 Follow the folder structure
The folder structure is defined in the ROADMAP.md. New files should be placed inside the correct layer (routes, controllers, services, middleware, lib) and follow the naming convention already established. Do not create new top-level folders or restructure existing ones without a documented reason.

### 12.4 Make decisions explicit

If you encounters an ambiguity or a decision point that is not 
covered by the architecture documents, it should:
- state the ambiguity clearly
- propose a solution with reasoning
- ask for confirmation before implementing

You should not silently resolve architectural ambiguities by picking whatever feels natural. Ambiguities in a multi-tenant, permission-aware system can have downstream consequences.

### 12.5 Keep implementations production-oriented

Every piece of code you writes should be:
- correctly typed in TypeScript strict mode
- validated at the boundary (Zod on input, typed on output)
- workspace-scoped where the domain requires it
- consistent with the error handling and response format 
  already established
- defensible in a technical interview

You should not write placeholder logic, skip error handling, or defer "real" implementation for later unless explicitly asked to scaffold.

### 12.6 Treat locked decisions as locked

Certain architectural decisions have been finalized and documented.You should treat these as constraints, not suggestions. If alocked decision appears suboptimal for a specific implementationdetail, you should flag the concern — but should not unilaterallydeviate from it.

### 12.8 Flag before refactoring finished phases

If you identifies a genuine improvement in a phase that hasalready been marked complete, it should describe the issue and theproposed fix clearly before making changes. Refactoring a finishedphase mid-session without flagging it first risks breakingestablished conventions that later phases depend on.

## Section 13. Quality Bar

Every meaningful module should be:
- understandable
- maintainable
- correctly typed
- validated
- secure by default
- consistent with the architecture
- ready to be defended in an interview

The project should not merely “work.” It should work in a way that reflects intentional engineering.

---

## Section 14. What Success Looks Like

The project is successful if:
- the repository feels like a serious real-world product
- the architecture is coherent and explainable
- the database design supports the product well
- the frontend is professional (polished) and not  or template-like and i am very serious that the project's frontend should not look generric, it should be modern, minimal, user-friendly, aesthetic, animatations-including.
- the backend is disciplined and secure
- the feature phases feel connected rather than random
- the system can be discussed confidently in interviews
- the databse and backend is secured end to end just like real platforms.
- recruiters and engineers can see maturity in the implementation

---

## Section 15. Final Directive

Project Ramayana should always be treated as the highest-level source of truth for the project. Whenever implementation decisions are made, they should be measured against this document.

If a future feature does not fit this vision, the feature should change, not the vision.
