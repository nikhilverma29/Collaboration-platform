import { Response } from "express";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION, // HTTPS only in production
  sameSite: "strict" as const,
  path: "/",
};

/**
 * Sets both the short-lived access token and the long-lived refresh token
 * as HTTP-only cookies on the response.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  // Access Token: 15 minutes
  res.cookie("syncra_access", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh Token: 7 days
  res.cookie("syncra_refresh", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clears both authentication cookies (used for logout).
 */
export function clearAuthCookies(res: Response) {
  res.clearCookie("syncra_access", cookieOptions);
  res.clearCookie("syncra_refresh", cookieOptions);
}
