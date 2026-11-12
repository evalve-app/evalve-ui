import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildEvalveLoopPrompt } from "./evalveLoopHandoff";
import release from "./evalveLoopRelease.json";

it("ships each public file at the checksum pinned by the prompt", () => {
  expect(Object.keys(release.files)).toEqual(["SKILL.md", "references/handoff.md", "scripts/loop.py"]);
  for (const [name, checksum] of Object.entries(release.files)) {
    const file = readFileSync(new URL(`../../public/skills/evalve-loop/${release.version}/${name}`, import.meta.url));
    expect(createHash("sha256").update(file).digest("hex")).toBe(checksum);
  }
});

it("pins the release and Kitaru server and keeps each loop's config with its evidence", () => {
  const config = {
    name: "Refund policy pilot",
    server_url: "https://kitaru.example.com",
    cohort_version_id: "00000000-0000-4000-8000-000000000001",
    evaluators: [{ ref: "refund_policy@3" }],
    allowed_changes: ["model" as const],
    required_consecutive_greens: 2,
    max_attempts: 7,
    budget_usd: "1.25",
  };
  const prompt = buildEvalveLoopPrompt("https://dashboard.example.com", config);
  expect(prompt).toContain(`https://dashboard.example.com/skills/evalve-loop/${release.version}/`);
  expect(prompt).toContain("--project-root . --config sessions/evalve-loop/refund-policy-pilot/evalve-loop.json");
  expect(prompt).toContain("Complete 2 fully scored baseline replays.");
  expect(prompt).toContain("sha256(data).hexdigest() != checksum");
  expect(prompt).toContain(JSON.stringify(release.files));
  const settings = prompt.split("```json\n")[1]?.split("\n```")[0];
  expect(JSON.parse(settings ?? "null")).toEqual(config);
});
