/**
 * @syncra/validators
 *
 * Shared Zod validation schemas used across apps/api and apps/web.
 * This file is the single export barrel for all validators.
 *
 * Phase 0: Intentionally minimal — the structure is established here
 * and schemas will be added per-phase as domain models are defined.
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
