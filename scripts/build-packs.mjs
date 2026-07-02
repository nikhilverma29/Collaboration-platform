/**
 * build-packs.mjs
 * Reads packs.manifest.json, resolves each listed source file from the repo root,
 * and generates one markdown study-pack per pack inside the /packs directory.
 *
 * Structure of each generated .md:
 *   # Pack Title
 *   ## Purpose
 *   ## Main User Flow
 *   ## Files Involved
 *   ## Source Code
 *
 * Usage: node scripts/build-packs.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always resolve relative to the monorepo root (one level up from /scripts)
const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "packs.manifest.json");
const PACKS_DIR = path.join(ROOT, "packs");

// ---------------------------------------------------------------------------
// Load manifest
// ---------------------------------------------------------------------------

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error("❌  packs.manifest.json not found at:", MANIFEST_PATH);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));

if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) {
  console.error("❌  packs.manifest.json has no packs array or it is empty.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ensure output directory exists
// ---------------------------------------------------------------------------

if (!fs.existsSync(PACKS_DIR)) {
  fs.mkdirSync(PACKS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// File extension → markdown language hint
// ---------------------------------------------------------------------------

function langHint(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".mjs": "javascript",
    ".json": "json",
    ".prisma": "prisma",
    ".md": "markdown",
    ".sql": "sql",
    ".sh": "bash",
    ".env": "bash",
  };
  return map[ext] ?? "text";
}

// ---------------------------------------------------------------------------
// Build each pack
// ---------------------------------------------------------------------------

let generated = 0;
let errors = 0;

for (const pack of manifest.packs) {
  const { id, title, purpose, mainFlow, files, dependencies } = pack;

  // Validate required fields
  if (!id || !title || !files || !Array.isArray(files)) {
    console.warn(`⚠️   Skipping malformed pack entry: ${JSON.stringify(pack)}`);
    errors++;
    continue;
  }

  const sections = [];

  // Header
  sections.push(`# ${id} — ${title}\n`);

  // Purpose
  sections.push(`## Purpose\n\n${purpose ?? "_No purpose defined._"}\n`);

  // Dependencies
  const deps = Array.isArray(dependencies) && dependencies.length > 0
    ? dependencies.map((d) => `- \`${d}\``).join("\n")
    : "_None — this is the root layer._";
  sections.push(`## Dependencies\n\n${deps}\n`);

  // Main User Flow
  sections.push(`## Main User Flow\n\n${mainFlow ?? "_No flow defined._"}\n`);

  // Files Involved
  sections.push(`## Files Involved\n\n${files.map((f) => `- \`${f}\``).join("\n")}\n`);

  // Source Code — one fenced block per file
  const sourceBlocks = [];

  for (const relPath of files) {
    const absPath = path.join(ROOT, relPath);

    if (!fs.existsSync(absPath)) {
      console.warn(`  ⚠️   [${id}] File not found, skipping: ${relPath}`);
      sourceBlocks.push(`### \`${relPath}\`\n\n> ⚠️ File not found in repository.\n`);
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8").trimEnd();
    const lang = langHint(relPath);

    sourceBlocks.push(
      `### \`${relPath}\`\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`
    );
  }

  sections.push(`## Source Code\n\n${sourceBlocks.join("\n")}`);

  // Write the pack file
  const outputPath = path.join(PACKS_DIR, `${id}.md`);
  fs.writeFileSync(outputPath, sections.join("\n"), "utf-8");

  console.log(`✅  Generated: packs/${id}.md  (${files.length} files)`);
  generated++;
}

console.log(`\n🎉  Done. ${generated} packs generated, ${errors} errors.\n`);
