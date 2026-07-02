# Roadmap

## Purpose

This roadmap defines the official build order of the collaboration platform.
The order is intentional and dependency-driven. It exists to ensure that every
feature is built on a stable foundation and that the project grows in a way
that is structurally sound, maintainable, and believable as a serious
enterprise-style system.

## APPROACH — BACKEND FIRST

Phases 1 through 8 are backend and database only.
No frontend work happens in these phases.
All UI references have been removed from phase deliverables.
Phase 9 is the dedicated frontend phase where apps/web is built
from scratch in one focused effort against a fully tested backend.

---

## Phase 0 — Engineering Foundation ✅ COMPLETE

Repository is clean. TurboRepo monorepo exists. apps/api and apps/web
are scaffolded. Prisma connects to Supabase. Express server starts.
Shared packages exist. No product code yet.

---

## Phase 1 — Core Architecture & Multi-Tenancy ✅ COMPLETE

### Objective
Build the foundational tenant model for the entire platform.

### Scope
- workspace creation
- workspace switching
- workspace membership model
- auth foundation (register, login, refresh, logout)
- password reset / forgot password flow
- tenant-aware data access
- PostgreSQL schema foundation
- workspace isolation logic
- RLS-ready design
- core base entities
- user profile update APIs (name, avatar, bio)
- change password API
- session management (view active sessions, revoke sessions)
- workspace settings APIs (rename, update domain whitelist, delete)
- member invite via email
- dashboard summary API (aggregated workspace stats endpoint)

### Deliverables
- user model
- workspace model
- workspace_members model
- refresh_tokens model
- audit_logs model (schema ready for Phase 2)
- auth routes: register, login, refresh, logout,
  forgot-password, reset-password
- profile routes: get profile, update profile,
  change password, upload avatar
- session routes: list sessions, revoke session
- workspace routes: create, get, update settings,
  delete, switch
- member routes: invite via email, list members,
  remove member
- dashboard route: aggregated workspace summary
- tenant middleware
- auth middleware

### Exit criteria
A user can register, log in, reset their password, update their
profile, manage their sessions, create a workspace, invite members,
and have all data queries correctly scoped to that workspace.

---

## Phase 2 — RBAC & Governance ✅ COMPLETE

### Objective
Add role-based control and governance discipline.

### Scope
- Owner / Admin / Manager / Employee roles
- role assignment logic
- bulk role assignment
- permission checks
- middleware enforcement
- audit log schema
- important action tracking

### Deliverables
- role enum and permission matrix
- RBAC middleware
- role assignment routes
- bulk role assignment route
- audit log table populated on sensitive actions
- admin-only route guards
- governance action restrictions

### Exit criteria
The system can safely distinguish who can do what, and all
sensitive actions are audit-tracked.

---

## Phase 2.5 — Realtime Event Scaffold ✅ COMPLETE

### Objective
Create the live event backbone before building any user-facing
realtime product.

### Scope
- Socket.io setup
- workspace-scoped rooms
- presence skeleton
- authentication for socket connections
- generic event dispatch structure
- broadcast conventions

### Important restriction
No chat product. No communication UI. Infrastructure only.

### Deliverables
- Socket.io server with workspace rooms
- presence state engine
- event naming conventions
- event utility helpers
- socket auth middleware

### Exit criteria
The system can establish live workspace-scoped connections
and broadcast placeholder events safely.

---

## Phase 3 — Projects & Kanban (BACKEND ONLY)

### Objective
Build the project execution engine — all APIs and database
schema. No frontend.

### Scope
- projects (create, read, update, delete, archive)
- project settings (rename, archive, delete, member management)
- boards and columns
- tasks with: title, description, assignee, due date,
  priority (low/medium/high/urgent), status, labels/tags
- task CRUD (create, read, update, delete)
- task assignment flow
- task filters API (by assignee, priority, due date,
  status, label)
- drag and drop position/order persistence
- task history and activity tracking
- realtime task mutation events over socket bus

### Deliverables
- project model + routes + controllers + services
- project settings routes
- board and column models + routes
- task model with priority, labels fields + routes
- task filter query API
- task history model + routes
- task position/order update route
- socket events for task mutations

### Exit criteria
All project and task APIs are complete, tested via HTTP tool,
and task changes emit live socket events. No UI exists.

---

## Phase 4 — Documents & Storage (BACKEND ONLY)

### Objective
Build the file and knowledge system — all APIs and storage
pipeline. No frontend.

### Scope
- folder hierarchy (create, rename, move, delete)
- file upload handling
- file management (rename, move, delete)
- storage integration (Supabase Storage / S3)
- document preview generation
- private access controls
- expiring vendor share links
- file metadata
- folder-level live presence via socket

### Deliverables
- folder model + full CRUD routes
- file model + upload, rename, move, delete routes
- storage pipeline (presigned URLs, private buckets)
- preview route
- share link model + expiry job (BullMQ)
- file access enforcement middleware
- socket events for folder presence

### Exit criteria
Users can upload, organize, preview, manage, and securely
share documents via API. No UI exists.

---

## Phase 5 — Full Realtime Communication (BACKEND ONLY)

### Objective
Build the communication system on top of the existing
realtime backbone. No frontend.

### Scope
- workspace channels (public and private)
- channel management (create, rename, archive, delete)
- channel member management (add/remove for private channels)
- direct messages (1:1)
- threads and replies
- reactions
- message edit
- message delete
- typing indicators
- read receipts
- message persistence
- file attachments in messages (reuses Phase 4 storage)
- optimistic event structure

### Deliverables
- channel model + full CRUD + management routes
- channel membership routes
- message model + CRUD routes (including edit/delete)
- thread/reply model + routes
- reaction model + routes
- read receipt model + routes
- file attachment support in messages
- socket events for all message operations
- typing indicator socket events

