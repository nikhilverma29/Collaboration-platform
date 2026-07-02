# 09-org-calendar — Org Chart & Calendar

## Purpose

Org chart with manager/report relationships (circular dependency prevention), leave request workflow (request → manager approve/reject → cancel), meeting scheduling with per-participant RSVP, and dynamic presence computation (ONLINE/BUSY/OUT_OF_OFFICE/OFFLINE) based on socket state, approved leaves, and accepted meetings.

## Dependencies

- `00-core-foundation`
- `01-auth-sessions`
- `02-workspace-tenancy`
- `03-rbac-governance`
- `04-realtime-infra`

## Main User Flow

PUT /api/org/members/:id/manager → set manager (circular check). POST /api/calendar/leaves → request leave. PUT /api/calendar/leaves/:id → manager review. POST /api/calendar/meetings → schedule meeting. PUT /api/calendar/meetings/:id/rsvp → accept/decline. GET /api/presence/:userId → compute current status.

## Files Involved

- `apps/api/src/modules/org/org.service.ts`
- `apps/api/src/modules/org/org.controller.ts`
- `apps/api/src/modules/org/org.routes.ts`
- `apps/api/src/modules/calendar/calendar.service.ts`
- `apps/api/src/modules/calendar/calendar.controller.ts`
- `apps/api/src/modules/calendar/calendar.routes.ts`
- `apps/api/src/modules/presence/presence.service.ts`
- `apps/api/src/modules/presence/presence.controller.ts`
- `apps/api/src/modules/presence/presence.routes.ts`
- `packages/validators/src/org.ts`
- `packages/validators/src/calendar.ts`

## Source Code

### `apps/api/src/modules/org/org.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { SetManagerInput } from "@syncra/validators";

export class OrgService {
  
