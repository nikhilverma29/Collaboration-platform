import { z } from "zod";

export const SearchTypeSchema = z.enum(["ALL", "TASKS", "FILES", "MESSAGES"]);

export const globalSearchSchema = z.object({
  q: z.string().min(1, "Search query is required"),
  type: SearchTypeSchema.default("ALL"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchType = z.infer<typeof SearchTypeSchema>;
export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
