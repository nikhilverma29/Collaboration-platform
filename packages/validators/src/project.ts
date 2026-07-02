import { z } from "zod";

// -----------------------------------------------------------------------------
// Project
// -----------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

// -----------------------------------------------------------------------------
// Column
// -----------------------------------------------------------------------------

export const createColumnSchema = z.object({
  name: z.string().min(1, "Column name is required").max(80),
  position: z.number().int().min(0).optional(),
});

export const updateColumnSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
