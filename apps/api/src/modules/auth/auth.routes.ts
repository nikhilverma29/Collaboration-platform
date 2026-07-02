import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AuthController } from "./auth.controller";

const router = Router();

/**
 * Strict rate limiter for auth endpoints.
 * Production: 10 attempts per 15 minutes per IP — prevents brute force on login/register.
 * Development/Test: 1000 attempts — allows integration test suites to run without hitting 429.
 */
const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PRODUCTION ? 10 : 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Too many authentication attempts — please try again later." },
  skip: () => !IS_PRODUCTION, // Skip entirely in non-production — avoids any state accumulation
});

router.post("/register", authLimiter, AuthController.register);
router.post("/login", authLimiter, AuthController.login);
router.post("/refresh", AuthController.refresh);
router.post("/logout", AuthController.logout);
router.post("/forgot-password", authLimiter, AuthController.forgotPassword);
router.post("/reset-password", authLimiter, AuthController.resetPassword);

export default router;
