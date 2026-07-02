import { z } from "zod";

export const updateProfileSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters long").optional(),
  bio: z.string().max(160, "Bio cannot exceed 160 characters").nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters long"),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
