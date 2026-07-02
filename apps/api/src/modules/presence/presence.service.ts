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
