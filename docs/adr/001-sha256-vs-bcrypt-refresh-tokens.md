# ADR 001: Why SHA-256 Over Bcrypt for Refresh Token Hashing

* **Status:** Accepted
* **Deciders:** Architecture & Security Team
* **Date:** 2026-07-01

---

## 1. Context & Problem Statement

In Syncra's session architecture, authentication tokens are issued in pairs: a short-lived JSON Web Token (`syncra_access`, 15-minute lifetime) and a long-lived refresh token (`syncra_refresh`, 7-day lifetime). 

While passwords must be protected against brute-force and dictionary attacks, long-lived refresh tokens stored in the database present a different threat model:
* **The Threat Model:** If the PostgreSQL database or a backup is exfiltrated, an attacker must not be able to use raw tokens from the database to forge sessions or authenticate against the API.
* **The Question:** Should refresh tokens be hashed with an intentionally slow, salted algorithm like **Bcrypt** (as done with user passwords), or with a fast cryptographic hash like **SHA-256**?

---

## 2. Decision

We store the **SHA-256 digest** of the raw refresh token in the `RefreshToken.tokenHash` column (`schema.prisma`):
```ts
// auth.service.ts
const rawRefreshToken = crypto.randomBytes(64).toString("hex");
const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
```
When a client presents a refresh token via cookie, the server hashes the incoming token using SHA-256 and performs an exact lookup on `tokenHash`.

---

## 3. Alternatives Considered

### Alternative A: Bcrypt (Password Hashing Algorithm)
* **How it works:** Uses a configurable cost factor (work factor) and salt to deliberately consume CPU cycles (typically 100ms–300ms per verification).
* **Why it was rejected:** 
  1. **Entropy Profile:** Bcrypt was designed specifically to protect low-entropy, human-chosen strings (passwords) where an attacker can run offline wordlists and dictionary attacks. Refresh tokens are generated using `crypto.randomBytes(64)`—yielding 512 bits of cryptographically secure pseudorandom entropy. The search space is $2^{512}$. An offline brute-force or dictionary attack against 512 bits of pure randomness is mathematically impossible regardless of hashing speed.
  2. **Latency & Throughput Bottleneck:** Every active user calls `POST /api/auth/refresh` every 15 minutes. Adding 100ms–300ms of CPU-blocking bcrypt computation per refresh would exhaust Node.js event-loop worker threads and introduce severe latency spikes under multi-user load.

### Alternative B: Plaintext Storage
* **How it works:** Store the raw refresh token directly in the database.
* **Why it was rejected:** If an SQL injection vulnerability or database dump exfiltrates the `refresh_tokens` table, the attacker gains immediate access to every active session in the workspace without needing user credentials.

---

## 4. Consequences & Trade-offs

### Positive
* **Cryptographic Security:** An exfiltrated database reveals only SHA-256 hashes. Because raw tokens possess 512 bits of entropy, the one-way preimage resistance of SHA-256 ensures an attacker cannot invert the hash to recover the valid cookie token.
* **Sub-Millisecond Verification:** SHA-256 runs in microseconds, keeping the `/api/auth/refresh` hot path fast and non-blocking for concurrent clients.
* **Exact Index Lookup:** Unlike Bcrypt (which requires querying by user ID and comparing salts), SHA-256 allows an indexed $O(1)$ unique lookup on `tokenHash`.

### Negative / Trade-offs
* **Collision Resistance:** SHA-256 has a theoretical collision probability, though practically zero ($2^{-256}$).
* **Lack of Salting:** A global rainbow table could theoretically target pre-computed hashes; however, because the input space is 512 bits of CSPRNG bytes, no rainbow table can be pre-computed.

