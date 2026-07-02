import { z } from "zod";

export const markReadSchema = z.object({
  messageId: z.string().cuid(),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;
