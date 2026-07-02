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
