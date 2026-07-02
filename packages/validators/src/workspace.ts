import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(2, "Workspace name must be at least 2 characters long"),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const joinWorkspaceSchema = z.object({
  inviteCode: z.string().min(1, "Invite code is required"),
});

export type JoinWorkspaceInput = z.infer<typeof joinWorkspaceSchema>;
