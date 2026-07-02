import { prisma } from "../../lib/db";
import { UpdateProfileInput, ChangePasswordInput } from "@syncra/validators";
import bcrypt from "bcryptjs";
import { AuthService } from "../auth/auth.service";

export class UserService {
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      }
    });
    
    if (!user) throw new Error("User not found");
    return user;
  }

  static async updateProfile(userId: string, data: UpdateProfileInput) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        bio: data.bio,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      }
    });
    return updated;
  }

  static async updateAvatar(userId: string, avatarUrl: string) {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
      }
    });
    return updated;
  }

  static async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });
    
    if (!user) throw new Error("User not found");
    
    const isValid = await bcrypt.compare(data.currentPassword, user.passwordHash);
    if (!isValid) throw new Error("Incorrect current password");
    
    const newHash = await bcrypt.hash(data.newPassword, 12);
    
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash }
    });
  }

  static async listSessions(userId: string) {
    const sessions = await prisma.refreshToken.findMany({
      where: { 
        userId, 
        isRevoked: false, 
        expiresAt: { gt: new Date() } 
      },
      select: {
        id: true,
        sessionId: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" }
    });
    return sessions;
  }

  static async revokeSession(userId: string, sessionId: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, sessionId },
      data: { isRevoked: true }
    });
  }

  static async revokeAllOtherSessions(userId: string, currentSessionId: string) {
    await prisma.refreshToken.updateMany({
      where: { 
        userId,
        sessionId: { not: currentSessionId }
      },
      data: { isRevoked: true }
    });
  }
}
