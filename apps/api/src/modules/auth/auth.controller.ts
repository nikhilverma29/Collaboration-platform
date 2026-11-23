import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { registerSchema, loginSchema } from "@syncra/validators";
import { signAccessToken } from "../../lib/jwt";
import { setAuthCookies, clearAuthCookies } from "../../lib/cookie";

/**
 * Sends a password reset email to the user.
 *
 * PRODUCTION TODO: Replace the console.log with your transactional email provider.
 * Recommended providers: Resend (resend.com), SendGrid, or Nodemailer + SMTP.
 *
 * The reset link should point to your frontend's reset-password page,
 * which will call POST /api/auth/reset-password with { token, newPassword }.
 */
async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetLink = `${process.env["CLIENT_URL"] ?? "http://localhost:5173"}/reset-password?token=${token}`;

  if (process.env["NODE_ENV"] !== "production") {
    // In development: log to console so the flow can be tested without an email provider
    console.log(`\n📧  [DEV] Password reset requested for: ${email}`);
    console.log(`    Reset link: ${resetLink}\n`);
    return;
  }

  // TODO: integrate email provider here
  // Example with Resend:
  // await resend.emails.send({
  //   from: "noreply@yourdomain.com",
  //   to: email,
  //   subject: "Reset your Syncra password",
  //   html: `<a href="${resetLink}">Click here to reset your password</a>`,
  // });

  throw new Error("Email provider not configured. Set up an email provider in auth.controller.ts.");
}


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

  static forgotPassword = async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ success: false, error: "Email is required" });
        return;
      }
      
      const token = await AuthService.forgotPassword(email);

      // Send the reset token via email — never expose it in the HTTP response.
      // token is null when the email has no account; we still return the same
      // generic response to prevent user enumeration.
      // TODO: Replace this stub with your chosen email provider (Resend, SendGrid, Nodemailer).
      if (token !== null) {
        await sendPasswordResetEmail(email, token);
      }
      
      // Always return the same generic message regardless of whether the email exists.
      // This prevents user enumeration — an attacker cannot tell which emails are registered.
      res.status(200).json({
        success: true,
        data: {
          message: "If an account with that email exists, a password reset link has been sent.",
        }
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };

  static resetPassword = async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        res.status(400).json({ success: false, error: "Token and new password are required" });
        return;
      }
      
      await AuthService.resetPassword(token, newPassword);
      
      res.status(200).json({ success: true, data: null });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  };
}
