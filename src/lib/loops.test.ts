import { describe, expect, it } from "vitest";
import type { Experiment } from "../api/client";
import { experimentName, lapSummary, parseEvalveLoop, parseRoundName, parseSettings, skillLoopOutcome, skillLoopRows } from "./loops";

describe("parseRoundName", () => {
  it("reads round and lap names as the lap number", () => {
    expect(parseRoundName("day-30-refunds-round-0")).toEqual({ slug: "day-30-refunds", lap: 0 });
    expect(parseRoundName("day-30-refunds-lap-2")).toEqual({ slug: "day-30-refunds", lap: 2 });
  });

  it("reads iteration names from 1, so iteration 1 is the baseline lap", () => {
    expect(parseRoundName("support-desk-demo-iteration-1")).toEqual({ slug: "support-desk-demo", lap: 0 });
    expect(parseRoundName("support-desk-demo-iteration-2")).toEqual({ slug: "support-desk-demo", lap: 1 });
  });

  it("ignores names that are not part of a loop", () => {
    expect(parseRoundName("support-desk-demo-iteration-0")).toBeNull();
    expect(parseRoundName("refund prompt test")).toBeNull();
  });
});

describe("experimentName", () => {
  it("names an experiment after the control experiment by its number", () => {
    expect(experimentName(2)).toBe("Experiment 2");
    expect(experimentName(2, "inline")).toBe("experiment 2");
    expect(experimentName(2, "short")).toBe("2");
  });

  it("gives number 0 the name of the control experiment, and no number", () => {
    expect(experimentName(0)).toBe("Control experiment");
    expect(experimentName(0, "inline")).toBe("the control experiment");
    expect(experimentName(0, "short")).toBe("Control");
  });
});

describe("lapSummary", () => {
  it("drops a leading 'Iteration N:' as it drops 'Round N:'", () => {
    expect(lapSummary("Iteration 2: Tighten the refund policy. Hypothesis: fewer late-fee refunds", 1)).toBe("Tighten the refund policy.");
    expect(lapSummary("Round 2: Use gpt-4.1. Hypothesis: better", 2)).toBe("Use gpt-4.1.");
  });

  it("says that lap 0 is the control experiment, whatever its description says", () => {
    expect(lapSummary("Round 0: Unchanged baseline", 0)).toBe("Replay with no changes");
    expect(lapSummary(null, 0)).toBe("Replay with no changes");
  });
});

describe("the outcome of a Skill Loop", () => {
  const baseline = 'Round 0: Unchanged baseline\nEvalve loop: {"schema_version":1,"loop_id":"loop-id","lap":0,"required_consecutive_greens":2}';
  const read = (result: Record<string, unknown>) => parseEvalveLoop(
    `${baseline}\nEvalve result: ${JSON.stringify({ schema_version: 1, loop_id: "loop-id", ...result })}`,
  );

  it("shows Completed with the published winning experiment", () => {
    expect(skillLoopOutcome(read({ status: "stop_success", winner_lap: 1 }))).toEqual({
      kind: "completed", passed: true, winnerLap: 1, title: "Experiment 1 passed",
      detail: "Every case passed in 2 consecutive runs.",
    });
  });

  it("says that the control passed when lap zero is the winning experiment", () => {
    expect(skillLoopOutcome(read({ status: "stop_success", winner_lap: 0 }))).toEqual({
      kind: "completed", passed: true, winnerLap: 0, title: "The control passed",
      detail: "The agent met the target with no change.",
    });
  });

  it.each(["stop_attempt_cap", "stop_budget"])("completes without a winning experiment on %s", (status) => {
    expect(skillLoopOutcome(read({ status, reason: "The configured limit was reached." }))).toMatchObject({
      kind: "completed", passed: false, winnerLap: null, title: "No experiment passed", detail: "The configured limit was reached.",
    });
  });

  it("shows No result with no published end state", () => {
    expect(skillLoopOutcome(read({ status: "running" }))).toEqual({ kind: "no_result" });
    expect(skillLoopOutcome(parseEvalveLoop(baseline))).toEqual({ kind: "no_result" });
    // A Loop of the kitaru-loop skill, which publishes no result.
    expect(skillLoopOutcome(null)).toEqual({ kind: "no_result" });
  });

  it("ignores malformed results and results for a different loop", () => {
    expect(read({ status: "stop_success", winner_lap: 1, loop_id: "other" })?.result).toBeNull();
    expect(read({ status: "stop_success", winner_lap: null })?.result).toBeNull();
    expect(parseEvalveLoop(`${baseline}\nEvalve result: {bad json}`)?.result).toBeNull();
  });
});

