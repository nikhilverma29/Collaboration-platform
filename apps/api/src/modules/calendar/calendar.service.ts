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
