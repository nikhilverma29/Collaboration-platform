import { Request, Response, NextFunction } from "express";

/**
 * Middleware: requireWorkspace
 * Ensures the authenticated user has an active workspace context.
 * Must be used AFTER `requireAuth`.
 * Checks the JWT payload for `workspaceId` and `role`.
 */
export function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ success: false, error: "Unauthorized - Authentication required" });
    return;
  }

  if (!req.user.workspaceId || !req.user.role) {
    res.status(403).json({ success: false, error: "Forbidden - Active workspace context required" });
    return;
  }

  next();
}