describe("the setup of a loop in the loop settings line", () => {
  // The line as `description` in the runner's loop.py writes it on the control experiment.
  const line = {
    schema_version: 1, loop_id: "loop-id", lap: 0,
    name: "Day-30 refunds", cohort_version_id: "cohort-version-id", required_consecutive_greens: 2, max_attempts: 10,
    budget_usd: "5.00", allowed_changes: ["system_prompt", "model"], allowed_models: ["gpt-4.1"],
    agent_version_id: "agent-version-id", evaluators: ["refund-policy@3", "kitaru/tool-error@1"],
  };
  const read = (settings: Record<string, unknown>) => parseEvalveLoop(`Round 0: Unchanged baseline\nEvalve loop: ${JSON.stringify(settings)}`);

  it("returns each setup field that the runner writes for a new loop", () => {
    expect(read(line)?.setup).toEqual({
      name: "Day-30 refunds",
      cohortVersionId: "cohort-version-id",
      agentVersionId: "agent-version-id",
      evaluators: ["refund-policy@3", "kitaru/tool-error@1"],
      allowedChanges: ["system_prompt", "model"],
      allowedModels: ["gpt-4.1"],
      requiredGreens: 2,
      maxAttempts: 10,
      budgetUsd: "5.00",
    });
  });

  it("gives null for a field that the line does not carry, or carries in a different shape", () => {
    const { name: _name, budget_usd: _budget, ...rest } = line;
    expect(read({ ...rest, evaluators: [{ evaluator: "refund-policy", version: 3 }], max_attempts: "10" })?.setup).toEqual({
      name: null,
      cohortVersionId: "cohort-version-id",
      agentVersionId: "agent-version-id",
      evaluators: null,
      allowedChanges: ["system_prompt", "model"],
      allowedModels: ["gpt-4.1"],
      requiredGreens: 2,
      maxAttempts: null,
      budgetUsd: null,
    });
  });

  it("reads no setup from a loop that the old skill made", () => {
    const old = 'Round 0: Unchanged baseline Hypothesis: the window is read as exclusive\nLoop settings: {"name":"Day-30 refunds","criteria":{"trials_per_round":5,"k":3,"max_rounds":4,"budget_usd":1},"allowed_changes":["system_prompt"],"allowed_models":[],"gate_evaluators":["support-desk-action-correct"]}';
    expect(parseEvalveLoop(old)).toBeNull();
    expect(parseSettings(old)).toMatchObject({ name: "Day-30 refunds", allowed_changes: ["system_prompt"], gate_evaluators: ["support-desk-action-correct"], criteria: { budget_usd: 1, max_rounds: 4 } });
  });
});

describe("the rows of the Skill Loops in the Loop list", () => {
  const experiment = (name: string, created: string, description: string | null = null) => ({ id: name, name, created, description }) as unknown as Experiment;

  it("makes one row for each Skill Loop, newest first", () => {
    const rows = skillLoopRows([
      experiment("refunds-round-0", "2026-11-01T10:00:00Z", "Hypothesis: Refunds fail on day 30."),
      experiment("refunds-round-1", "2026-11-03T10:00:00Z"),
      experiment("greeting-round-0", "2026-11-02T10:00:00Z"),
      experiment("not-a-loop", "2026-11-05T10:00:00Z"),
    ]);
    expect(rows.map((r) => r.slug)).toEqual(["refunds", "greeting"]);
    expect(rows[0]).toEqual({ slug: "refunds", hypothesis: "Refunds fail on day 30.", experimentsTried: 1, outcome: { kind: "no_result" }, updatedAt: "2026-11-03T10:00:00Z" });
  });

  it("shows Completed for a Skill Loop with a published end state", () => {
    const control = 'Evalve loop: {"schema_version":1,"loop_id":"id","lap":0,"required_consecutive_greens":1}\nEvalve result: {"schema_version":1,"loop_id":"id","status":"stop_budget","reason":null}';
    expect(skillLoopRows([experiment("budget-round-0", "2026-11-01T10:00:00Z", control)])[0].outcome).toMatchObject({ kind: "completed", passed: false });
  });

  it("does not take an Experiment of a backend Loop for a Skill Loop", () => {
    expect(skillLoopRows([experiment("evalve-01JD8-exp-0", "2026-11-01T10:00:00Z"), experiment("evalve-01JD8-exp-1", "2026-11-02T10:00:00Z")])).toEqual([]);
  });
});
