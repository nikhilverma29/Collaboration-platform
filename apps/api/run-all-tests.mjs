/**
 * run-all-tests.mjs
 * Sequentially runs every integration test file.
 * A fresh server must already be running on :4000.
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";

const tests = [
  { file: "test-auth.ts",             name: "Phase 1 — Auth & Sessions" },
  { file: "test-workspace.ts",        name: "Phase 2 — Workspaces & Multi-Tenancy" },
  { file: "test-middleware.ts",       name: "Phase 2 — Auth/Tenant Middleware" },
  { file: "test-rbac.ts",            name: "Phase 2 — RBAC & Audit Logs" },
  { file: "test-projects.ts",        name: "Phase 3 — Projects & Kanban Columns" },
  { file: "test-tasks.ts",           name: "Phase 3 — Tasks & History" },
  { file: "test-storage.ts",         name: "Phase 4 — Documents & Storage" },
  { file: "test-channels.ts",        name: "Phase 5 — Channels & DMs" },
  { file: "test-messages.ts",        name: "Phase 5 — Messages, Reactions & Threads" },
  { file: "test-search.ts",          name: "Phase 6 — Global Search" },
  { file: "test-org.ts",             name: "Phase 7 — Org Chart" },
  { file: "test-calendar.ts",        name: "Phase 7 — Calendar (Leaves & Meetings)" },
  { file: "test-presence.ts",        name: "Phase 7 — Presence Service" },
];

const PASS = "\x1b[32m✅ PASS\x1b[0m";
const FAIL = "\x1b[31m❌ FAIL\x1b[0m";
const SKIP = "\x1b[33m⚠️  SKIP\x1b[0m";

const results = [];

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║         SYNCRA BACKEND — FULL INTEGRATION TEST RUN       ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

for (const { file, name } of tests) {
  process.stdout.write(`  Running: ${name.padEnd(45)} `);
  
  try {
    execSync(`npx tsx ${file}`, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
    console.log(PASS);
    results.push({ name, status: "PASS" });
  } catch (err) {
    const output = err.stdout?.toString() || err.message;
    console.log(FAIL);
    // Extract the first error line from output
    const errLine = output.split("\n").find(l => l.includes("❌") || l.includes("Error") || l.includes("failed")) || "Unknown error";
    console.log(`          → ${errLine.trim()}`);
    results.push({ name, status: "FAIL", error: errLine.trim() });
  }
}

// ---- Summary ----
const pass = results.filter(r => r.status === "PASS").length;
const fail = results.filter(r => r.status === "FAIL").length;

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log(`║  RESULTS: ${String(pass).padStart(2)} passed, ${String(fail).padStart(2)} failed out of ${String(results.length).padStart(2)} test suites        ║`);
console.log("╚══════════════════════════════════════════════════════════╝\n");

if (fail > 0) {
  console.log("Failed suites:");
  results.filter(r => r.status === "FAIL").forEach(r => {
    console.log(`  ❌ ${r.name}`);
    if (r.error) console.log(`     → ${r.error}`);
  });
  console.log();
}

process.exit(fail > 0 ? 1 : 0);
