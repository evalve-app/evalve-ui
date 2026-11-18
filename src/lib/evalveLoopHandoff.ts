// The handoff prompt of the New Loop page. The coding agent starts the Loop
// with the Evalve MCP, and the Evalve backend owns the Loop rules, so the
// handoff prompt has no rules.

// The Loop parameters that a person selects on the New Loop page, with the
// field names of the Loop API. The coding agent finds the other fields of
// `evalve_loop_start` in the agent project. The handoff prompt names the
// `control_*` fields too: the backend refuses a start with no cost estimate
// when the cohort has no recorded cost.
export type LoopParameters = {
  name: string;
  hypothesis?: string;
  cohort_version_id: string;
  evaluators: { ref: string }[]; // each `name@version`
  allowed_changes: ("system_prompt" | "model")[];
  required_consecutive_greens: number;
  max_runs: number;
  budget_usd: string; // a decimal string, as the backend sends money
};

// - `dashboardOrigin`: the Evalve backend is at `/evalve` on the origin of the dashboard.
// - `backendVersion`: `version` of `GET /evalve/health`. The Evalve MCP has a Git tag for each backend version.
export function buildEvalveLoopPrompt({ dashboardOrigin, backendVersion }: { dashboardOrigin: string; backendVersion: string }, parameters: LoopParameters): string {
  const server = new URL("/evalve", dashboardOrigin).href;
  return [
    "Run this Evalve Loop from the root of the agent project. Use only the `evalve_*` tools of the Evalve MCP to run it.",
    "",
    "Loop parameters",
    "",
    "```json",
    JSON.stringify(parameters, null, 2),
    "```",
    "",
    "Find `tool_policy`, the `params` and `connection_id` of each evaluator, `allowed_models`, `agent_version`, `control_model` and `control_estimate_usd` in this project. Ask me when one is missing or not clear.",
    "",
    "Call `evalve_loop_start` with these parameters and the values that you found. Then follow the tool descriptions: call `evalve_loop_status` each minute, and send a change with `evalve_loop_propose_experiment` when the next action is `needs_change`. When the Loop ends, report the outcome and the winning change.",
    "",
    "If the `evalve_*` tools are missing, stop and tell me to run these two commands in this project. Then I set `KITARU_API_KEY` and start you again.",
    "",
    "```sh",
    `uv add "evalve-mcp @ git+https://github.com/evalve-app/evalve-backend@v${backendVersion}#subdirectory=evalve-mcp"`,
    `uv run evalve-mcp setup --server ${server}`,
    "```",
  ].join("\n");
}
