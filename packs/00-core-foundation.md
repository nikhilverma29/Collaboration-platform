# 00-core-foundation — Core Foundation

## Purpose

The monorepo bootstrap layer: Express server wiring, Prisma schema + migrations, database client, JWT signing/verification, cookie management, Supabase storage client, all middleware, and the shared validators package. Every other pack depends on at least some of these files.

## Dependencies

_None — this is the root layer._

## Main User Flow

App startup → Helmet/CORS/Rate-limit middleware → Route registration → SocketService init → Global error handler → process safety nets.

## Files Involved

- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/prisma.config.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/migration_lock.toml`
- `apps/api/prisma/migrations/20260628205233_phase1_core_foundation/migration.sql`
- `apps/api/prisma/migrations/20260628215519_phase2_audit_log/migration.sql`
- `apps/api/prisma/migrations/20260630021046_phase3_projects_kanban/migration.sql`
- `apps/api/prisma/migrations/20260701065726_phase4_storage/migration.sql`
- `apps/api/prisma/migrations/20260701071749_phase5_communication/migration.sql`
- `apps/api/prisma/migrations/20260701081405_phase7_org_calendar/migration.sql`
- `apps/api/src/index.ts`
- `apps/api/src/lib/db.ts`
- `apps/api/src/lib/jwt.ts`
- `apps/api/src/lib/cookie.ts`
- `apps/api/src/lib/supabase.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/middleware/tenant.ts`
- `apps/api/src/middleware/rbac.ts`
- `packages/validators/src/index.ts`
- `packages/validators/src/auth.ts`
- `packages/validators/src/workspace.ts`
- `packages/validators/src/rbac.ts`
- `packages/validators/src/socket.events.ts`
- `packages/validators/src/socket.types.ts`
- `packages/validators/src/project.ts`
- `packages/validators/src/task.ts`
- `packages/validators/src/storage.ts`
- `packages/validators/src/channel.ts`
- `packages/validators/src/message.ts`
- `packages/validators/src/receipt.ts`
- `packages/validators/src/search.ts`
- `packages/validators/src/org.ts`
- `packages/validators/src/calendar.ts`

## Source Code

### `apps/api/package.json`

```json
{
  "name": "@syncra/api",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@ai-sdk/openai": "^4.0.4",
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "@supabase/supabase-js": "^2.110.0",
    "@types/pg": "^8.20.0",
    "ai": "^7.0.9",
    "bcryptjs": "^3.0.3",
    "cookie": "^2.0.0",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-rate-limit": "^8.5.2",
    "helmet": "^8.2.0",
    "jsonwebtoken": "^9.0.3",
    "pg": "^8.22.0",
    "socket.io": "^4.8.3",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/cookie": "^0.6.0",
    "@types/cookie-parser": "^1.4.10",
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.6",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^26.0.1",
    "prisma": "^7.8.0",
    "socket.io-client": "^4.8.3",
    "tsx": "^4.22.4"
  }
}
```

### `apps/api/tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["es2022"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `apps/api/prisma.config.ts`

```typescript
// Prisma v7 configuration
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: In Prisma v7, directUrl is removed from schema.prisma.
//
// For CLI commands (migrate dev, migrate deploy, db push):
//   → datasource.url must point to DIRECT_URL (port 5432, session mode)
//     because DDL requires a direct, non-pooled connection.
//
// For runtime (PrismaClient in application code):
//   → Pass DATABASE_URL (port 6543, transaction pooler) via a driver adapter.
//     This is handled in src/lib/db.ts in Layer 2.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Direct connection — used by Prisma CLI for migrations
    url: process.env["DIRECT_URL"],
  },
});
```

### `apps/api/prisma/schema.prisma`

```prisma
// =============================================================================
// Project Ramayana — Schema (Phases 1 · 2 · 3 · 4 · 5)
// =============================================================================
// Phase 1: User, Workspace, WorkspaceMember, RefreshToken
// Phase 2: AuditLog
// Phase 3: Project, Board, Column, Task, TaskLabel, TaskHistory
// Phase 4: Folder, File, ShareLink
// Phase 5: Channel, ChannelMember, Message, Reaction, ReadReceipt
// Do not modify this schema outside of a documented, deliberate decision.
// =============================================================================

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearchPostgres"]
}

datasource db {
  provider = "postgresql"
}

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/// The four roles a member can hold inside a workspace.
/// Defined here so Phase 2 (RBAC) can build permission logic on top of it.
enum WorkspaceRole {
  OWNER
  ADMIN
  MANAGER
  EMPLOYEE
}

// -----------------------------------------------------------------------------
// User
// The core identity record. A user exists independently of any workspace.
// Workspace access is granted through WorkspaceMember entries.
// -----------------------------------------------------------------------------

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  displayName  String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  memberships        WorkspaceMember[]
  ownedWorkspaces    Workspace[]       @relation("WorkspaceOwner")
  refreshTokens      RefreshToken[]
  auditLogs          AuditLog[]        @relation("UserAuditLogs")
  // Phase 3
  createdProjects    Project[]         @relation("ProjectCreator")
  projectMemberships ProjectMember[]
  assignedTasks      Task[]            @relation("TaskAssignee")
  reportedTasks      Task[]            @relation("TaskReporter")
  taskHistoryEntries TaskHistory[]     @relation("TaskHistoryActor")
  // Phase 4
  createdFolders     Folder[]          @relation("FolderCreator")
  createdFiles       File[]            @relation("FileCreator")
  createdShareLinks  ShareLink[]       @relation("ShareLinkCreator")
  // Phase 5
  channelMemberships ChannelMember[]
  messages           Message[]         @relation("MessageAuthor")
  editedMessages     Message[]         @relation("MessageEditor")
  reactions          Reaction[]
  readReceipts       ReadReceipt[]
  createdChannels    Channel[]         @relation("ChannelCreator")

  // Phase 7
  managerId          String?
  manager            User?             @relation("UserManager", fields: [managerId], references: [id])
  directReports      User[]            @relation("UserManager")
  organizedMeetings  Meeting[]         @relation("MeetingOrganizer")
  meetingInvitations MeetingParticipant[]
  leaveRequests      LeaveRequest[]    @relation("LeaveRequester")
  reviewedLeaves     LeaveRequest[]    @relation("LeaveReviewer")

  @@map("users")
}

// -----------------------------------------------------------------------------
// Workspace
// The tenant unit. Every piece of business data in the system belongs to
// a workspace. Isolation is enforced at the query layer, not via RLS.
// -----------------------------------------------------------------------------

model Workspace {
  id         String   @id @default(cuid())
  name       String
  /// URL-safe unique identifier for the workspace (e.g. "acme-corp").
  slug       String   @unique
  logoUrl    String?
  /// Shareable invite code. Users present this code to join the workspace.
  /// Can be rotated by an admin in a future phase.
  inviteCode String   @unique @default(cuid())
  ownerId    String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  // Relations
  owner     User              @relation("WorkspaceOwner", fields: [ownerId], references: [id])
  members   WorkspaceMember[]
  auditLogs AuditLog[]        @relation("WorkspaceAuditLogs")
  // Phase 3
  projects  Project[]
  tasks     Task[]
  // Phase 4
  folders   Folder[]
  files     File[]
  // Phase 5
  channels  Channel[]
  messages  Message[]

  // Phase 7
  meetings       Meeting[]
  leaveRequests  LeaveRequest[]

  @@index([ownerId])
  @@map("workspaces")
}

// -----------------------------------------------------------------------------
// WorkspaceMember
// The pivot table that connects a User to a Workspace with a Role.
// This is the tenant isolation pivot — every tenant-scoped query will
// JOIN or filter through this table to verify membership and role.
// -----------------------------------------------------------------------------

model WorkspaceMember {
  id          String        @id @default(cuid())
  workspaceId String
  userId      String
  role        WorkspaceRole @default(EMPLOYEE)
  joinedAt    DateTime      @default(now())

  // Relations
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// A user can only be a member of the same workspace once.
  @@unique([workspaceId, userId])
  @@index([workspaceId])
  @@index([userId])
  @@map("workspace_members")
}

// -----------------------------------------------------------------------------
// RefreshToken
// Persisted session record. One row per active device/session per user.
// Token rotation: on every use, the old record is invalidated and a new
// one is inserted. The sessionId is embedded in the JWT access token.
// -----------------------------------------------------------------------------

model RefreshToken {
  id        String   @id @default(cuid())
  /// The raw refresh token is never stored. Only its bcrypt hash is persisted.
  tokenHash String   @unique
  userId    String
  /// Embedded in the JWT payload. Lets middleware identify the session without
  /// a database lookup on every request.
  sessionId String   @unique @default(cuid())
  expiresAt DateTime
  isRevoked Boolean  @default(false)
  createdAt DateTime @default(now())

  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([sessionId])
  @@map("refresh_tokens")
}

// -----------------------------------------------------------------------------
// AuditLog
// Tracks governance and sensitive administrative actions at the tenant level.
// -----------------------------------------------------------------------------

model AuditLog {
  id          String   @id @default(cuid())
  workspaceId String
  actorId     String?  // Optional in case the actor is deleted
  action      String
  targetId    String?
  metadata    Json?
  createdAt   DateTime @default(now())

  workspace   Workspace @relation("WorkspaceAuditLogs", fields: [workspaceId], references: [id], onDelete: Cascade)
  actor       User?     @relation("UserAuditLogs", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([actorId])
  @@index([action])
  @@map("audit_logs")
}

// =============================================================================
// Phase 3 — Projects & Kanban
// =============================================================================

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/// Priority level of a task.
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

/// Lifecycle status of a task.
enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
  CANCELLED
}



enum MeetingParticipantStatus {
  PENDING
  ACCEPTED
  DECLINED
  TENTATIVE
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
}

/// The type of action recorded in task history.
enum TaskHistoryAction {
  CREATED
  UPDATED
  ASSIGNED
  UNASSIGNED
  STATUS_CHANGED
  PRIORITY_CHANGED
  MOVED
  ARCHIVED
  DELETED
}

// -----------------------------------------------------------------------------
// Project
// A high-level container for work within a workspace.
// A workspace can have many projects.
// -----------------------------------------------------------------------------

model Project {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  description String?
  isArchived  Boolean  @default(false)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace   Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy   User            @relation("ProjectCreator", fields: [createdById], references: [id])
  members     ProjectMember[]
  boards      Board[]

  @@index([workspaceId])
  @@index([createdById])
  @@map("projects")
}

// -----------------------------------------------------------------------------
// ProjectMember
// Tracks which workspace members have access to a specific project.
// Allows project-level visibility control beyond workspace membership.
// -----------------------------------------------------------------------------

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  addedAt   DateTime @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([projectId])
  @@index([userId])
  @@map("project_members")
}

// -----------------------------------------------------------------------------
// Board
// A Kanban board that belongs to a Project.
// Each project has one default board.
// -----------------------------------------------------------------------------

model Board {
  id        String   @id @default(cuid())
  projectId String
  name      String   @default("Main Board")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  columns Column[]

  @@index([projectId])
  @@map("boards")
}

// -----------------------------------------------------------------------------
// Column
// A vertical stage on a Board (e.g. "To Do", "In Progress", "Done").
// Columns define the workflow states for tasks.
// -----------------------------------------------------------------------------

model Column {
  id       String @id @default(cuid())
  boardId  String
  name     String
  /// Display order of this column on the board. Lower = further left.
  position Int

  board Board  @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@index([boardId])
  @@map("columns")
}

// -----------------------------------------------------------------------------
// Task
// The core unit of work. Tasks live inside a Column on a Board.
// They carry priority, status, labels, assignee, due date, and ordering.
// -----------------------------------------------------------------------------

model Task {
  id          String       @id @default(cuid())
  workspaceId String
  projectId   String
  columnId    String
  title       String
  description String?
  priority    TaskPriority @default(MEDIUM)
  status      TaskStatus   @default(TODO)
  /// Comma-separated tags / labels. Stored as plain text for Phase 3 simplicity.
  /// Phase 6 (search) will index these.
  labels      String?
  assigneeId  String?
  reporterId  String
  dueDate     DateTime?
  /// Floating-point position for drag-and-drop order within a column.
  /// Avoids integer reordering cascades.
  position    Float        @default(0)
  isArchived  Boolean      @default(false)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  workspace Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  column    Column        @relation(fields: [columnId], references: [id], onDelete: Cascade)
  assignee  User?         @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  reporter  User          @relation("TaskReporter", fields: [reporterId], references: [id])
  history   TaskHistory[]

  @@index([workspaceId])
  @@index([projectId])
  @@index([columnId])
  @@index([assigneeId])
  @@index([status])
  @@index([priority])
  @@map("tasks")
}

// -----------------------------------------------------------------------------
// TaskHistory
// Immutable append-only log of every mutation to a Task.
// This powers the activity timeline visible in the task detail view.
// -----------------------------------------------------------------------------

model TaskHistory {
  id        String            @id @default(cuid())
  taskId    String
  actorId   String?
  action    TaskHistoryAction
  /// JSON snapshot of what changed. e.g. { "from": "TODO", "to": "IN_PROGRESS" }
  metadata  Json?
  createdAt DateTime          @default(now())

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actor User? @relation("TaskHistoryActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([taskId])
  @@index([actorId])
  @@map("task_history")
}

// =============================================================================
// Phase 4 — Documents & Storage
// =============================================================================

// -----------------------------------------------------------------------------
// Folder
// Supports infinite nesting via parentId. 
// A folder belongs to a workspace.
// -----------------------------------------------------------------------------

model Folder {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  parentId    String?  // null means root folder
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User      @relation("FolderCreator", fields: [createdById], references: [id])
  parent    Folder?   @relation("FolderHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children  Folder[]  @relation("FolderHierarchy")
  files     File[]

  @@index([workspaceId])
  @@index([parentId])
  @@map("folders")
}

// -----------------------------------------------------------------------------
// File
// Metadata for a file physically stored in Supabase Storage.
// size is in bytes. path is the S3 object key.
// -----------------------------------------------------------------------------

model File {
  id          String   @id @default(cuid())
  workspaceId String
  folderId    String?  // null means root of the workspace
  name        String
  size        Int
  mimeType    String
  /// The object key in the Supabase bucket (e.g., workspaceId/UUID.pdf)
  storagePath String   @unique
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  folder    Folder?      @relation(fields: [folderId], references: [id], onDelete: Cascade)
  createdBy User         @relation("FileCreator", fields: [createdById], references: [id])
  shares    ShareLink[]

  @@index([workspaceId])
  @@index([folderId])
  @@map("files")
}

// -----------------------------------------------------------------------------
// ShareLink
// A secure, expiring public link for a file (for external vendors).
// -----------------------------------------------------------------------------

model ShareLink {
  id        String   @id @default(cuid())
  fileId    String
  token     String   @unique @default(cuid()) // URL safe random token
  expiresAt DateTime
  createdById String
  createdAt DateTime @default(now())

  file      File @relation(fields: [fileId], references: [id], onDelete: Cascade)
  createdBy User @relation("ShareLinkCreator", fields: [createdById], references: [id])

  @@index([fileId])
  @@index([token])
  @@map("share_links")
}

// =============================================================================
// Phase 5 — Full Realtime Communication
// =============================================================================

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

/// Whether a channel is a workspace public channel, a private channel, or a DM.
enum ChannelType {
  PUBLIC
  PRIVATE
  DIRECT // 1:1 Direct Message
}

// -----------------------------------------------------------------------------
// Channel
// A conversation container. Can be a public workspace channel, a private
// group channel, or a 1:1 direct message (DM) between two users.
// -----------------------------------------------------------------------------

model Channel {
  id          String      @id @default(cuid())
  workspaceId String
  name        String?     // Null for DMs (display name is derived from members)
  type        ChannelType @default(PUBLIC)
  description String?
  isArchived  Boolean     @default(false)
  createdById String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  workspace Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User           @relation("ChannelCreator", fields: [createdById], references: [id])
  members   ChannelMember[]
  messages  Message[]

  @@index([workspaceId])
  @@index([type])
  @@map("channels")
}

// -----------------------------------------------------------------------------
// ChannelMember
// Tracks which users have access to a Channel.
// For PUBLIC channels: all workspace members are implicit members (queried via WorkspaceMember).
// For PRIVATE and DIRECT channels: access is strictly controlled by this table.
// -----------------------------------------------------------------------------

model ChannelMember {
  id        String   @id @default(cuid())
  channelId String
  userId    String
  joinedAt  DateTime @default(now())

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([channelId, userId])
  @@index([channelId])
  @@index([userId])
  @@map("channel_members")
}

// -----------------------------------------------------------------------------
// Message
// Core unit of communication. A message belongs to a Channel.
// Threading is supported via parentId (a reply points to its parent message).
// Soft-delete: isDeleted=true hides content but preserves thread structure.
// -----------------------------------------------------------------------------

model Message {
  id          String    @id @default(cuid())
  workspaceId String
  channelId   String
  authorId    String
  content     String
  /// If set, this message is a reply to the referenced message (thread reply).
  parentId    String?
  /// If set, this message has an attached file from Phase 4 storage.
  fileId      String?
  isEdited    Boolean   @default(false)
  editedById  String?
  isDeleted   Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workspace Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  channel   Channel      @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author    User         @relation("MessageAuthor", fields: [authorId], references: [id])
  editedBy  User?        @relation("MessageEditor", fields: [editedById], references: [id])
  /// Parent message (if this is a thread reply).
  parent    Message?     @relation("MessageThread", fields: [parentId], references: [id])
  /// All replies to this message.
  replies   Message[]    @relation("MessageThread")
  reactions Reaction[]
  readBy    ReadReceipt[]

  @@index([workspaceId])
  @@index([channelId])
  @@index([authorId])
  @@index([parentId])
  @@map("messages")
}

// -----------------------------------------------------------------------------
// Reaction
// An emoji reaction on a message. A user can react with multiple different emojis
// but can only use the same emoji once per message.
// -----------------------------------------------------------------------------

model Reaction {
  id        String @id @default(cuid())
  messageId String
  userId    String
  emoji     String // Unicode emoji e.g. "👍"

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([messageId, userId, emoji])
  @@index([messageId])
  @@map("reactions")
}

// -----------------------------------------------------------------------------
// ReadReceipt
// Tracks the last message a user has read in a channel.
// Used to compute unread badge counts.
// -----------------------------------------------------------------------------

model ReadReceipt {
  id              String   @id @default(cuid())
  userId          String
  messageId       String
  readAt          DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@unique([userId, messageId])
  @@index([userId])
  @@index([messageId])
  @@map("read_receipts")
}

// =============================================================================
// Phase 7 — Org Chart & Calendar
// =============================================================================

// -----------------------------------------------------------------------------
// Meeting
// A scheduled calendar event in a workspace.
// -----------------------------------------------------------------------------

model Meeting {
  id          String   @id @default(cuid())
  workspaceId String
  title       String
  description String?
  startTime   DateTime
  endTime     DateTime
  organizerId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace    Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  organizer    User                 @relation("MeetingOrganizer", fields: [organizerId], references: [id], onDelete: Cascade)
  participants MeetingParticipant[]

  @@index([workspaceId])
  @@index([organizerId])
  @@index([startTime])
  @@map("meetings")
}

model MeetingParticipant {
  id        String   @id @default(cuid())
  meetingId String
  userId    String
  status    MeetingParticipantStatus @default(PENDING)

  meeting Meeting @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([meetingId, userId])
  @@index([userId])
  @@map("meeting_participants")
}

// -----------------------------------------------------------------------------
// LeaveRequest
// Out-of-office requests tied to a user's manager.
// -----------------------------------------------------------------------------

model LeaveRequest {
  id          String      @id @default(cuid())
  workspaceId String
  userId      String
  startDate   DateTime
  endDate     DateTime
  reason      String?
  status      LeaveStatus @default(PENDING)
  reviewerId  String?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation("LeaveRequester", fields: [userId], references: [id], onDelete: Cascade)
  reviewer  User?     @relation("LeaveReviewer", fields: [reviewerId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([userId])
  @@index([reviewerId])
  @@map("leave_requests")
}
```

### `apps/api/prisma/migrations/migration_lock.toml`

```text
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

### `apps/api/prisma/migrations/20260628205233_phase1_core_foundation/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "inviteCode" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'EMPLOYEE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_inviteCode_key" ON "workspaces"("inviteCode");

-- CreateIndex
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");

-- CreateIndex
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_sessionId_key" ON "refresh_tokens"("sessionId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### `apps/api/prisma/migrations/20260628215519_phase2_audit_log/migration.sql`

```sql
-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_idx" ON "audit_logs"("workspaceId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### `apps/api/prisma/migrations/20260630021046_phase3_projects_kanban/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'MOVED', 'ARCHIVED', 'DELETED');

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Board',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columns" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "labels" TEXT,
    "assigneeId" TEXT,
    "reporterId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_history" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "TaskHistoryAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_workspaceId_idx" ON "projects"("workspaceId");

