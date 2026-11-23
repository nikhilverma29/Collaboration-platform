# ADR 002: Fractional Indexing (Floating-Point Positions) for Task Ordering

* **Status:** Accepted
* **Deciders:** Architecture & Frontend Team
* **Date:** 2026-06-30

---

## 1. Context & Problem Statement

Syncra's Kanban board and List views allow users to arbitrarily drag and drop tasks to reorder them within a column or move them between workflow stages.

In a relational database, storing list order requires a strategy that minimizes database writes and row locking while preserving consistent ordering across concurrent users.

---

## 2. Decision

We use **Floating-Point Fractional Indexing** (`position Float @default(0)` in `schema.prisma`).
When a task is dragged between two adjacent tasks with positions $P_A$ and $P_B$, the task's new position is computed as:
$$\text{position}_{\text{new}} = \frac{P_A + P_B}{2}$$
If dragged to the top of a column with first task at $P_1$, it receives $P_1 - 1024$ (or $P_1 / 2$). If dragged to the bottom, it receives $P_{\text{last}} + 1024$.

```prisma
model Task {
  id       String @id @default(cuid())
  position Float  @default(0)
  // ...
  @@index([columnId])
}
```

---

## 3. Alternatives Considered

### Alternative A: Dense Integer Sequencing (1, 2, 3...)
* **How it works:** Each task in a column is assigned an integer index (`position = 1, 2, 3...`).
* **Why it was rejected:**
  * **Write Amplification ($O(N)$ writes):** Moving a task from position 100 to position 1 requires updating the position of all 99 intervening tasks (`UPDATE tasks SET position = position + 1 WHERE column_id = ... AND position >= 1`).
  * **Locking & Deadlocks:** Heavy write cascades lock dozens of rows in PostgreSQL, causing latency spikes and deadlocks if two team members drag tasks in the same column concurrently.

### Alternative B: Doubly Linked Lists (`prevTaskId` / `nextTaskId`)
* **How it works:** Each task stores pointers to the task above and below it.
* **Why it was rejected:**
  * **Query Complexity:** Sorting tasks chronologically requires recursive Common Table Expressions (CTEs) or in-memory array reconstruction.
  * **Data Corruption Risk:** A single failed or partial update creates broken links, orphaned sub-lists, or infinite pointer cycles.

### Alternative C: String-Based Fractional Indexing (LexoRank)
* **How it works:** Used by Atlassian Jira and Linear. Positions are alphanumeric strings (`"0|hzzzzz:"`). Reordering calculates the midpoint string lexicographically.
* **Why it was deferred:** Requires significant custom string math or external libraries. Floating-point numbers provide identical single-write ergonomics out of the box with zero dependencies.

---

## 4. Consequences & Trade-offs

### Positive
* **Single-Row Update ($O(1)$ write):** Dragging a task updates only **one single row** in PostgreSQL:
  ```ts
  await prisma.task.update({ where: { id }, data: { columnId, position: newPos } })
  ```
  No other tasks in the column are touched.
* **Clean Transaction Log:** Real-time event broadcasting emits a single `TASK_MOVED` event containing only the modified task.

### Negative / Known Limitations (The Float Precision Edge Case)
* **IEEE 754 Mantissa Exhaustion:**
  JavaScript and PostgreSQL 64-bit floating-point numbers provide 53 bits of precision (~15–17 significant decimal digits). If users repeatedly drag a task into the exact same gap between two tasks without moving other tasks, the gap halves each time:
  $$\Delta = \frac{P_B - P_A}{2^k}$$
  After approximately 50 consecutive mid-point insertions in the exact same gap, $P_A + P_B == 2 \times P_A$, and precision is exhausted. Two adjacent tasks will end up with identical position floats.
* **Production Mitigation Path:**
  For enterprise scale (>10,000 tasks per column), the system should implement either:
  1. **Background Rebalancing:** A cron job or trigger that detects $|\Delta| < 10^{-6}$ and re-spaces the column integers by intervals of 1,000 (`1000, 2000, 3000...`).
  2. **LexoRank:** Upgrading the `position` column to `VarChar` using string fractional indexing.

