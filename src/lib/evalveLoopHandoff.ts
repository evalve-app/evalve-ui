import release from "./evalveLoopRelease.json";
import { slugify } from "./loops";

type EvalveLoopHandoff = {
  name: string;
  hypothesis?: string;
  server_url: string;
  cohort_version_id: string;
  evaluators: { ref: string }[];
  allowed_changes: ("system_prompt" | "model")[];
  required_consecutive_greens: number;
  max_attempts: number;
  budget_usd: string;
};

export function buildEvalveLoopPrompt(dashboardOrigin: string, config: EvalveLoopHandoff): string {
  const url = new URL(`/skills/evalve-loop/${release.version}/`, dashboardOrigin).href;
  const loopDir = `sessions/evalve-loop/${slugify(config.name)}`;
  const releaseDir = `${loopDir}/release-${release.version}`;
  const configPath = `${loopDir}/evalve-loop.json`;
  const required = config.required_consecutive_greens;
  const replays = required === 1 ? "replay" : "replays";
  return [
    "Run this Evalve MVP loop from the agent project root. Use the pinned release below.",
    "",
    "Fetch these files with this command and verify each SHA-256 before using the release.",
    "",
    "```sh",
    "python3 - <<'PY'",
    "from hashlib import sha256",
    "from pathlib import Path",
    "from urllib.request import urlopen",
    "",
    `url = ${JSON.stringify(url)}`,
    `root = Path(${JSON.stringify(releaseDir)})`,
    `files = ${JSON.stringify(release.files)}`,
    "for name, checksum in files.items():",
    "    path = root / name",
    "    if path.is_file() and sha256(path.read_bytes()).hexdigest() == checksum:",
    "        continue",
    "    with urlopen(url + name, timeout=30) as response:",
    "        data = response.read()",
    "    if sha256(data).hexdigest() != checksum:",
    "        raise SystemExit(f'Checksum mismatch for {name}')",
    "    path.parent.mkdir(parents=True, exist_ok=True)",
    "    path.write_bytes(data)",
    "PY",
    "```",
    "",
    `Read ${releaseDir}/SKILL.md and follow it. Resolve the replay tool policy, evaluator parameters, and any allowed models from this project and its replay worker. Ask me about missing or ambiguous prerequisites.`,
    `Save the resolved config as ${configPath}. If it already exists, check that it matches this handoff before resuming the same loop.`,
    `Use python3 ${releaseDir}/scripts/loop.py --project-root . --config ${configPath} for preflight and every subsequent command.`,
    "",
    `Complete ${required} fully scored baseline ${replays}. A replay is green when every session passes every selected evaluator. A lap wins with ${required} consecutive green ${replays}.`,
    "Report the winning change and the replay counts when the loop finishes.",
    "",
    "Loop settings",
    "",
    "```json",
    JSON.stringify(config, null, 2),
    "```",
  ].join("\n");
}