-- CreateIndex
CREATE INDEX "projects_createdById_idx" ON "projects"("createdById");

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "boards_projectId_idx" ON "boards"("projectId");

-- CreateIndex
CREATE INDEX "columns_boardId_idx" ON "columns"("boardId");

-- CreateIndex
CREATE INDEX "tasks_workspaceId_idx" ON "tasks"("workspaceId");

-- CreateIndex
CREATE INDEX "tasks_projectId_idx" ON "tasks"("projectId");

-- CreateIndex
CREATE INDEX "tasks_columnId_idx" ON "tasks"("columnId");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_idx" ON "tasks"("assigneeId");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_priority_idx" ON "tasks"("priority");

-- CreateIndex
CREATE INDEX "task_history_taskId_idx" ON "task_history"("taskId");

-- CreateIndex
CREATE INDEX "task_history_actorId_idx" ON "task_history"("actorId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "columns" ADD CONSTRAINT "columns_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### `apps/api/prisma/migrations/20260701065726_phase4_storage/migration.sql`

```sql
-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_workspaceId_idx" ON "folders"("workspaceId");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "files_storagePath_key" ON "files"("storagePath");

-- CreateIndex
CREATE INDEX "files_workspaceId_idx" ON "files"("workspaceId");

-- CreateIndex
CREATE INDEX "files_folderId_idx" ON "files"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_fileId_idx" ON "share_links"("fileId");

-- CreateIndex
CREATE INDEX "share_links_token_idx" ON "share_links"("token");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### `apps/api/prisma/migrations/20260701071749_phase5_communication/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PUBLIC', 'PRIVATE', 'DIRECT');

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT,
    "type" "ChannelType" NOT NULL DEFAULT 'PUBLIC',
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_members" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "fileId" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "read_receipts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channels_workspaceId_idx" ON "channels"("workspaceId");

-- CreateIndex
CREATE INDEX "channels_type_idx" ON "channels"("type");

-- CreateIndex
CREATE INDEX "channel_members_channelId_idx" ON "channel_members"("channelId");

-- CreateIndex
CREATE INDEX "channel_members_userId_idx" ON "channel_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_members_channelId_userId_key" ON "channel_members"("channelId", "userId");

-- CreateIndex
CREATE INDEX "messages_workspaceId_idx" ON "messages"("workspaceId");

-- CreateIndex
CREATE INDEX "messages_channelId_idx" ON "messages"("channelId");

-- CreateIndex
CREATE INDEX "messages_authorId_idx" ON "messages"("authorId");

-- CreateIndex
CREATE INDEX "messages_parentId_idx" ON "messages"("parentId");

-- CreateIndex
CREATE INDEX "reactions_messageId_idx" ON "reactions"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_messageId_userId_emoji_key" ON "reactions"("messageId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "read_receipts_userId_idx" ON "read_receipts"("userId");

-- CreateIndex
CREATE INDEX "read_receipts_messageId_idx" ON "read_receipts"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "read_receipts_userId_messageId_key" ON "read_receipts"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channels" ADD CONSTRAINT "channels_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "read_receipts" ADD CONSTRAINT "read_receipts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### `apps/api/prisma/migrations/20260701081405_phase7_org_calendar/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "MeetingParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MeetingParticipantStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_workspaceId_idx" ON "meetings"("workspaceId");

-- CreateIndex
CREATE INDEX "meetings_organizerId_idx" ON "meetings"("organizerId");

-- CreateIndex
CREATE INDEX "meetings_startTime_idx" ON "meetings"("startTime");

-- CreateIndex
CREATE INDEX "meeting_participants_userId_idx" ON "meeting_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_participants_meetingId_userId_key" ON "meeting_participants"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "leave_requests_workspaceId_idx" ON "leave_requests"("workspaceId");

-- CreateIndex
CREATE INDEX "leave_requests_userId_idx" ON "leave_requests"("userId");

-- CreateIndex
CREATE INDEX "leave_requests_reviewerId_idx" ON "leave_requests"("reviewerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### `apps/api/src/index.ts`

```typescript
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";

import authRoutes from "./modules/auth/auth.routes";
import workspaceRoutes from "./modules/workspace/workspace.routes";
import projectRoutes from "./modules/project/project.routes";
import taskRoutes from "./modules/project/task.routes";
import storageRoutes from "./modules/storage/storage.routes";
import channelRoutes from "./modules/chat/channel.routes";
import messageRoutes from "./modules/chat/message.routes";
import searchRoutes from "./modules/search/search.routes";
import orgRoutes from "./modules/org/org.routes";
import calendarRoutes from "./modules/calendar/calendar.routes";
import presenceRoutes from "./modules/presence/presence.routes";
import aiRoutes from "./modules/ai/ai.routes";
import { SocketService } from "./modules/socket/socket.service";

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

const app = express();
const PORT = process.env["PORT"] ?? 4000;
const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------

app.use(helmet());

app.use(
  cors({
    origin: process.env["CLIENT_URL"] ?? "http://localhost:5173",
    credentials: true, // required for HTTP-only cookie transport
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Too many requests — please try again later." },
  })
);

// ---------------------------------------------------------------------------
// Body / cookie parsing
// ---------------------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/org", orgRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/presence", presenceRoutes);
app.use("/api/ai", aiRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Syncra API is running.",
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

SocketService.init(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🚀  Syncra API  →  http://localhost:${PORT}`);
  console.log(`🛡️   Environment: ${process.env["NODE_ENV"] ?? "development"}\n`);
});