  /**
   * Assign a manager to a user.
   * Checks for circular dependencies (e.g., you can't report to someone who reports to you).
   */
  static async setManager(workspaceId: string, userId: string, data: SetManagerInput) {
    const { managerId } = data;

    // You can't be your own manager
    if (managerId === userId) {
      throw new Error("Cannot set yourself as your manager");
    }

    if (managerId) {
      // Verify manager exists in this workspace
      const manager = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: managerId } },
      });
      if (!manager) {
        throw new Error("Manager must be a member of this workspace");
      }

      // Check for circular dependency (simple climb up the tree)
      let currentManagerId: string | null = managerId;
      while (currentManagerId) {
        if (currentManagerId === userId) {
          throw new Error("Circular reporting line detected");
        }
        const managerRecord: { managerId: string | null } | null = await prisma.user.findUnique({
          where: { id: currentManagerId },
          select: { managerId: true },
        });
        currentManagerId = managerRecord?.managerId || null;
      }
    }

    // Update the user
    return prisma.user.update({
      where: { id: userId },
      data: { managerId },
      select: {
        id: true,
        displayName: true,
        manager: {
          select: { id: true, displayName: true },
        },
      },
    });
  }

  /**
   * Fetch the flat org chart (all users with their managerId) for the frontend to build the tree.
   */
  static async getOrgChart(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            managerId: true,
          },
        },
      },
    });

    return members.map(m => ({
      ...m.user,
      role: m.role,
    }));
  }
}
```

### `apps/api/src/modules/org/org.controller.ts`

```typescript
import { Request, Response } from "express";
import { OrgService } from "./org.service";
import { setManagerSchema } from "@syncra/validators";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class OrgController {
  
  static async getChart(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const chart = await OrgService.getOrgChart(workspaceId);
      res.status(200).json({ success: true, data: chart });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async setManager(req: Request, res: Response) {
    try {
      const parsed = setManagerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }

      const workspaceId = req.user!.workspaceId!;
      // An admin might want to set a manager for someone else, or a user for themselves.
      // For now, let's allow a user to set their own manager, or use a targetUserId param if Admin.
      // Let's use targetUserId from params.
      const targetUserId = req.params.userId as string;

      // Note: Ideally require ADMIN/OWNER permissions in routes for this.
      const updated = await OrgService.setManager(workspaceId, targetUserId, parsed.data);

      SocketService.broadcastToWorkspace(workspaceId, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: req.user!.userId,
        data: { type: "org_updated", user: updated },
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/org/org.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/rbac";
import { PERMISSIONS } from "@syncra/validators";
import { OrgController } from "./org.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Get the flat organization tree for the workspace
router.get("/", OrgController.getChart);

// Assign or remove a manager from a user
// Requires ADMIN rights to modify the org chart
router.put(
  "/:userId/manager",
  requirePermission(PERMISSIONS.WORKSPACE_UPDATE),
  OrgController.setManager
);

export default router;
```

### `apps/api/src/modules/calendar/calendar.service.ts`

```typescript
import { prisma } from "../../lib/db";
import { CreateLeaveInput, UpdateLeaveStatusInput, CreateMeetingInput, RsvpMeetingInput } from "@syncra/validators";

export class CalendarService {
  
  // ===========================================================================
  // Layer 3: Leave Requests
  // ===========================================================================

  static async requestLeave(workspaceId: string, userId: string, data: CreateLeaveInput) {
    if (data.startDate >= data.endDate) {
      throw new Error("End date must be after start date");
    }

    return prisma.leaveRequest.create({
      data: {
        workspaceId,
        userId,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
      },
    });
  }

  static async getLeaves(workspaceId: string, userId: string) {
    // Return my leaves AND leaves of my direct reports
    return prisma.leaveRequest.findMany({
      where: {
        workspaceId,
        OR: [
          { userId },
          { user: { managerId: userId } },
        ],
      },
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  static async reviewLeave(workspaceId: string, managerId: string, leaveId: string, data: UpdateLeaveStatusInput) {
    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: { user: true },
    });

    if (!leave || leave.workspaceId !== workspaceId) {
      throw new Error("Leave request not found");
    }

    if (leave.user.managerId !== managerId) {
      throw new Error("You are not the manager of this user");
    }

    return prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status: data.status,
        reviewerId: managerId,
      },
    });
  }

  // ===========================================================================
  // Layer 4: Meetings
  // ===========================================================================

  static async createMeeting(workspaceId: string, organizerId: string, data: CreateMeetingInput) {
    if (data.startTime >= data.endTime) {
      throw new Error("End time must be after start time");
    }

    // Include the organizer as an accepted participant automatically
    const participantIds = new Set([...data.participantIds, organizerId]);

    return prisma.meeting.create({
      data: {
        workspaceId,
        organizerId,
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        participants: {
          create: Array.from(participantIds).map(userId => ({
            userId,
            status: userId === organizerId ? "ACCEPTED" : "PENDING",
          })),
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });
  }

  static async getMeetings(workspaceId: string, userId: string) {
    // Return meetings I am a participant in or I organized
    return prisma.meeting.findMany({
      where: {
        workspaceId,
        participants: {
          some: { userId },
        },
      },
      include: {
        organizer: { select: { id: true, displayName: true } },
        participants: { select: { userId: true, status: true, user: { select: { displayName: true } } } },
      },
      orderBy: { startTime: "asc" },
    });
  }

  static async rsvpMeeting(workspaceId: string, userId: string, meetingId: string, data: RsvpMeetingInput) {
    // Verify meeting exists and belongs to workspace
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.workspaceId !== workspaceId) {
      throw new Error("Meeting not found");
    }

    return prisma.meetingParticipant.update({
      where: {
        meetingId_userId: { meetingId, userId },
      },
      data: { status: data.status },
    });
  }

  static async cancelLeave(workspaceId: string, userId: string, leaveId: string) {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: leaveId } });
    if (!leave || leave.workspaceId !== workspaceId) {
      throw new Error("Leave request not found");
    }
    if (leave.userId !== userId) {
      throw new Error("Cannot cancel another user's leave request");
    }
    if (leave.status !== "PENDING") {
      throw new Error("Only pending leave requests can be cancelled");
    }
    return prisma.leaveRequest.delete({ where: { id: leaveId } });
  }

  static async cancelMeeting(workspaceId: string, organizerId: string, meetingId: string) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting || meeting.workspaceId !== workspaceId) {
      throw new Error("Meeting not found");
    }
    if (meeting.organizerId !== organizerId) {
      throw new Error("Only the organizer can cancel a meeting");
    }
    return prisma.meeting.delete({ where: { id: meetingId } });
  }
}
```

### `apps/api/src/modules/calendar/calendar.controller.ts`

```typescript
import { Request, Response } from "express";
import { CalendarService } from "./calendar.service";
import { createLeaveSchema, updateLeaveStatusSchema, createMeetingSchema, rsvpMeetingSchema } from "@syncra/validators";
import { SocketService } from "../socket/socket.service";
import { SOCKET_EVENTS } from "@syncra/validators";

