import { prisma } from "../../lib/db";
import { Prisma } from "@prisma/client";

export class AuditService {
  /**
   * Records a governance or sensitive action to the audit log.
   * This should be used for important lifecycle events:
   * - Workspace created/deleted/updated
   * - Member invited/removed/role updated
   * - Security events
   */
  static async log(data: {
    workspaceId: string;
    actorId?: string; // Optional (e.g. system actions)
    action: string;
    targetId?: string;
    metadata?: Record<string, any>;
  }) {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: data.workspaceId,
          actorId: data.actorId,
          action: data.action,
          targetId: data.targetId,
          metadata: data.metadata ? (data.metadata as Prisma.JsonObject) : undefined,
        }
      });
    } catch (err) {
      // In a production system, if audit logging fails, you might want to alert DevOps
      // but usually you don't want to fail the entire user request.
      console.error("[CRITICAL] Failed to write audit log:", err);
    }
  }
}
