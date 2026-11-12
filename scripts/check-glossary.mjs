// Fails when the source gets more uses of a word that GLOSSARY.md tells us to avoid.
//
// The source already holds some of these words (older names, and text that only
// the Post-MVP view shows). scripts/glossary-baseline.json records how many
// times each file uses each word. A count that goes up fails the check.
//
//   node scripts/check-glossary.mjs            check against the baseline
//   node scripts/check-glossary.mjs --update   write the baseline again
//
// Use --update when a count goes down, or when a new use is correct (for
// example "iteration" in the name of a server experiment). Say why in the PR.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The "Avoid" words of GLOSSARY.md that have no other meaning in code.
// Words such as "test", "client", and "metric" are not here: code uses them
// for other things, so a search cannot judge them. The review judges those.
const AVOID = [
  "winner",
  "regression",
  "regressed",
  "baseline audit",
  "baseline session",
  "original session",
  "rerun",
  "re-run",
  "round 0",
  "iteration",
  "trial",
  "dataset",
  "test set",
  "snapshot",
  "judge",
  "grader",
  "gate evaluator",
  "scoring evaluator",
];

const root = fileURLToPath(new URL("..", import.meta.url));
const baselinePath = join(root, "scripts/glossary-baseline.json");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    // Generated from the server schema, so its words are the server's words.
    if (entry.name === "schema.d.ts") return [];
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

// Makes a code name read as its words, so that "baselineSession",
// "baseline_session", and "baseline-session" all match "baseline session".
function words(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

const counts = {};
for (const file of sourceFiles(join(root, "src")).sort()) {
  const text = words(readFileSync(file, "utf8"));
  // Forward slashes on each system, so that the baseline is the same on Windows.
  const key = relative(root, file).replace(/\\/g, "/");
  for (const word of AVOID) {
    const n = text.split(words(word)).length - 1;
    if (n > 0) (counts[key] ??= {})[word] = n;
  }
}

if (process.argv.includes("--update")) {
  writeFileSync(baselinePath, JSON.stringify(counts, null, 2) + "\n");
  console.log("Wrote scripts/glossary-baseline.json.");
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const more = [];
let fewer = false;
for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
  for (const word of AVOID) {
    const now = counts[file]?.[word] ?? 0;
    const was = baseline[file]?.[word] ?? 0;
    if (now > was) more.push(`  ${file}: "${word}" ${was} -> ${now}`);
    if (now < was) fewer = true;
  }
}

if (more.length) {
  console.error("GLOSSARY.md tells us to avoid these words, and the source uses them more than before:");
  console.error(more.join("\n"));
  console.error('Use the glossary word. If the new use is correct, run "node scripts/check-glossary.mjs --update".');
  process.exit(1);
}
if (fewer) console.log('Some counts went down. Run "node scripts/check-glossary.mjs --update" to record that.');