export class CalendarController {

  // --- LEAVES ---

  static async requestLeave(req: Request, res: Response) {
    try {
      const parsed = createLeaveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }
      const leave = await CalendarService.requestLeave(req.user!.workspaceId!, req.user!.userId, parsed.data);
      res.status(201).json({ success: true, data: leave });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getLeaves(req: Request, res: Response) {
    try {
      const leaves = await CalendarService.getLeaves(req.user!.workspaceId!, req.user!.userId);
      res.status(200).json({ success: true, data: leaves });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async reviewLeave(req: Request, res: Response) {
    try {
      const parsed = updateLeaveStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }
      const updated = await CalendarService.reviewLeave(
        req.user!.workspaceId!,
        req.user!.userId, // the manager
        req.params.leaveId as string,
        parsed.data
      );
      res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async cancelLeave(req: Request, res: Response) {
    try {
      await CalendarService.cancelLeave(req.user!.workspaceId!, req.user!.userId, req.params.leaveId as string);
      res.status(200).json({ success: true, message: "Leave request cancelled" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // --- MEETINGS ---

  static async createMeeting(req: Request, res: Response) {
    try {
      const parsed = createMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }
      const meeting = await CalendarService.createMeeting(req.user!.workspaceId!, req.user!.userId, parsed.data);

      SocketService.broadcastToWorkspace(req.user!.workspaceId!, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: req.user!.userId,
        data: { type: "meeting_created", meeting },
      });

      res.status(201).json({ success: true, data: meeting });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async getMeetings(req: Request, res: Response) {
    try {
      const meetings = await CalendarService.getMeetings(req.user!.workspaceId!, req.user!.userId);
      res.status(200).json({ success: true, data: meetings });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async rsvpMeeting(req: Request, res: Response) {
    try {
      const parsed = rsvpMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: parsed.error.flatten() });
        return;
      }
      const rsvp = await CalendarService.rsvpMeeting(
        req.user!.workspaceId!,
        req.user!.userId,
        req.params.meetingId as string,
        parsed.data
      );

      SocketService.broadcastToWorkspace(req.user!.workspaceId!, SOCKET_EVENTS.WORKSPACE_UPDATED, {
        actorId: req.user!.userId,
        data: { type: "meeting_rsvp", rsvp },
      });

      res.status(200).json({ success: true, data: rsvp });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  static async cancelMeeting(req: Request, res: Response) {
    try {
      await CalendarService.cancelMeeting(req.user!.workspaceId!, req.user!.userId, req.params.meetingId as string);
      res.status(200).json({ success: true, message: "Meeting cancelled" });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/calendar/calendar.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { CalendarController } from "./calendar.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Leaves
router.post("/leaves", CalendarController.requestLeave);
router.get("/leaves", CalendarController.getLeaves);
router.put("/leaves/:leaveId", CalendarController.reviewLeave);
router.delete("/leaves/:leaveId", CalendarController.cancelLeave);

// Meetings
router.post("/meetings", CalendarController.createMeeting);
router.get("/meetings", CalendarController.getMeetings);
router.put("/meetings/:meetingId/rsvp", CalendarController.rsvpMeeting);
router.delete("/meetings/:meetingId", CalendarController.cancelMeeting);

export default router;
```

### `apps/api/src/modules/presence/presence.service.ts`

```typescript
import { prisma } from "../../lib/db";

/**
 * Possible user statuses that the system can compute.
 * ONLINE: Connected via socket, no calendar conflict.
 * BUSY: Currently in a scheduled meeting.
 * OUT_OF_OFFICE: Has an approved leave covering today.
 * OFFLINE: Not connected.
 */
export type UserStatus = "ONLINE" | "BUSY" | "OUT_OF_OFFICE" | "OFFLINE";

export interface PresenceInfo {
  userId: string;
  status: UserStatus;
  statusLabel: string; // Human-readable label (e.g. "In a meeting", "On leave")
  lastSeen: string | null;
}

// In-memory store for connected socket users: { workspaceId: { userId: lastSeenISO } }
const connectedUsers = new Map<string, Map<string, string>>();

export class PresenceService {

  // ---------------------------------------------------------------------------
  // Socket lifecycle management (called by SocketGateway)
  // ---------------------------------------------------------------------------

  static markOnline(workspaceId: string, userId: string) {
    if (!connectedUsers.has(workspaceId)) {
      connectedUsers.set(workspaceId, new Map());
    }
    connectedUsers.get(workspaceId)!.set(userId, new Date().toISOString());
  }

  static markOffline(workspaceId: string, userId: string) {
    connectedUsers.get(workspaceId)?.delete(userId);
  }

  static isOnline(workspaceId: string, userId: string): boolean {
    return connectedUsers.get(workspaceId)?.has(userId) ?? false;
  }

  // ---------------------------------------------------------------------------
  // Status computation (merges socket + calendar data)
  // ---------------------------------------------------------------------------

  static async computeStatus(workspaceId: string, userId: string): Promise<PresenceInfo> {
    const now = new Date();

    // 1. Check active approved leave
    const activeLeave = await prisma.leaveRequest.findFirst({
      where: {
        workspaceId,
        userId,
        status: "APPROVED",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (activeLeave) {
      return {
        userId,
        status: "OUT_OF_OFFICE",
        statusLabel: "Out of office",
        lastSeen: null,
      };
    }

    // 2. Check if in an active meeting right now
    const activeMeeting = await prisma.meeting.findFirst({
      where: {
        workspaceId,
        startTime: { lte: now },
        endTime: { gte: now },
        participants: {
          some: {
            userId,
            status: "ACCEPTED",
          },
        },
      },
      include: { organizer: { select: { displayName: true } } },
    });

    if (activeMeeting) {
      return {
        userId,
        status: "BUSY",
        statusLabel: `In a meeting: ${activeMeeting.title}`,
        lastSeen: null,
      };
    }

    // 3. Fall back to socket connection state
    const online = this.isOnline(workspaceId, userId);
    const lastSeen = connectedUsers.get(workspaceId)?.get(userId) ?? null;

    return {
      userId,
      status: online ? "ONLINE" : "OFFLINE",
      statusLabel: online ? "Online" : "Offline",
      lastSeen,
    };
  }

  // ---------------------------------------------------------------------------
  // Bulk status for the workspace
  // ---------------------------------------------------------------------------

  static async getWorkspacePresence(workspaceId: string): Promise<PresenceInfo[]> {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });

    return Promise.all(members.map(m => this.computeStatus(workspaceId, m.userId)));
  }
}
```

### `apps/api/src/modules/presence/presence.controller.ts`

```typescript
import { Request, Response } from "express";
import { PresenceService } from "./presence.service";

export class PresenceController {

  /**
   * Get dynamic presence status for ALL members in the user's workspace.
   * The frontend uses this on initial load; real-time updates come via socket.
   */
  static async getWorkspacePresence(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const presence = await PresenceService.getWorkspacePresence(workspaceId);
      res.status(200).json({ success: true, data: presence });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Get presence status for a single user.
   */
  static async getUserPresence(req: Request, res: Response) {
    try {
      const workspaceId = req.user!.workspaceId!;
      const userId = req.params.userId as string;
      const presence = await PresenceService.computeStatus(workspaceId, userId);
      res.status(200).json({ success: true, data: presence });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/presence/presence.routes.ts`

```typescript
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireWorkspace } from "../../middleware/tenant";
import { PresenceController } from "./presence.controller";

const router = Router();

router.use(requireAuth, requireWorkspace);

// Get presence for all workspace members (REST snapshot for initial load)
router.get("/", PresenceController.getWorkspacePresence);

// Get presence for a single user
router.get("/:userId", PresenceController.getUserPresence);

export default router;
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
