import { z } from "zod";

export const setManagerSchema = z.object({
  managerId: z.string().cuid().nullable(), // nullable to remove manager
});

export type SetManagerInput = z.infer<typeof setManagerSchema>;
