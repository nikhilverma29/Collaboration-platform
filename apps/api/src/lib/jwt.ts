import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["JWT_SECRET"];
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Server cannot start.");
}

export interface AccessTokenPayload {
  userId: string;
  workspaceId: string | null;
  role: string | null;
  sessionId: string;
}

/**
 * Signs a short-lived access token containing the user's tenant context.
 * Lifespan: 15 minutes.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: "15m",
    algorithm: "HS256",
  });
}

/**
 * Verifies an access token and extracts the payload.
 * Throws an error if the token is invalid or expired.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET!) as AccessTokenPayload;
}
