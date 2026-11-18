import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEvalveLoopPrompt, type LoopParameters } from "./evalveLoopHandoff";
import release from "./evalveLoopRelease.json";

// The hosted files of the retired runner stay until sc-256 removes them. The handoff prompt does not name them.
it("ships each public file at the checksum of the release", () => {
  expect(Object.keys(release.files)).toEqual(["SKILL.md", "references/handoff.md", "scripts/loop.py"]);
  for (const [name, checksum] of Object.entries(release.files)) {
    const file = readFileSync(new URL(`../../public/skills/evalve-loop/${release.version}/${name}`, import.meta.url));
    expect(createHash("sha256").update(file).digest("hex")).toBe(checksum);
  }
});

describe("buildEvalveLoopPrompt", () => {
  const parameters: LoopParameters = {
    name: "Refund policy pilot",
    hypothesis: "The agent reads the 30-day window as exclusive.",
    cohort_version_id: "00000000-0000-4000-8000-000000000001",
    evaluators: [{ ref: "refund_policy@3" }],
    allowed_changes: ["system_prompt", "model"],
    required_consecutive_greens: 2,
    max_runs: 7,
    budget_usd: "1.25",
  };
  const prompt = buildEvalveLoopPrompt({ dashboardOrigin: "https://dashboard.example.com", backendVersion: "0.2.2" }, parameters);
  const block = (language: string) => prompt.split("```" + language + "\n")[1]?.split("\n```")[0];

  it("carries the Loop parameters as one JSON block with the field names of the Loop API", () => {
    expect(JSON.parse(block("json") ?? "null")).toEqual(parameters);
    expect(prompt.match(/```json/g)).toHaveLength(1);
    expect(prompt).toContain('"max_runs": 7');
    expect(prompt).not.toContain("max_attempts");
  });

  it("leaves out the fields that the coding agent finds in the agent project", () => {
    const sent = Object.keys(JSON.parse(block("json") ?? "{}"));
    expect(sent).toEqual(["name", "hypothesis", "cohort_version_id", "evaluators", "allowed_changes", "required_consecutive_greens", "max_runs", "budget_usd"]);
    expect(prompt).toContain("Find `tool_policy`, the `params` and `connection_id` of each evaluator, `allowed_models`, `agent_version`, `control_model` and `control_estimate_usd` in this project.");
    expect(prompt).not.toContain("allow_live_tools");
  });

  it("tells the coding agent to run the Loop with the tools of the Evalve MCP only", () => {
    expect(prompt).toContain("Use only the `evalve_*` tools");
    for (const tool of ["evalve_loop_start", "evalve_loop_status", "evalve_loop_propose_experiment"]) expect(prompt).toContain(tool);
    expect(prompt).toContain("report the outcome and the winning change");
  });

  it("has the install fallback, with the backend version and the backend URL of the dashboard", () => {
    expect(block("sh")).toBe(
      [
        'uv add "evalve-mcp @ git+https://github.com/evalve-app/evalve-backend@v0.2.2#subdirectory=evalve-mcp"',
        "uv run evalve-mcp setup --server https://dashboard.example.com/evalve",
      ].join("\n"),
    );
    expect(prompt).toContain("If the `evalve_*` tools are missing, stop");
    expect(prompt).toContain("`KITARU_API_KEY`");
  });

  it("has no Loop rules, no download of the hosted runner and no Kitaru server URL", () => {
    for (const absent of ["green", "consecutive green", "retry", "loop.py", "skills/evalve-loop", "sha256", "SKILL.md", "server_url", "urlopen", "python3"]) {
      expect(prompt.replace('"required_consecutive_greens"', "")).not.toContain(absent);
    }
  });

  it("leaves out an absent hypothesis", () => {
    const { hypothesis: _absent, ...rest } = parameters;
    const short = buildEvalveLoopPrompt({ dashboardOrigin: "http://localhost:5173", backendVersion: "0.2.1" }, rest);
    expect(short).not.toContain("hypothesis");
    expect(short).toContain("--server http://localhost:5173/evalve");
    expect(short).toContain("@v0.2.1#");
  });
});