// ---------------------------------------------------------------------------
// Global Error Handler — catches any error thrown from routes/services
// Must be LAST middleware. Prevents raw Express HTML error pages being returned.
// ---------------------------------------------------------------------------

app.use((err: any, _req: any, res: any, _next: any) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message =
    process.env["NODE_ENV"] === "production"
      ? "An unexpected error occurred"
      : (err.message ?? "Internal Server Error");

  res.status(status).json({ success: false, error: message });
});

// ---------------------------------------------------------------------------
// Process-level safety nets (catch unhandled rejections that escape express)
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] Unhandled Promise Rejection:", reason?.message ?? reason);
  // Do NOT crash the server in production — log and continue
});

process.on("uncaughtException", (err: Error) => {
  console.error("[FATAL] Uncaught Exception:", err.message);
  // For uncaught exceptions, a clean restart is safest — exit with error code
  process.exit(1);
});

export default app;
```

### `apps/api/src/lib/db.ts`

```typescript
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Ensure DATABASE_URL is available
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be defined for the application runtime.");
}

// Set up the connection pool using the pg driver adapter.
// This is required in Prisma v7 to use the Supabase transaction-mode pooler (port 6543).
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Attach PrismaClient to the global object in development to prevent
// exhausting the database connection limit during hot reloads.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### `apps/api/src/lib/jwt.ts`

