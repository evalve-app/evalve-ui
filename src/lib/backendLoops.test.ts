import { describe, expect, it } from "vitest";
import type { LoopDetail, LoopListItem } from "../api/evalve";
import { backendExperiments, backendSetup, detailOutcome, gatingEvaluatorNames, listItemOutcome, loopEndedAt, loopListRows, loopPollInterval, ownerLabel, spendText } from "./backendLoops";
import type { SkillLoopRow } from "./loops";

const item = (over: Partial<LoopListItem> = {}): LoopListItem => ({
  loop_id: "01JD8",
  name: "Refunds",
  slug: "refunds",
  agent_id: "agent",
  owner_account_id: "8f2c41d0-aaaa-bbbb-cccc-000000000000",
  status: "running",
  outcome: null,
  reason: null,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
  hypothesis: "Refunds fail on day 30.",
  experiments: 3,
  spend: { recorded_usd: "1.2", accounted_usd: "1.2", budget_usd: "5" },
  next_action: "replay",
  ...over,
});

const setup = {
  name: "Refunds",
  cohort_version_id: "cv",
  agent_version: null,
  allow_live_tools: false,
  allowed_changes: ["system_prompt"],
  allowed_models: [],
  budget_usd: "5.00",
  evaluators: [{ ref: "action-correct@3" }, { ref: "tone@1" }],
  max_runs: 10,
  required_consecutive_greens: 2,
  tool_policy: {},
} as unknown as LoopDetail["setup"];

describe("polling a backend Loop", () => {
  it("polls every 4 seconds while a Loop runs, and stops at an end state", () => {
    expect(loopPollInterval(["completed", "running"])).toBe(4000);
    expect(loopPollInterval(["completed", "failed", "cancelled"])).toBe(false);
    expect(loopPollInterval([])).toBe(false);
  });
});

describe("the outcome of a backend Loop", () => {
  it("takes the passing Experiment of the list from the count of Experiments", () => {
    expect(listItemOutcome(item({ status: "completed", outcome: "passed", experiments: 3, next_action: null }))).toMatchObject({ title: "Experiment 2 passed", winnerLap: 2 });
  });

  it("shows Waits for a change in the list, with no idle deadline", () => {
    expect(listItemOutcome(item({ next_action: "needs_change" }))).toEqual({ kind: "running", title: "Waits for a change", idleDeadline: null });
  });

  it("takes the winning Experiment and the idle deadline from the Loop detail", () => {
    const base = { ...item(), setup, runs: { used: 2, max: 10 }, experiments: [], next: null, needs: null, winner: null } as unknown as LoopDetail;
    expect(detailOutcome({ ...base, status: "completed", outcome: "passed", winner: { experiment: 1, experiment_id: "e1", override: {}, change: "x" } })).toMatchObject({ title: "Experiment 1 passed", winnerLap: 1 });
    const waiting = { ...base, next: { action: "needs_change" }, needs: { idle_deadline: "2026-11-03T10:00:00Z" } } as unknown as LoopDetail;
    expect(detailOutcome(waiting)).toEqual({ kind: "running", title: "Waits for a change", idleDeadline: "2026-11-03T10:00:00Z" });
  });
});

describe("the end time of a backend Loop", () => {
  it.each(["completed", "cancelled", "failed"] as const)("is the time of the last update for a Loop with the status %s", (status) => {
    expect(loopEndedAt({ status, updated_at: "2026-11-18T14:58:00Z" })).toBe("2026-11-18T14:58:00Z");
  });

  it("is null while the Loop runs", () => {
    expect(loopEndedAt({ status: "running", updated_at: "2026-11-18T14:58:00Z" })).toBeNull();
  });
});

describe("the name of the Loop owner", () => {
  const owner = "8f2c41d0-aaaa-bbbb-cccc-000000000000";

  it("says You for the viewer's own Loop", () => {
    expect(ownerLabel(owner, owner, "Jack")).toBe("You");
  });

  it("shows the account name from Kitaru", () => {
    expect(ownerLabel(owner, "someone-else", "Alyssa")).toBe("Alyssa");
  });

  it("shows the first 8 characters of the account id with no name", () => {
    expect(ownerLabel(owner, "someone-else", null)).toBe("8f2c41d0");
    expect(ownerLabel(owner, undefined, undefined)).toBe("8f2c41d0");
  });
});

describe("the rows of the Loop list", () => {
  const skill: SkillLoopRow = { slug: "greeting", hypothesis: "", experimentsTried: 1, outcome: { kind: "no_result" }, updatedAt: "2026-11-03T10:00:00Z" };

  it("mixes the backend Loops and the Skill Loops, newest first", () => {
    const rows = loopListRows([item({ loop_id: "old", updated_at: "2026-11-01T10:00:00Z" }), item({ loop_id: "new", updated_at: "2026-11-04T10:00:00Z" })], [skill], false);
    expect(rows.map((r) => r.key)).toEqual(["loop:new", "skill:greeting", "loop:old"]);
  });

  it("counts the Experiments tried without the Control Experiment, and shows the spend of the budget", () => {
    const [row] = loopListRows([item({ experiments: 3 })], [], false);
    expect(row).toMatchObject({ kind: "backend", experimentsTried: 2, spend: "$1.20 of $5.00" });
  });

  it("hides the Skill Loops for Only my Loops", () => {
    expect(loopListRows([item()], [skill], true).map((r) => r.kind)).toEqual(["backend"]);
  });
});