### Exit criteria
All communication APIs are complete and tested. Messages
persist, threads work, reactions work, edit/delete work,
file attachments work. No UI exists.

---

## Phase 6 — Global Search (BACKEND ONLY)

### Objective
Create a universal discovery layer. No frontend.

### Scope
- full-text search across messages, tasks, documents
- workspace-filtered indexing
- search filter API (by entity type, date range, author)
- relevance tuning
- tsvector indexes on searchable fields
- pg_trgm for fuzzy/partial match

### Deliverables
- tsvector indexes on messages, tasks, files, folders
- search API with entity type filter, date filter,
  author filter, workspace scope
- search ranking and relevance logic

### Exit criteria
A single search API returns relevant results across all
entity types with correct workspace scoping and filter
support. No UI exists.

---

## Phase 7 — Org Chart & Calendar (BACKEND ONLY)

### Objective
Build the organizational coordination layer. No frontend.

### Scope
- reporting hierarchy (reports_to relationship on users)
- org chart data API
- calendar events (create, read, update, delete)
- recurring events
- event attendees and invites
- meeting scheduling
- availability tracking
- leave / OOO requests
- manager approval flow for leave
- presence integration (approved leave auto-updates
  presence to OOO)

### Deliverables
- reports_to field on user model
- org chart query API
- calendar event model + full CRUD routes
- recurring event support
- attendee model + invite routes
- leave request model + routes
- manager approval routes
- OOO presence integration via socket

### Exit criteria
Org structure is queryable. Calendar events can be created,
edited, deleted with attendees. Leave requests flow through
manager approval and update presence. No UI exists.

---

## Phase 8 — AI Copilot (BACKEND ONLY)

### Objective
Add intelligent assistance on top of the finished system.
No frontend.

### Scope
- channel message summarization (last N messages → LLM)
- task enrichment (title → user story + acceptance criteria)
- document Q&A via RAG (pgvector, workspace-scoped)
- natural language command bar (parse intent → execute action)
- AI action execution APIs:
    create task from AI command
    assign task from AI command
    schedule meeting from AI command
- AI widget data APIs:
    daily summary widget
    blocked tasks widget
    upcoming meetings widget
- workspace-aware retrieval
- all AI jobs run through BullMQ (non-blocking)

### Deliverables
- summarization endpoint
- task enrichment endpoint
- RAG pipeline (document ingestion + query)
- command parser endpoint
- AI action execution routes
- AI widget data routes
- BullMQ jobs for all AI operations
- pgvector indexes on document content

### Exit criteria
All AI endpoints are complete and tested. Summarization,
enrichment, RAG, and command execution work correctly
against real workspace data. No UI exists.

---

## Phase 9 — Frontend (apps/web built from scratch)

### Objective
Design and build the entire frontend in one focused effort
against a fully tested, documented backend.

### Approach
Follow the Staged_Discussion_Frontend.md document exactly.

Stage 1: Design decisions (design system, entry flow,
         shell, navigation, primitive components)
Stage 2: Screen specifications (all 15 screens)
Implementation order as defined in the frontend document.

### Why this is last
- Every API exists and is tested before a pixel is placed
- Cohesive design — entire UI built with one design language
- No frontend blocked waiting for backend
- No "Phase 1 auth UI looks different from Phase 5 chat UI"
  problem

### Screens to build (in implementation order)
1. Design System (Tailwind theme + shadcn customization)
2. Global Layout (App Shell)
3. Navigation
4. Authentication Pages (login, signup, forgot password,
   workspace creation, workspace joining, onboarding)
5. Dashboard
6. Projects
7. Kanban
8. Documents
9. Chat
10. Calendar
11. Search
12. Notifications
13. AI Copilot
14. Admin & Governance
15. User Profile & Settings

### Exit criteria
The entire frontend is built, all screens connect to real
backend APIs, all features are functional end-to-end,
and the product is ready to be shown as a portfolio piece.

---

## Notifications System — Placement Decision

The frontend requires a full notifications system:
notification center, toasts, activity feed.

This system touches multiple phases (tasks emit notifications,
messages emit notifications, calendar events emit notifications).

### Decision
The notification schema (notification table, delivery rules)
is defined in Phase 2 alongside the audit log.
Notification events are emitted in each relevant phase
(Phase 3 emits task notifications, Phase 5 emits message
notifications, Phase 7 emits calendar notifications).
The notification query API (list, mark read, mark all read,
clear) is finalized in Phase 6 alongside search since both
are read-heavy query patterns.

---

## Build Rules Across All Phases

### Rule 1
Finish the current phase before starting the next.

### Rule 2
Keep all implementations workspace-aware.
Every feature is tenant-scoped.

### Rule 3
Enforce security on the backend.
Frontend checks are not enough.

### Rule 4
Reuse the same architectural conventions.
Do not reinvent data flow, validation, naming,
or response format in every phase.

### Rule 5
Keep future phases out of current work.

### Rule 6
Make each phase production-grade.
If a phase ships, it should feel complete enough
to defend in an interview.

### Rule 7 (NEW)
Phases 1 through 8 are backend only.
Do not build any frontend in these phases.
apps/web is touched only in Phase 9.

---

## Release Milestones

### Milestone A — Foundation Ready
Phase 0, 1, 2 complete.

### Milestone B — Enterprise Work Platform
Phase 3 and 4 complete.

### Milestone C — Collaboration Platform
Phase 5 and 6 complete.

### Milestone D — Full Internal Operating Layer
Phase 7 and 8 complete.

### Milestone E — Shippable Product
Phase 9 complete. Full stack. Portfolio ready.