```typescript
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Server cannot start.");
}

export interface AccessTokenPayload {
  userId: string;
  workspaceId: string | null;
  role: string | null;
  sessionId: string;
}

/**
 * Signs a short-lived access token containing the user's tenant context.
 * Lifespan: 15 minutes.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: "15m",
    algorithm: "HS256",
  });
}

/**
 * Verifies an access token and extracts the payload.
 * Throws an error if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET!) as AccessTokenPayload;
}
```

### `apps/api/src/lib/cookie.ts`

```typescript
import { Response } from "express";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION, // HTTPS only in production
  sameSite: "strict" as const,
  path: "/",
};

/**
 * Sets both the short-lived access token and the long-lived refresh token
 * as HTTP-only cookies on the response.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  // Access Token: 15 minutes
  res.cookie("syncra_access", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh Token: 7 days
  res.cookie("syncra_refresh", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clears both authentication cookies (used for logout).
 */
export function clearAuthCookies(res: Response) {
  res.clearCookie("syncra_access", cookieOptions);
  res.clearCookie("syncra_refresh", cookieOptions);
}
```

### `apps/api/src/lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"; // Must use service_role to bypass RLS since we manage tenant isolation in the API

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ Supabase credentials missing. Storage features will fail if called.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### `apps/api/src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../lib/jwt";

