# 01-auth-sessions — Authentication & Sessions

## Purpose

User registration, login, logout, and refresh-token rotation. Passwords are bcrypt-hashed. Refresh tokens are SHA-256 hashed before DB storage. Reuse of a revoked token triggers a full session wipe (theft detection).

## Dependencies

- `00-core-foundation`

## Main User Flow

POST /api/auth/register → hash password → create user → create session → set HttpOnly cookies. POST /api/auth/login → verify password → rotate session. POST /api/auth/refresh → validate hash → revoke old → issue new. POST /api/auth/logout → revoke + clear cookies.

## Files Involved

- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/middleware/auth.ts`
- `packages/validators/src/auth.ts`

## Source Code

### `apps/api/src/modules/auth/auth.service.ts`

```typescript
import { prisma } from "../../lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { RegisterInput, LoginInput } from "@syncra/validators";

export class AuthService {
  /**
   * Registers a new user.
   */
  static async register(data: RegisterInput) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash the password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        displayName: data.displayName,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Authenticates a user.
   */
  static async login(data: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        passwordHash: true, // needed for bcrypt.compare — stripped after
      },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error("Invalid credentials");
    }

    // Strip hash before returning
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Creates a new session (Refresh Token) for the user.
   * We generate a secure 64-byte token, hash it with SHA-256 for fast O(1) DB lookups,
   * and store the hash.
   */
  static async createSession(userId: string) {
    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    
    const session = await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });

    return {
      rawRefreshToken,
      sessionId: session.sessionId
    };
  }
  
  /**
   * Rotates a session using the provided raw refresh token.
   * If the token is valid, it revokes the old session and creates a new one.
   * If the token was already revoked (potential theft), it revokes all active sessions for that user.
   */
  static async refreshSession(rawRefreshToken: string) {
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    
    const session = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    
    if (!session) {
      throw new Error("Invalid refresh token");
    }
    
    if (session.isRevoked) {
      // Security measure: Token was reused. Revoke ALL sessions for this user.
      await prisma.refreshToken.updateMany({
        where: { userId: session.userId },
        data: { isRevoked: true }
      });
      throw new Error("Refresh token has been revoked (potential theft detected)");
    }
    
    if (session.expiresAt < new Date()) {
      throw new Error("Refresh token has expired");
    }
    
    // Revoke the current token
    await prisma.refreshToken.update({
      where: { id: session.id },
      data: { isRevoked: true }
    });
    
    // Generate a new session
    const newSessionData = await this.createSession(session.userId);
    
    return {
      session: newSessionData,
      user: session.user
    };
  }

  /**
   * Revokes a session based on the raw refresh token (used for Logout).
   */
  static async revokeByRefreshToken(rawRefreshToken: string) {
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isRevoked: true }
    });
  }
}
```

### `apps/api/src/modules/auth/auth.controller.ts`

```typescript
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { registerSchema, loginSchema } from "@syncra/validators";
import { signAccessToken } from "../../lib/jwt";
import { setAuthCookies, clearAuthCookies } from "../../lib/cookie";

export class AuthController {
  /**
   * Register a new user and create an initial session.
   */
  static async register(req: Request, res: Response) {
    try {
      const data = registerSchema.parse(req.body);
      const user = await AuthService.register(data);
      
      const { rawRefreshToken, sessionId } = await AuthService.createSession(user.id);
      
      const accessToken = signAccessToken({
        userId: user.id,
        workspaceId: null, // Initial session has no tenant context
        role: null,
        sessionId,
      });
      
      setAuthCookies(res, accessToken, rawRefreshToken);
      
      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        }
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Authenticate a user and create a session.
   */
  static async login(req: Request, res: Response) {
    try {
      const data = loginSchema.parse(req.body);
      const user = await AuthService.login(data);
      
      const { rawRefreshToken, sessionId } = await AuthService.createSession(user.id);
      
      const accessToken = signAccessToken({
        userId: user.id,
        workspaceId: null, // Populated later when user selects a workspace
        role: null,
        sessionId,
      });
      
      setAuthCookies(res, accessToken, rawRefreshToken);
      
      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        }
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        res.status(400).json({ success: false, error: error.errors });
        return;
      }
      res.status(401).json({ success: false, error: error.message });
    }
  }

  /**
   * Rotate a refresh token and issue a new access token.
   */
  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.syncra_refresh;
      
      if (!refreshToken) {
        res.status(401).json({ success: false, error: "No refresh token provided" });
        return;
      }
      
      const { session, user } = await AuthService.refreshSession(refreshToken);
      
      const accessToken = signAccessToken({
        userId: user.id,
        workspaceId: null, // Note: To keep tenant context during refresh, this should ideally be recovered. 
                           // But since refresh is global, they will re-select workspace, or we can decode the old access token if passed.
                           // For now, setting to null means they re-enter the workspace globally.
        role: null,
        sessionId: session.sessionId,
      });
      
      setAuthCookies(res, accessToken, session.rawRefreshToken);
      
      res.status(200).json({ success: true });
    } catch (error: any) {
      clearAuthCookies(res); // Clear on any refresh failure
      res.status(401).json({ success: false, error: error.message });
    }
  }
  
  /**
   * Revoke the session and clear cookies.
   */
  static async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.syncra_refresh;
      if (refreshToken) {
        await AuthService.revokeByRefreshToken(refreshToken);
      }
      clearAuthCookies(res);
      res.status(200).json({ success: true });
    } catch (error: any) {
      // Ensure cookies are cleared even if DB revoke fails
      clearAuthCookies(res);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
```

### `apps/api/src/modules/auth/auth.routes.ts`

```typescript
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AuthController } from "./auth.controller";

const router = Router();

/**
 * Strict rate limiter for auth endpoints.
 * 10 attempts per 15 minutes per IP — prevents brute force on login/register.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Too many authentication attempts — please try again later." },
});

router.post("/register", authLimiter, AuthController.register);
router.post("/login", authLimiter, AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/logout", AuthController.logout);

export default router;
```

### `apps/api/src/middleware/auth.ts`

```typescript
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
```

### `packages/validators/src/auth.ts`

```typescript
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z.string().min(2, "Display name must be at least 2 characters long"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```
