# ADR 005: Socket.io In-Memory Adapter Strategy and Multi-Instance Redis Migration Path

* **Status:** Accepted (Prototype / Single-Node Phase)
* **Deciders:** Infrastructure & Real-Time Team
* **Date:** 2026-07-02

---

## 1. Context & Problem Statement

Real-time collaboration platforms require bidirectional WebSocket connections between client browsers and backend application servers. 

As application traffic grows, a single Node.js process cannot handle thousands of concurrent WebSocket connections or CPU-heavy JSON workloads. The backend must be able to scale horizontally by running multiple API instances behind a reverse proxy or application load balancer (e.g., AWS ALB, Nginx, or Kubernetes Ingress).

---

## 2. Decision

During Phase 1–8 development, Syncra uses the **default in-memory adapter** provided natively by Socket.io:
```ts
// socket.service.ts line 23-25
// Default in-memory adapter is used for Phase 1-8 development.
this.io = new Server(server, { ... });
```
Room memberships and socket IDs are tracked in local process memory (`Map<Room, Set<SocketId>>`).

---

## 3. Alternatives Considered

### Alternative A: Redis Pub/Sub Adapter (`@socket.io/redis-adapter`)
* **How it works:** Socket.io uses a centralized Redis cluster via Redis Pub/Sub to broadcast events across any number of independent server instances.
* **Why it was deferred:** 
  * Requires spinning up and managing a Redis instance during local development and CI testing.
  * For local prototyping and single-server deployment, in-memory operations are faster and have zero external failure dependencies.

### Alternative B: Polling Fallbacks (Short Polling / Long Polling)
* **How it works:** Clients periodically send HTTP requests to check for new messages or task mutations.
* **Why it was rejected:** Introduces unnecessary HTTP overhead, latency delays, and database query storms. True WebSocket push notifications are required for low-latency collaboration.

---

## 4. Consequences & Scalability Bottlenecks

### Positive
* **Zero Infrastructure Overhead:** No Redis setup, network connection strings, or cloud cache bills are needed to run and test the complete real-time features locally.
* **Maximum Performance on Single Node:** In-memory message routing has sub-millisecond dispatch times with no inter-process network hops.

### Critical Scalability Failure Mode (Multi-Instance Deadlock)
* **The Failure:** 
  If two API instances (`Server A` and `Server B`) are deployed behind a load balancer:
  1. User 1 connects to `Server A`.
  2. User 2 connects to `Server B`.
  3. User 1 sends a message via `Server A`.
  4. `Server A` executes `this.io.to('workspace:123').emit(...)`.
  5. Because the adapter is in-memory, **`Server A` has no knowledge of User 2's socket on `Server B`**.
  6. **User 2 never receives the message event in real time.**

---

## 5. Production Migration Path

The migration to horizontal scalability is straightforward and requires zero modifications to controller logic:

1. **Install Redis Adapter:**
   ```bash
   npm install @socket.io/redis-adapter ioredis
   ```
2. **Wire Adapter in `SocketService.init()`:**
   ```ts
   import { createAdapter } from "@socket.io/redis-adapter";
   import Redis from "ioredis";

   if (process.env.REDIS_URL) {
     const pubClient = new Redis(process.env.REDIS_URL);
     const subClient = pubClient.duplicate();
     this.io.adapter(createAdapter(pubClient, subClient));
     console.log("[Socket.io] Redis adapter attached for horizontal scaling.");
   }
   ```
3. **Load Balancer Configuration:** Configure sticky sessions (session affinity via cookie or IP hash) for the initial HTTP handshake if long-polling transport fallback is enabled, or configure clients to connect directly via WebSocket transport (`transports: ['websocket']`).

