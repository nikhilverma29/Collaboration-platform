import { z } from "zod";

export const sendMessageSchema = z.object({
  channelId: z.string().cuid(),
  content: z.string().min(1, "Message cannot be empty").max(4000),
  parentId: z.string().cuid().optional().nullable(), // thread reply
  fileId: z.string().cuid().optional().nullable(),   // file attachment
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const listMessagesSchema = z.object({
  channelId: z.string().cuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().cuid().optional(), // cursor-based pagination
});

export const reactMessageSchema = z.object({
  emoji: z.string().min(1).max(10), // e.g. "👍"
});

export const typingSchema = z.object({
  channelId: z.string().cuid(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type TypingInput = z.infer<typeof typingSchema>;
