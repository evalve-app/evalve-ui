import { describe, expect, it } from "vitest";
import { backendLoopOutcome, loopOutcomeText, loopStatusLabel, type BackendLoopFacts } from "./loopStatus";

const facts = (over: Partial<BackendLoopFacts>): BackendLoopFacts => ({
  status: "running",
  outcome: null,
  reason: null,
  nextAction: null,
  idleDeadline: null,
  passingExperiment: null,
  requiredGreens: 2,
  ...over,
});

// The badge and the outcome text of a backend Loop, for each row of the table in sc-273.
const shown = (over: Partial<BackendLoopFacts>) => {
  const outcome = backendLoopOutcome(facts(over));
  return { ...loopStatusLabel(outcome), text: loopOutcomeText(outcome) };
};

describe("the status and the outcome of a backend Loop", () => {
  it.each(["start_control", "resume_start", "replay", "retry"] as const)("shows Running with Waits for the coding agent for %s", (nextAction) => {
    expect(shown({ status: "running", nextAction })).toEqual({ status: "Running", tone: "warning", text: "Waits for the coding agent" });
  });

  it("shows Running with no outcome text while a Run is in flight", () => {
    expect(shown({ status: "running", nextAction: "collect" })).toEqual({ status: "Running", tone: "warning", text: null });
  });

  it("shows Running with Waits for a change, and keeps the idle deadline for the Loop page", () => {
    const outcome = backendLoopOutcome(facts({ nextAction: "needs_change", idleDeadline: "2026-11-19T10:00:00Z" }));
    expect(outcome).toEqual({ kind: "running", title: "Waits for a change", idleDeadline: "2026-11-19T10:00:00Z" });
    expect(loopStatusLabel(outcome)).toEqual({ status: "Running", tone: "warning" });
  });

  it("names the Experiment that passed", () => {
    expect(shown({ status: "completed", outcome: "passed", passingExperiment: 3 })).toEqual({ status: "Completed", tone: "success", text: "Experiment 3 passed" });
    expect(backendLoopOutcome(facts({ status: "completed", outcome: "passed", passingExperiment: 3 }))).toMatchObject({ passed: true, winnerLap: 3, detail: "Every case passed in 2 consecutive runs." });
  });

  it("says that the control passed", () => {
    expect(shown({ status: "completed", outcome: "already_passing" })).toEqual({ status: "Completed", tone: "success", text: "The control passed" });
    expect(backendLoopOutcome(facts({ status: "completed", outcome: "already_passing" }))).toMatchObject({ passed: true, winnerLap: 0 });
  });

  it.each([
    ["max_runs", "Run limit reached"],
    ["budget_reached", "Budget reached"],
    ["stopped_idle", "Wait limit reached"],
  ] as const)("shows Completed in the muted tone for %s", (outcome, text) => {
    expect(shown({ status: "completed", outcome })).toEqual({ status: "Completed", tone: "muted", text });
    expect(backendLoopOutcome(facts({ status: "completed", outcome }))).toMatchObject({ passed: false, winnerLap: null });
  });

  it("shows Canceled by the Loop owner", () => {
    expect(shown({ status: "cancelled", outcome: "stopped_by_user" })).toEqual({ status: "Canceled", tone: "muted", text: "Canceled by the Loop owner" });
  });

  it("shows Failed with the reason of the backend", () => {
    expect(shown({ status: "failed", outcome: "error", reason: "Kitaru refused the replay." })).toEqual({ status: "Failed", tone: "destructive", text: "Kitaru refused the replay." });
    expect(shown({ status: "failed", outcome: "error" })).toEqual({ status: "Failed", tone: "destructive", text: null });
  });

  it("says that an experiment passed when the backend names no passing Experiment", () => {
    expect(shown({ status: "completed", outcome: "passed" }).text).toBe("An experiment passed");
  });

  it("never shows Stopped", () => {
    const statuses = (["running", "completed", "failed", "cancelled"] as const).map((status) => shown({ status, outcome: status === "completed" ? "max_runs" : null }).status);
    expect(statuses).not.toContain("Stopped");
  });
});

describe("the badge of a Skill Loop with no result", () => {
  it("shows No result in the muted tone, with no outcome text", () => {
    expect(loopStatusLabel({ kind: "no_result" })).toEqual({ status: "No result", tone: "muted" });
    expect(loopOutcomeText({ kind: "no_result" })).toBeNull();
  });
});
