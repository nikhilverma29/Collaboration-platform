import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../lib/jwt";

// Extend Express Request interface to include the decoded JWT payload
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Middleware: requireAuth
 * Validates the JWT from the `syncra_access` cookie.
 * If valid, attaches the decoded payload to `req.user`.
 * If missing or invalid, rejects the request with 401 Unauthorized.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies.syncra_access;
    
    if (!token) {
      res.status(401).json({ success: false, error: "Unauthorized - No access token provided" });
      return;
    }

    const payload = verifyAccessToken(token);
    req.user = payload;
    
    next();
  } catch (error) {
    // Catch token expiration or verification errors
    res.status(401).json({ success: false, error: "Unauthorized - Invalid or expired token" });
  }
}