describe("the setup of a backend Loop", () => {
  it("fills the setup card from the backend setup", () => {
    expect(backendSetup(setup)).toEqual({
      name: "Refunds", cohortVersionId: "cv", agentVersionId: null, evaluators: ["action-correct@3", "tone@1"],
      allowedChanges: ["system_prompt"], allowedModels: [], requiredGreens: 2, maxAttempts: 10, budgetUsd: "5.00",
    });
  });

  it("names the gating evaluators without their versions", () => {
    expect(gatingEvaluatorNames(setup)).toEqual(["action-correct", "tone"]);
  });
});

describe("the spend of a Loop", () => {
  it("shows the recorded spend of the budget", () => {
    expect(spendText({ recorded_usd: "0", accounted_usd: "0", budget_usd: "2.5" })).toBe("$0 of $2.50");
  });
});

describe("the Experiments of a backend Loop, for the Results table", () => {
  type Summary = LoopDetail["experiments"][number];
  type Result = NonNullable<Summary["runs"][number]["result"]>;
  const result = (over: Partial<Result> = {}): Result => ({
    run_id: "run-1",
    run_status: "completed",
    outcome: "green",
    passed: 20,
    failed: 0,
    unscored: 0,
    missing_session_ids: [],
    recorded_cost_usd: "0.4",
    cost_incomplete: false,
    run_error: null,
    ...over,
  });
  const runOf = (number: number, r: Result | null) => ({ number, run_id: r?.run_id ?? null, result: r, agent_version_id: "av", cohort_version_id: "cv", collected_at: null, estimated_cost_usd: "0.4", submit_started_at: "2026-11-01T10:00:00Z" });
  const experiment = (over: Partial<Summary> = {}): Summary => ({ number: 1, name: "evalve-01JD8-exp-1", experiment_id: "exp-1", override: { system_prompt: "Refund in full." }, change: "Refund in full after day 30.", runs: [], ...over });

  it("names the kind of the override and keeps the reason for the change", () => {
    const [e] = backendExperiments([experiment()]);
    expect(e).toMatchObject({ number: 1, experimentId: "exp-1", kind: "System prompt", kindTitle: null, change: "Refund in full after day 30." });
  });

  it("gives a Model override the model name as a tooltip", () => {
    expect(backendExperiments([experiment({ override: { model: "claude-sonnet-5-5" } })])[0]).toMatchObject({ kind: "Model", kindTitle: "claude-sonnet-5-5" });
  });

  it("gives the Control Experiment no kind, and the text of a replay with no changes", () => {
    expect(backendExperiments([experiment({ number: 0, override: {}, change: "" })])[0]).toMatchObject({ kind: null, kindTitle: null, change: "Replay with no changes" });
  });

  it("keeps an Experiment that has no Kitaru experiment yet, and puts the Experiments in number order", () => {
    const list = backendExperiments([experiment({ number: 2, experiment_id: null }), experiment({ number: 0, override: {} })]);
    expect(list.map((e) => [e.number, e.experimentId])).toEqual([[0, "exp-1"], [2, null]]);
  });

  it("shows a green Run as Green", () => {
    const run = backendExperiments([experiment({ runs: [runOf(1, result())] })])[0].runs[0];
    expect(run).toMatchObject({ runId: "run-1", number: 1, status: "completed", detail: null, verdict: { label: "Green", tone: "success" } });
  });

  it("shows a red Run with the count of failed cases", () => {
    const run = backendExperiments([experiment({ runs: [runOf(1, result({ outcome: "red", passed: 17, failed: 3 }))] })])[0].runs[0];
    expect(run.verdict).toEqual({ label: "Red · 3 of 20 failed", tone: "destructive", title: "3 of 20 cases failed a gating evaluator in this Run" });
  });

  it("shows the run error of an incomplete Run", () => {
    const run = backendExperiments([experiment({ runs: [runOf(1, result({ outcome: "incomplete", run_error: "The replay timed out." }))] })])[0].runs[0];
    expect(run).toMatchObject({ detail: "The replay timed out.", verdict: { label: "Incomplete", tone: "warning", title: "The replay timed out." } });
  });

  it("says how many cases have no score when an incomplete Run has no run error", () => {
    const one = backendExperiments([experiment({ runs: [runOf(1, result({ outcome: "incomplete", unscored: 1 }))] })])[0].runs[0];
    const two = backendExperiments([experiment({ runs: [runOf(1, result({ outcome: "incomplete", unscored: 2 }))] })])[0].runs[0];
    const none = backendExperiments([experiment({ runs: [runOf(1, result({ outcome: "incomplete" }))] })])[0].runs[0];
    expect([one.detail, two.detail, none.detail]).toEqual(["1 case has no score", "2 cases have no score", null]);
  });

  it("shows a Run with no result yet as Running", () => {
    const run = backendExperiments([experiment({ runs: [runOf(1, null)] })])[0].runs[0];
    expect(run).toMatchObject({ runId: null, status: null, detail: null, verdict: { label: "Running", tone: "neutral" } });
  });
});