// Extend Express Request interface to include the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Middleware: requireAuth
 * Validates the JWT from the `syncra_access` cookie.
 * If valid, attaches the decoded payload to `req.user`.
 * If missing or invalid, rejects the request with 401 Unauthorized.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.syncra_access;
    
    if (!token) {
      res.status(401).json({ success: false, error: "Unauthorized - No access token provided" });
      return;
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    
    next();
  } catch (error) {
    // Catch token expiration or verification errors
    res.status(401).json({ success: false, error: "Unauthorized - Invalid or expired token" });
  }
}
```

### `apps/api/src/middleware/tenant.ts`

```typescript
import { Request, Response, NextFunction } from "express";

/**
 * Middleware: requireWorkspace
 * Ensures the authenticated user has an active workspace context.
 * Must be used AFTER `requireAuth`.
 * Checks the JWT payload for `workspaceId` and `role`.
 */
export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized - Authentication required" });
    return;
  }

  if (!req.user.workspaceId || !req.user.role) {
    res.status(403).json({ success: false, error: "Forbidden - Active workspace context required" });
    return;
  }

  next();
}
```

### `apps/api/src/middleware/rbac.ts`

```typescript
import { Request, Response, NextFunction } from "express";
import { Permission, ROLE_PERMISSIONS, WorkspaceRole } from "@syncra/validators";

