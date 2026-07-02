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
