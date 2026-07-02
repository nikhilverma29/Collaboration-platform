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

  /**
   * Generates a reset password token. In production, this would send an email.
   * For this portfolio project without an email service, we return it in the response.
   */
  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal user existence
      return null;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    // NOTE: In production, return nothing here and send `rawToken` via email!
    return rawToken; 
  }

  /**
   * Resets the password using a valid reset token.
   */
  static async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });

    if (!resetRecord || resetRecord.isUsed || resetRecord.expiresAt < new Date()) {
      throw new Error("Invalid or expired password reset token");
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { isUsed: true }
      }),
      // Revoke all existing sessions so they are forced to log in again
      prisma.refreshToken.updateMany({
        where: { userId: resetRecord.userId, isRevoked: false },
        data: { isRevoked: true }
      })
    ]);
  }
}
