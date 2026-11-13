import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [skillDir, version] = process.argv.slice(2);
if (!skillDir || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/package-loop-release.mjs PATH_TO_EVALVE_LOOP MAJOR.MINOR.PATCH");
}

const repo = fileURLToPath(new URL("..", import.meta.url));
const releases = join(repo, "public/skills/evalve-loop");
const output = join(releases, version);
const names = ["SKILL.md", "references/handoff.md", "scripts/loop.py"];
const files = names.map((name) => [name, readFileSync(resolve(skillDir, name))]);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

mkdirSync(releases, { recursive: true });
if (existsSync(output)) {
  for (const [name, data] of files) {
    if (!readFileSync(join(output, name)).equals(data)) {
      throw new Error(`Evalve Loop ${version} is already packaged with different contents. Use a new version.`);
    }
  }
} else {
  const staging = mkdtempSync(join(releases, ".staging-"));
  try {
    for (const [name, data] of files) {
      const path = join(staging, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    }
    renameSync(staging, output);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const manifest = { version, files: Object.fromEntries(files.map(([name, data]) => [name, sha256(data)])) };
writeFileSync(join(repo, "src/lib/evalveLoopRelease.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Packaged Evalve Loop ${version}`);
