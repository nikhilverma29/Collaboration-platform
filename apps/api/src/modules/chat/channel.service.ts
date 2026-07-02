import { prisma } from "../../lib/db";
import { CreateChannelInput, UpdateChannelInput, CreateDMInput } from "@syncra/validators";

export class ChannelService {

  // ---------------------------------------------------------------------------
  // Public Channels
  // ---------------------------------------------------------------------------

  /**
   * List all non-archived public channels in a workspace.
   * Private channels and DMs are excluded — they are only visible to members.
   */
  static async listPublic(workspaceId: string) {
    return prisma.channel.findMany({
      where: { workspaceId, type: "PUBLIC", isArchived: false },
      include: {
        _count: { select: { members: true, messages: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  /**
   * List all channels a specific user has access to (public + their private + their DMs).
   */
  static async listForUser(workspaceId: string, userId: string) {
    return prisma.channel.findMany({
      where: {
        workspaceId,
        isArchived: false,
        OR: [
          { type: "PUBLIC" },
          { type: { in: ["PRIVATE", "DIRECT"] }, members: { some: { userId } } },
        ],
      },
      include: {
        _count: { select: { messages: true } },
        members: {
          select: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Get full channel details including members.
   * Validates the requesting user has access before returning.
   */
  static async getById(channelId: string, workspaceId: string, requestingUserId: string) {
    const channel = await prisma.channel.findUniqueOrThrow({
      where: { id: channelId, workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true, email: true } } },
        },
        createdBy: { select: { id: true, displayName: true } },
      },
    });

    // Access guard: private/DM channels require membership
    if (channel.type !== "PUBLIC") {
      const isMember = channel.members.some((m) => m.userId === requestingUserId);
      if (!isMember) throw new Error("You are not a member of this channel");
    }

    return channel;
  }

  /**
   * Create a new public or private channel.
   * Creator is automatically added as a member.
   */
  static async create(workspaceId: string, actorId: string, data: CreateChannelInput) {
    return prisma.channel.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: data.name,
        description: data.description,
        type: data.type,
        members: {
          create: { userId: actorId }, // Creator is auto-added
        },
      },
      include: {
        members: { select: { userId: true } },
      },
    });
  }

  /**
   * Update channel name/description. Restricted to members.
   */
  static async update(channelId: string, workspaceId: string, data: UpdateChannelInput) {
    return prisma.channel.update({
      where: { id: channelId, workspaceId },
      data,
    });
  }

  /**
   * Soft-archive a channel.
   */
  static async archive(channelId: string, workspaceId: string) {
    return prisma.channel.update({
      where: { id: channelId, workspaceId },
      data: { isArchived: true },
    });
  }

  /**
   * Delete a channel and all its messages.
   */
  static async delete(channelId: string, workspaceId: string) {
    return prisma.channel.delete({ where: { id: channelId, workspaceId } });
  }

  // ---------------------------------------------------------------------------
  // Channel Membership
  // ---------------------------------------------------------------------------

  /**
   * Add a workspace member to a private channel.
   */
  static async addMember(channelId: string, targetUserId: string) {
    return prisma.channelMember.create({
      data: { channelId, userId: targetUserId },
    });
  }

  /**
   * Remove a member from a channel.
   */
  static async removeMember(channelId: string, targetUserId: string) {
    return prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId: targetUserId } },
    });
  }

  // ---------------------------------------------------------------------------
  // Direct Messages
  // ---------------------------------------------------------------------------

  /**
   * Find an existing DM channel between two users, or create one.
   * A DM is a DIRECT-type channel whose members are exactly the two participants.
   */
  static async findOrCreateDM(workspaceId: string, actorId: string, data: CreateDMInput) {
    const { targetUserId } = data;

    if (actorId === targetUserId) {
      throw new Error("Cannot create a DM with yourself");
    }

    // Check if a DM already exists between these two users in this workspace
    const existing = await prisma.channel.findFirst({
      where: {
        workspaceId,
        type: "DIRECT",
        members: { some: { userId: actorId } },
        AND: [{ members: { some: { userId: targetUserId } } }],
      },
      include: { members: { select: { userId: true } } },
    });

    if (existing) return existing;

    // Create the DM channel with both users as members
    return prisma.channel.create({
      data: {
        workspaceId,
        createdById: actorId,
        name: null, // DMs have no name
        type: "DIRECT",
        members: {
          create: [{ userId: actorId }, { userId: targetUserId }],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      },
    });
  }
}
