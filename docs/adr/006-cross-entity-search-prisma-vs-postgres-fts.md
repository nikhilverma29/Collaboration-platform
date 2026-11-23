# ADR 006: Cross-Entity Search — Prisma Fan-Out vs. PostgreSQL Full-Text Search (FTS)

* **Status:** Accepted (Prototype / Phase 6 Implementation)
* **Deciders:** Search & Database Engineering
* **Date:** 2026-07-01

---

## 1. Context & Problem Statement

Phase 6 introduced **Global Search**: a single query input in the top navigation allowing users to search across three core business entities in their workspace:
1. **Tasks** (matching `title`, `description`, and `labels`).
2. **Messages** (matching message `content`).
3. **Files** (matching `fileName` and `description`).

We needed a search architecture that could query multiple heterogeneous tables simultaneously, enforce workspace tenant boundaries, and return ranked results without adding third-party infrastructure.

---

## 2. Decision

We implemented a **3× Prisma Parallel Fan-Out** in `search.service.ts`:
```ts
const [tasks, messages, files] = await Promise.all([
  prisma.task.findMany({
    where: {
      workspaceId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { labels: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: limit,
  }),
  prisma.message.findMany({
    where: {
      workspaceId,
      content: { contains: query, mode: 'insensitive' },
      isDeleted: false,
    },
    take: limit,
  }),
  prisma.file.findMany({
    where: {
      workspaceId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: limit,
  }),
]);
```

---

## 3. Alternatives Considered

### Alternative A: Dedicated Search Cluster (Elasticsearch, Meilisearch, Typesense)
* **How it works:** Ingestion pipeline syncs PostgreSQL updates into an external inverted-index search engine.
* **Why it was rejected:**
  * **Operational Burden:** Adds cluster hosting costs, failover management, and network boundaries.
  * **Dual-Write Consistency:** Risk of split-brain or stale results if sync pipelines fail or lag.

### Alternative B: PostgreSQL Native Full-Text Search (`tsvector` & GIN Indexes)
* **How it works:** Add generated `tsvector` columns with language-aware stemmers and GIN (Generalized Inverted Index) indexes directly in PostgreSQL.
* **Why it was deferred:** Prisma ORM has historically had limited native schema support for PostgreSQL generated tsvector columns without relying on raw SQL migrations and `prisma.$queryRaw`.

---

## 4. Consequences & Performance Profile (`@BlindSpot`)

### Positive
* **100% Type-Safe & Zero Extra Infrastructure:** The search runs entirely through standard Prisma client calls against our existing Supabase PostgreSQL instance.
* **Guaranteed Tenant Isolation:** `workspaceId` is strictly enforced in the `where` clause of all three queries.

### Critical Scalability Failure Mode: `LIKE '%term%'` Table Scans
* **The Performance Flaw:**
  Prisma's `{ contains: query, mode: 'insensitive' }` generates the following SQL:
  ```sql
  WHERE workspace_id = $1 AND LOWER(content) LIKE LOWER('%' || $2 || '%')
  ```
  In relational databases, **leading-wildcard queries (`LIKE '%term%'`) cannot use standard B-Tree indexes**. 
* **Impact at Scale:**
  As the `messages` table grows past 100,000+ rows, every global search execution forces PostgreSQL into a **full sequential table scan**, causing CPU spikes and request timeouts.

---

## 5. Production Migration Path

The production-grade solution is to upgrade to **PostgreSQL Native Full-Text Search (FTS)**:

1. **Add GIN Index via Migration:**
   ```sql
   ALTER TABLE messages ADD COLUMN content_tsv tsvector 
     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
   CREATE INDEX idx_messages_tsv ON messages USING GIN (content_tsv);
   ```
2. **Execute Indexed FTS in Service:**
   ```ts
   const messages = await prisma.$queryRaw`
     SELECT id, content, created_at,
            ts_rank(content_tsv, plainto_tsquery('english', ${query})) AS rank
     FROM messages
     WHERE workspace_id = ${workspaceId}
       AND content_tsv @@ plainto_tsquery('english', ${query})
     ORDER BY rank DESC
     LIMIT ${limit};
   `;
   ```
This provides sub-5ms inverted-index search times, word stemming (matching "run" to "running"), and relevance ranking without adding external search services.