/**
 * Middleware: requirePermission
 * Ensures the authenticated user's active tenant role includes the specified permission.
 * MUST be used AFTER `requireAuth` and `requireWorkspace`.
 */
export function requirePermission(requiredPermission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    // 1. Validate tenant context exists
    if (!req.user || !req.user.workspaceId || !req.user.role) {
      res.status(401).json({ success: false, error: "Unauthorized - Tenant context required for permission check" });
      return;
    }

    const role = req.user.role as WorkspaceRole;
    
    // 2. Owner bypasses all granular checks (God Mode)
    if (role === WorkspaceRole.OWNER) {
      return next();
    }

    // 3. Lookup allowed permissions for this role
    const allowedPermissions = ROLE_PERMISSIONS[role];
    
    // 4. Enforce
    if (!allowedPermissions || !allowedPermissions.includes(requiredPermission)) {
      res.status(403).json({ 
        success: false, 
        error: `Forbidden - Missing required permission: ${requiredPermission}` 
      });
      return;
    }

    next();
  };
}
```

### `packages/validators/src/index.ts`

```typescript
/**
 * @syncra/validators
 *
 * Shared Zod validation schemas used across apps/api and apps/web.
 * This file is the single export barrel for all validators.
 *
 * Phase 0: Intentionally minimal — the structure is established here
 * and schemas will be added per-phase as domain models are defined.
 */

