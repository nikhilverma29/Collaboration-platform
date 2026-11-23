/**
 * @syncra/validators
 *
 * Shared Zod validation schemas and TypeScript contracts used across apps/api and apps/web.
 * Single export barrel for all domain validators.
 */

export { z } from "zod";
export * from "./auth";
export * from "./workspace";
export * from "./rbac";
export * from "./socket.events";
export * from "./socket.types";
export * from "./project";
export * from "./task";
export * from "./storage";
export * from "./channel";
export * from "./message";
export * from "./receipt";
export * from "./search";
export * from "./org";
export * from "./calendar";
export * from "./user";
export * from "./notification";
