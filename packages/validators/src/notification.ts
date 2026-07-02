import { z } from "zod";

export const createNotificationSchema = z.object({
  type: z.string(),
  title: z.string(),
  body: z.string().optional(),
  link: z.string().optional(),
  userId: z.string(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