export { z } from "zod";
export * from "./auth";
export * from "./workspace";
export * from "./rbac";
export * from "./socket.events";
export * from "./socket.types";
export * from "./project";
export * from "./task";
export * from "./storage";
export * from "./channel";
export * from "./message";
export * from "./receipt";
export * from "./search";
export * from "./org";
export * from "./calendar";
```

### `packages/validators/src/auth.ts`

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z.string().min(2, "Display name must be at least 2 characters long"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

### `packages/validators/src/workspace.ts`

```typescript
import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters long"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const joinWorkspaceSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
```

### `packages/validators/src/rbac.ts`

```typescript
// Re-exporting the Prisma enum type for consistency, though we define it manually here
// so the frontend doesn't need the @prisma/client dependency.
export enum WorkspaceRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  EMPLOYEE = "EMPLOYEE",
}

export const PERMISSIONS = {
  // Workspace Governance
  WORKSPACE_UPDATE: "workspace:update",
  WORKSPACE_DELETE: "workspace:delete",
  
  // Member Management
  MEMBER_INVITE: "member:invite",
  MEMBER_REMOVE: "member:remove",
  MEMBER_ROLE_UPDATE: "member:role_update",
  
  // Governance / Audit
  AUDIT_READ: "audit:read",

  // Phase 3: Projects & Kanban
  PROJECT_CREATE: "project:create",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",
  
  TASK_CREATE: "task:create",
  TASK_UPDATE: "task:update",
  TASK_DELETE: "task:delete",
  
  // Phase 4: Documents & Storage
  DOCUMENT_CREATE: "document:create",
  DOCUMENT_UPDATE: "document:update",
  DOCUMENT_DELETE: "document:delete",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * The single source of truth for Role-Based Access Control (RBAC).
 * Maps each WorkspaceRole to its allowed permissions.
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  // OWNER can do absolutely everything.
  [WorkspaceRole.OWNER]: Object.values(PERMISSIONS),
  
  // ADMIN can manage the workspace and members, but cannot delete the workspace.
  [WorkspaceRole.ADMIN]: [
    PERMISSIONS.WORKSPACE_UPDATE,
    PERMISSIONS.MEMBER_INVITE,
    PERMISSIONS.MEMBER_REMOVE,
    PERMISSIONS.MEMBER_ROLE_UPDATE,
    PERMISSIONS.AUDIT_READ,
    
    // Admins can manage all operational data
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
  ],
  
  // MANAGER can manage operational data and invite users, but cannot manage admins/workspace settings.
  [WorkspaceRole.MANAGER]: [
    PERMISSIONS.MEMBER_INVITE,
    
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_UPDATE,
    // Note: Managers cannot delete entire projects
    
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    PERMISSIONS.TASK_DELETE,
    
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
    PERMISSIONS.DOCUMENT_DELETE,
  ],
  
  // EMPLOYEE can only interact with tasks and documents, cannot manage structure.
  [WorkspaceRole.EMPLOYEE]: [
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_UPDATE,
    
    PERMISSIONS.DOCUMENT_CREATE,
    PERMISSIONS.DOCUMENT_UPDATE,
  ],
};
```

### `packages/validators/src/socket.events.ts`

```typescript
/**
 * Centralized registry of all WebSocket event names used across the platform.
 * Controllers and services must use these constants instead of hardcoding strings.
 */
