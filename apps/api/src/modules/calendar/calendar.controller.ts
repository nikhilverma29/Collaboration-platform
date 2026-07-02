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
