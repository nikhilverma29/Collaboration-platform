# ADR 008: Refresh Token Rotation Concurrency and TOCTOU Race Condition Mitigation

* **Status:** Known Tech Debt / Production Fix Identified
* **Deciders:** Security & Core Auth Team
* **Date:** 2026-07-02

---

## 1. Context & Problem Statement

Syncra implements **Refresh Token Rotation with Reuse Detection** (RFC 6819):
* Every time a refresh token is used, it is invalidated and replaced with a new refresh token.
* If a previously invalidated refresh token is presented again (indicating that an attacker has stolen and reused an old token), the system assumes session theft has occurred and **immediately revokes all active sessions for that user**.

This is an essential defense-in-depth mechanism against session hijacking.

---

## 2. Decision & Current Implementation

In `auth.service.ts` (lines 98–136), the session refresh logic is currently written as:
```ts
// 1. Read existing token
const session = await prisma.refreshToken.findUnique({
  where: { tokenHash },
  include: { user: true }
});

if (!session) throw new Error("Invalid refresh token");

// 2. Check revocation status (Theft Detection)
if (session.isRevoked) {
  // Revoke ALL sessions for this user
  await prisma.refreshToken.updateMany({
    where: { userId: session.userId },
    data: { isRevoked: true }
  });
  throw new Error("Refresh token has been revoked (potential theft detected)");
}

// 3. Mark current token as revoked
await prisma.refreshToken.update({
  where: { id: session.id },
  data: { isRevoked: true }
});

// 4. Issue new token pair
return this.createSession(session.userId);
```

---

## 3. The Vulnerability: Time-of-Check to Time-of-Use (TOCTOU)

### How the Race Condition Works
Notice that step 1 (`findUnique`) and step 3 (`update`) are executed as **two separate, uncoordinated SQL queries** without a database transaction or row-level lock.

If two requests arrive with the same valid refresh token at the exact same millisecond:
* **Scenario A (Benign):** A user has two browser tabs open, and both tabs trigger `/auth/refresh` simultaneously when the 15-minute access token expires.
* **Scenario B (Adversarial):** A malicious actor intercepts a refresh token and attempts to race the legitimate user to rotate it.

```
Request 1 (Tab A / Attacker)           Request 2 (Tab B / User)
────────────────────────────           ────────────────────────
SELECT * FROM refresh_tokens;          SELECT * FROM refresh_tokens;
→ isRevoked is FALSE                   → isRevoked is FALSE

Check passed                           Check passed

UPDATE refresh_tokens                  UPDATE refresh_tokens
SET isRevoked = TRUE                   SET isRevoked = TRUE

Creates Session 1                      Creates Session 2
```

### The Failure Modes
1. **Theft Detection Bypass:** In an adversarial attack, both requests pass the `session.isRevoked` check before either write commits. The attacker successfully acquires a new session, and the theft detection alert (`updateMany isRevoked: true`) is **never triggered**.
2. **Benign User Lockout:** If Request 1 finishes slightly faster and marks `isRevoked: true` before Request 2 executes step 2, Request 2 triggers the theft detection block and **wipes all sessions**, abruptly logging the legitimate user out of all devices.

---

## 4. Production Remediation

The race condition must be eliminated by making the check and the revocation **single-step atomic operations** at the database level.

### The Correct Fix: Atomic Conditional Update
Instead of `findUnique` followed by `if (session.isRevoked)`, use a conditional SQL `UPDATE ... WHERE ... RETURNING`:

```ts
static async refreshSessionAtomic(rawRefreshToken: string) {
  const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

  // Atomic update: only updates if the token exists AND is NOT yet revoked
  const [updatedToken] = await prisma.$queryRaw<RefreshToken[]>`
    UPDATE refresh_tokens
    SET is_revoked = true, updated_at = NOW()
    WHERE token_hash = ${tokenHash} AND is_revoked = false
    RETURNING *;
  `;

  if (!updatedToken) {
    // If no row was updated, either the token is invalid OR it was already revoked!
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (existing && existing.isRevoked) {
      // THEFT DETECTED: Revoke all sessions for this user
      await prisma.refreshToken.updateMany({
        where: { userId: existing.userId },
        data: { isRevoked: true }
      });
      throw new Error("Potential token theft detected. All sessions revoked.");
    }
    throw new Error("Invalid refresh token.");
  }

  // Guaranteed single winner: issue new session
  return this.createSession(updatedToken.userId);
}
```

### Why This Works
PostgreSQL row-level write locks guarantee that only **one single query** can update the row where `is_revoked = false`. The second racing query immediately returns 0 rows, preventing dual-issuance and eliminating the TOCTOU window entirely.