export const SOCKET_EVENTS = {
  // Connection lifecycle
  ERROR: "error",

  // Workspaces (Phase 1/2)
  WORKSPACE_UPDATED: "workspace:updated",
  WORKSPACE_DELETED: "workspace:deleted",

  // Members (Phase 1/2)
  MEMBER_JOINED: "member:joined",
  MEMBER_LEFT: "member:left",
  MEMBER_ROLE_UPDATED: "member:role_updated",

  // Projects & Tasks (Phase 3)
  TASK_CREATED: "task:created",
  TASK_MOVED: "task:moved",
  TASK_UPDATED: "task:updated",
  TASK_DELETED: "task:deleted",

  // Documents (Phase 4)
  DOCUMENT_UPLOADED: "document:uploaded",
  DOCUMENT_UPDATED: "document:updated",
  DOCUMENT_DELETED: "document:deleted",

  // Chat (Phase 5)
  MESSAGE_SENT: "message:sent",
  MESSAGE_UPDATED: "message:updated",
  MESSAGE_DELETED: "message:deleted",
  THREAD_REPLIED: "thread:replied",

  // Presence (Phase 7)
  PRESENCE_UPDATED: "presence:updated",   // {userId, status, statusLabel}
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
```

### `packages/validators/src/socket.types.ts`

```typescript
/**
 * Standardized payload envelope for all WebSocket broadcasts.
 * Ensures every event on the bus carries consistent metadata.
 */
export interface SocketEventEnvelope<T = any> {
  meta: {
    /** The ID of the workspace this event is scoped to. */
    workspaceId: string;
    /** The ID of the user who triggered the event, if applicable. */
    actorId?: string;
    /** ISO string timestamp of when the event occurred. */
    timestamp: string;
  };
  /** The actual domain event data. */
  data: T;
}
```

### `packages/validators/src/project.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Project
// -----------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// -----------------------------------------------------------------------------
// Column
// -----------------------------------------------------------------------------

export const createColumnSchema = z.object({
  name: z.string().min(1, "Column name is required").max(80),
  position: z.number().int().min(0).optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
```

### `packages/validators/src/task.ts`

```typescript
import { z } from "zod";

export const TaskPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const TaskStatusEnum = z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]);

export const createTaskSchema = z.object({
  projectId: z.string().cuid(),
  columnId: z.string().cuid(),
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().max(2000).optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  labels: z.string().optional(), // Comma-separated
  assigneeId: z.string().cuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  position: z.number().optional(), // Optional, defaults to appending
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  labels: z.string().optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  isArchived: z.boolean().optional(),
});

export const moveTaskSchema = z.object({
  columnId: z.string().cuid().optional(),
  position: z.number(),
});

export const taskFilterSchema = z.object({
  projectId: z.string().cuid(),
  assigneeId: z.string().cuid().optional(),
  priority: TaskPriorityEnum.optional(),
  status: TaskStatusEnum.optional(),
  label: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
export type TaskFilterQuery = z.infer<typeof taskFilterSchema>;
```

### `packages/validators/src/storage.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Folder
// -----------------------------------------------------------------------------

export const createFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().cuid().optional().nullable(),
});

export const renameFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

export const moveFolderSchema = z.object({
  parentId: z.string().cuid().optional().nullable(),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type RenameFolderInput = z.infer<typeof renameFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;

// -----------------------------------------------------------------------------
// File
// -----------------------------------------------------------------------------

export const registerFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  mimeType: z.string().min(1),
  storagePath: z.string().min(1),
  folderId: z.string().cuid().optional().nullable(),
});

export const renameFileSchema = z.object({
  name: z.string().min(1).max(255),
});

export const moveFileSchema = z.object({
  folderId: z.string().cuid().optional().nullable(),
});

export type RegisterFileInput = z.infer<typeof registerFileSchema>;
export type RenameFileInput = z.infer<typeof renameFileSchema>;
export type MoveFileInput = z.infer<typeof moveFileSchema>;

// -----------------------------------------------------------------------------
// Share Link
// -----------------------------------------------------------------------------

export const createShareLinkSchema = z.object({
  expiresInHours: z.number().int().min(1).max(720), // Max 30 days
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
```

### `packages/validators/src/channel.ts`

```typescript
import { z } from "zod";

// -----------------------------------------------------------------------------
// Channel
// -----------------------------------------------------------------------------

export const createChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required").max(80),
  description: z.string().max(300).optional(),
  type: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

// -----------------------------------------------------------------------------
// DM (Direct Message channel)
// -----------------------------------------------------------------------------

export const createDMSchema = z.object({
  targetUserId: z.string().cuid(),
});

export type CreateDMInput = z.infer<typeof createDMSchema>;
```

### `packages/validators/src/message.ts`

```typescript
import { z } from "zod";

export const sendMessageSchema = z.object({
  channelId: z.string().cuid(),
  content: z.string().min(1, "Message cannot be empty").max(4000),
  parentId: z.string().cuid().optional().nullable(), // thread reply
  fileId: z.string().cuid().optional().nullable(),   // file attachment
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const listMessagesSchema = z.object({
  channelId: z.string().cuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().cuid().optional(), // cursor-based pagination
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(10), // e.g. "👍"
});

export const typingSchema = z.object({
  channelId: z.string().cuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
```

### `packages/validators/src/receipt.ts`

```typescript
import { z } from "zod";

export const markReadSchema = z.object({
  messageId: z.string().cuid(),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;
```

### `packages/validators/src/search.ts`

```typescript
import { z } from "zod";

export const SearchTypeSchema = z.enum(["ALL", "TASKS", "FILES", "MESSAGES"]);

export const globalSearchSchema = z.object({
  q: z.string().min(1, "Search query is required"),
  type: SearchTypeSchema.default("ALL"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchType = z.infer<typeof SearchTypeSchema>;
export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
```

### `packages/validators/src/org.ts`

```typescript
import { z } from "zod";

export const setManagerSchema = z.object({
  managerId: z.string().cuid().nullable(), // nullable to remove manager
});

export type SetManagerInput = z.infer<typeof setManagerSchema>;
```

### `packages/validators/src/calendar.ts`

```typescript
import { z } from "zod";

// Leaves
export const createLeaveSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

export const updateLeaveStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>;

// Meetings
export const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  participantIds: z.array(z.string().cuid()).default([]),
});

export const rsvpMeetingSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "TENTATIVE"]),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type RsvpMeetingInput = z.infer<typeof rsvpMeetingSchema>;
```
