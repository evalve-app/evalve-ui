import { describe, expect, it } from "vitest";
import { experimentName, knownLegacyLoop, lapSummary, parseEvalveLoop, parseRoundName, resolveLoopOutcome, shouldPollLoopRuns } from "./loops";

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
    expect(lapSummary("Round 0: Unchanged baseline", 0)).toBe("Control experiment, no changes");
    expect(lapSummary(null, 0)).toBe("Control experiment, no changes");
  });
});

describe("loop status", () => {
  const baseline = 'Round 0: Unchanged baseline\nEvalve loop: {"schema_version":1,"loop_id":"loop-id","lap":0,"required_consecutive_greens":2}';
  const read = (result: Record<string, unknown>) => parseEvalveLoop(
    `${baseline}\nEvalve result: ${JSON.stringify({ schema_version: 1, loop_id: "loop-id", ...result })}`,
  );

  it("uses the published winner even while the run query still shows activity", () => {
    const evalve = read({ status: "stop_success", winner_lap: 1 });
    expect(resolveLoopOutcome(evalve, null, true, "running")).toEqual({
      kind: "completed", passed: true, winnerLap: 1, title: "Experiment 1 passed",
      detail: "Every case passed in 2 consecutive replays.",
    });
  });

  it("says that the control passed when lap zero is the winning experiment", () => {
    const evalve = read({ status: "stop_success", winner_lap: 0 });
    expect(resolveLoopOutcome(evalve, null, false, "completed")).toEqual({
      kind: "completed", passed: true, winnerLap: 0, title: "The control passed",
      detail: "The agent met the target with no change.",
    });
  });

  it("uses the archived completion only for the original support-desk baseline", () => {
    const known = knownLegacyLoop("support-desk-demo", "01a1c733-f326-70af-af44-7e9bc55cb10a");
    expect(resolveLoopOutcome(null, known?.outcome ?? null, false, "completed")).toMatchObject({
      kind: "completed", passed: true, winnerLap: 1,
    });
    expect(knownLegacyLoop("support-desk-demo", "different-baseline")).toBeUndefined();
  });

  it.each(["stop_attempt_cap", "stop_budget"])("completes without a winner on %s", (status) => {
    const evalve = read({ status, reason: "The configured limit was reached." });
    expect(resolveLoopOutcome(evalve, null, false, "completed")).toMatchObject({
      kind: "completed", passed: false, winnerLap: null, title: "No experiment passed", detail: "The configured limit was reached.",
    });
  });

  it("uses Canceled for a canceled latest replay and Running for a resumed loop", () => {
    const evalve = read({ status: "running" });
    expect(resolveLoopOutcome(evalve, null, false, "canceled")).toEqual({ kind: "canceled" });
    expect(resolveLoopOutcome(evalve, null, true, "running")).toEqual({ kind: "running" });
  });

  it("waits for the runner's terminal result when the loop is between replays", () => {
    expect(resolveLoopOutcome(parseEvalveLoop(baseline), null, false, "completed")).toEqual({ kind: "running" });
    expect(resolveLoopOutcome(read({ status: "running" }), null, false, "completed")).toEqual({ kind: "running" });
    expect(resolveLoopOutcome(null, null, false, "completed")).toEqual({ kind: "running" });
  });

  it("keeps polling a completed loop until its final replay arrives", () => {
    const evalve = read({
      status: "stop_success", winner_lap: 1,
      laps: [{ experiment_id: "candidate", runs: [{ run_id: "first" }, { run_id: "final" }] }],
    });
    const first = { id: "first", status: "completed" as const };
    const final = { id: "final", status: "completed" as const };
    expect(resolveLoopOutcome(evalve, null, false, "completed")).toMatchObject({ kind: "completed" });
    expect(shouldPollLoopRuns(evalve, ["candidate"], [first])).toBe(true);
    expect(shouldPollLoopRuns(evalve, ["candidate"], [first, { ...final, status: "running" }])).toBe(true);
    expect(shouldPollLoopRuns(evalve, ["candidate"], [first, final])).toBe(false);
  });

  it("ignores published replays from laps outside the current view", () => {
    const evalve = read({
      status: "stop_attempt_cap",
      laps: [
        { experiment_id: "older-lap", runs: [{ run_id: "older" }] },
        { experiment_id: "visible-lap", runs: [{ run_id: "final" }] },
      ],
    });
    expect(shouldPollLoopRuns(evalve, ["visible-lap"], [{ id: "final", status: "failed" }])).toBe(false);
  });

  it("ignores malformed results and results for a different loop", () => {
    expect(read({ status: "stop_success", winner_lap: 1, loop_id: "other" })?.result).toBeNull();
    expect(read({ status: "stop_success", winner_lap: null })?.result).toBeNull();
    expect(parseEvalveLoop(`${baseline}\nEvalve result: {bad json}`)?.result).toBeNull();
  });
});
