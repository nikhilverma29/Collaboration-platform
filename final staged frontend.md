Stage 1 — Product Design (No React coding yet)

This stage is about making decisions, not writing components.

1. Design System

Decide the overall visual language.

Design language decision (the north star — platform feeling, 
emotional target, visual personality. Every other decision 
below is measured against this. Decide this first.)
Colors
Typography
Spacing scale
Border radius
Shadows
Icons
Motion philosophy
Button styles
Input styles
Cards
Modals
Drawers
Tables
Badges
Chips
Primitive component specs (buttons, inputs, cards, badges,
modals, drawers, tables, tooltips, skeletons, empty states,
loaders — defined here so screen design uses already-decided
components, not ad hoc ones invented per screen)

2. Entry Flow

Design everything before the dashboard.
This comes before the shell because it sets the first impression
of the platform in a low-complexity environment, before the
shell's patterns start influencing entry screen decisions.

Landing page
Login
Signup
Forgot password (→ password reset email flow)
Workspace creation
Workspace joining
First-time onboarding

3. Application Shell (Global Layout)

Design the permanent layout of the application.

Sidebar
Topbar
Main content area
Right panel (if any)
Responsive layout
Workspace switcher placement
Notification bell placement

4. Navigation Architecture

Design how users move through the platform.

Sidebar navigation
Top navigation
Navigation hierarchy
Routing
Breadcrumbs
Command palette
Global search placement
Profile menu

Stage 2 — Screen Specifications

Now design each screen one by one using the components
already defined in Stage 1. No new component patterns
should be invented at this stage — only assembled.

5. Dashboard

Workspace summary screen. Powered by the dashboard summary API.

Recent activity feed
My tasks (due soon, overdue)
Workspace stats (members online, open tasks, recent docs)
Quick links (recent projects, recent channels, recent docs)
Who is online (presence)
Upcoming calendar events

6. Projects

Project list
Project card
Create project
Project details
Project settings (rename, archive, delete, manage members)

7. Kanban

Board
Columns
Task cards (shows priority, labels, assignee, due date)
Task details (full view with priority, labels, description,
             activity timeline, comments)
Task filters (by assignee, priority, due date, status, label)
Drag and Drop
Activity timeline

8. Documents

File explorer
Folder tree (with create, rename, move, delete folder)
Upload flow
File management (rename, move, delete file)
Preview (PDF, image, doc preview in-app)
Sharing (generate expiring link)

9. Chat

Channel list (public + private)
Channel management (create, rename, archive, delete)
Channel members (add/remove for private channels)
DMs
Threads
Composer (with file attachment support)
Message bubble (with edit, delete, reactions)
Reactions

10. Calendar

Month view
Week view
Day view
Event modal (create, edit, delete event with attendees)
Recurring events
Scheduling (invite attendees, view availability)

11. Search

Global search bar
Results page (grouped by type: tasks / messages / docs)
Filters (by entity type, date range, author)
Search UI

12. Notifications

Notification center (list of all notifications)
Notification item (task assigned, message received,
                   leave approved, calendar invite)
Mark as read / mark all read
Toasts (real-time pop-up for incoming events)
Activity feed (chronological workspace activity)

13. AI Copilot

AI panel (slide-in or dedicated page)
AI chat (conversational interface)
AI actions (create task, assign task, schedule meeting
           — executed from natural language)
AI widgets:
  Daily summary widget (what happened today)
  Blocked tasks widget (tasks with no activity)
  Upcoming meetings widget (next 24h calendar events)
Channel summarizer (summarize last N messages button)
Task enricher (expand 5-word title into full user story)
Document Q&A (ask questions against workspace docs)

14. Admin & Governance

Member management (list, invite via email, remove)
Role management (assign, bulk assign, change role)
Audit logs (timeline of sensitive actions)
Workspace settings (rename workspace, update domain
                    whitelist, delete workspace)

15. User Profile & Settings

Profile (name, avatar, bio — editable)
Account (email, change password)
Preferences (theme, language)
Sessions (view active sessions, revoke session)
Notifications settings (what to be notified about)

______________________________________________________________________________


## Backend-to-Frontend API Coverage Map

This section confirms every frontend screen has backend coverage.
Use this as a checklist when building Phase 9.

| Frontend Screen       | Backend Phase | APIs Required                          |
|-----------------------|---------------|----------------------------------------|
| Login / Signup        | Phase 1       | POST /auth/login, /auth/register       |
| Forgot password       | Phase 1       | POST /auth/forgot-password, /reset     |
| Workspace creation    | Phase 1       | POST /workspaces                       |
| Workspace joining     | Phase 1       | POST /workspaces/:id/join              |
| Dashboard             | Phase 1       | GET /workspaces/:id/summary            |
| Profile & Settings    | Phase 1       | GET/PUT /users/me, /users/me/avatar    |
| Change password       | Phase 1       | PUT /users/me/password                 |
| Sessions              | Phase 1       | GET/DELETE /sessions                   |
| Workspace settings    | Phase 1       | PUT/DELETE /workspaces/:id             |
| Member invite         | Phase 1       | POST /workspaces/:id/invite            |
| Roles & RBAC          | Phase 2       | PUT /workspaces/:id/members/:id/role   |
| Audit logs            | Phase 2       | GET /workspaces/:id/audit-logs         |
| Presence              | Phase 2.5     | Socket events                          |
| Projects              | Phase 3       | CRUD /projects                         |
| Project settings      | Phase 3       | PUT/DELETE /projects/:id               |
| Kanban board          | Phase 3       | CRUD /tasks, /columns                  |
| Task filters          | Phase 3       | GET /tasks?assignee=&priority=&...     |
| Task activity         | Phase 3       | GET /tasks/:id/history                 |
| File explorer         | Phase 4       | CRUD /folders, /files                  |
| File upload           | Phase 4       | POST /files/upload                     |
| File preview          | Phase 4       | GET /files/:id/preview                 |
| Share link            | Phase 4       | POST /files/:id/share                  |
| Channels              | Phase 5       | CRUD /channels                         |
| Messages              | Phase 5       | CRUD /messages (incl. edit/delete)     |
| Threads               | Phase 5       | CRUD /messages/:id/replies             |
| Reactions             | Phase 5       | POST/DELETE /messages/:id/reactions    |
| File attachments      | Phase 5+4     | Reuses Phase 4 storage pipeline        |
| Search                | Phase 6       | GET /search?q=&type=&author=&date=     |
| Notifications         | Phase 6       | GET/PUT /notifications                 |
| Org chart             | Phase 7       | GET /workspaces/:id/org-chart          |
| Calendar events       | Phase 7       | CRUD /events                           |
| Leave requests        | Phase 7       | CRUD /leave-requests                   |
| AI summarizer         | Phase 8       | POST /ai/summarize                     |
| AI task enricher      | Phase 8       | POST /ai/enrich-task                   |
| AI document Q&A       | Phase 8       | POST /ai/query-docs                    |
| AI command bar        | Phase 8       | POST /ai/command                       |
| AI widgets            | Phase 8       | GET /ai/widgets/summary, /blocked, ... |


## Order of Implementation to be followed in Phase 9 (written orderwise)

Design System (Tailwind theme + shadcn customization)
Global Layout (App Shell)
Navigation
Authentication Pages
Dashboard
Projects
Kanban
Documents
Chat
Calendar
Search
Notifications
AI Copilot
Admin
Settings

