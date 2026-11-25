import { Response, CookieOptions } from "express";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Cookie options tailored for both local development and cross-domain production
 * (e.g., frontend on Vercel, backend on Render).
 *
 * In production cross-site contexts, SameSite MUST be 'none' and Secure MUST be true.
 * In local development (HTTP localhost), SameSite is 'lax' and Secure is false.
 */
export const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? ("none" as const) : ("lax" as const),
  path: "/",
});

/**
 * Sets both the short-lived access token and the long-lived refresh token
 * as HTTP-only cookies on the response.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const baseOptions = getCookieOptions();

  // Access Token: 15 minutes
  res.cookie("syncra_access", accessToken, {
    ...baseOptions,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh Token: 7 days
  res.cookie("syncra_refresh", refreshToken, {
    ...baseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clears both authentication cookies (used for logout).
 */
export function clearAuthCookies(res: Response) {
  const baseOptions = getCookieOptions();
  res.clearCookie("syncra_access", baseOptions);
  res.clearCookie("syncra_refresh", baseOptions);
}
