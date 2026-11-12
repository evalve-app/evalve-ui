import { describe, expect, it } from "vitest";
import { evaluatorReplays, type RunCell } from "./loopResults";

const cases = [
  { id: "s1", name: "refund-01" },
  { id: "s2", name: "refund-02" },
  { id: "s3", name: "refund-03" },
];

// One run's results by case id, in the order the server gave them (not case order).
const run = new Map<string, RunCell>([
  ["s3", { sessionId: "r3", results: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: false }] }],
  ["s1", { sessionId: "r1", results: [{ evaluator: "tone", passed: true }, { evaluator: "action-correct", passed: false }] }],
  ["s2", { sessionId: null, results: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: true }] }],
]);

describe("evaluatorReplays", () => {
  it("lists the replays of each gating evaluator in case order", () => {
    expect(evaluatorReplays(run, cases, ["action-correct"])).toEqual([
      {
        evaluator: "action-correct",
        replays: [
          { caseId: "s1", caseName: "refund-01", sessionId: "r1", passed: false },
          { caseId: "s2", caseName: "refund-02", sessionId: null, passed: true },
          { caseId: "s3", caseName: "refund-03", sessionId: "r3", passed: true },
        ],
      },
    ]);
  });

  it("keeps the evaluators in the order of the loop's gating list", () => {
    expect(evaluatorReplays(run, cases, ["tone", "action-correct"]).map((e) => e.evaluator)).toEqual(["tone", "action-correct"]);
  });

  it("treats each evaluator as gating when the loop has no gating list, in name order", () => {
    const lists = evaluatorReplays(run, cases, undefined);
    expect(lists.map((e) => e.evaluator)).toEqual(["action-correct", "tone"]);
    expect(lists[1].replays.map((r) => r.passed)).toEqual([true, true, false]);
  });

  it("leaves out a case that the run has no result for, and keeps the order of the others", () => {
    const partial = new Map([...run].filter(([id]) => id !== "s2"));
    expect(evaluatorReplays(partial, cases, ["action-correct"])[0].replays.map((r) => r.caseId)).toEqual(["s1", "s3"]);
  });

  it("gives no lists for a lap with no completed run", () => {
    expect(evaluatorReplays(undefined, cases, ["action-correct"])).toEqual([]);
  });
});

// ── Final results section (#19): start ──────────────────────────────────────
import { finalResults, type FinalResultsLoop } from "./loopResults";

describe("finalResults", () => {
  type FinalLap = FinalResultsLoop["laps"][number];
  const CASE_IDS = ["s1", "s2", "s3", "s4"];

  // One lap from the pass (1) and fail (0) results of each gating evaluator, in case order.
  function finalLap(lap: number, results: Record<string, number[]>, more: Partial<FinalLap> = {}): FinalLap {
    return {
      lap,
      experiment: { description: null },
      runs: [],
      evaluatorReplays: Object.entries(results).map(([evaluator, passes]) => ({
        evaluator,
        replays: passes.map((p, i) => ({ caseId: CASE_IDS[i], caseName: `refund-0${i + 1}`, sessionId: null, passed: p === 1 })),
      })),
      ...more,
    };
  }

  const criteria = { cohort_target_mean_pass_k: 0.9, no_regression: true, max_rounds: 4 };
  const passed = { kind: "completed", passed: true, winnerLap: 2, title: "Lap 2 passed", detail: "It met every check across 1 runs." } as const;
  const notPassed = { kind: "completed", passed: false, winnerLap: null, title: "No lap passed", detail: "The loop ran all 4 laps it was allowed." } as const;

  // Lap 1 fixes two cases and breaks the fourth. Lap 2 passes each case.
  const laps = [
    finalLap(0, { "action-correct": [0, 0, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T10:03:00Z" }] }),
    finalLap(1, { "action-correct": [1, 1, 1, 0] }, { runs: [{ started_at: "2026-01-01T10:04:00Z", ended_at: "2026-01-01T10:08:00Z" }] }),
    finalLap(2, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:09:00Z", ended_at: "2026-01-01T10:12:05Z" }, { started_at: "2026-01-01T10:09:30Z", ended_at: null }] }),
  ];
  const passedLoop: FinalResultsLoop = { outcome: passed, laps, totalLaps: 3, settings: { criteria } };
  // The first two laps in a loop that did not pass: lap 1 has the highest pass rate.
  const notPassedLoop: FinalResultsLoop = {
    outcome: notPassed,
    laps: [laps[0], laps[1], finalLap(2, { "action-correct": [1, 0, 1, 0] })],
    totalLaps: 3,
    settings: { criteria },
  };

  it("gives no section for a running loop and a canceled loop", () => {
    expect(finalResults({ ...passedLoop, outcome: { kind: "running" } })).toBeNull();
    expect(finalResults({ ...passedLoop, outcome: { kind: "canceled" } })).toBeNull();
  });

  it("gives no section for a loop with no laps", () => {
    expect(finalResults({ ...passedLoop, laps: [], totalLaps: 0 })).toBeNull();
  });

  it("names the winning lap and the duration in the heading of a loop that passed", () => {
    const r = finalResults(passedLoop)!;
    expect(r.badge).toEqual({ label: "Passed", tone: "success" });
    expect(r.line).toBe("Lap 2 passed · 12m 5s");
    expect(r.detail).toBe("It met every check across 1 runs.");
  });

  it("names the best lap in the heading of a loop that did not pass, with a neutral badge", () => {
    const r = finalResults(notPassedLoop)!;
    expect(r.badge).toEqual({ label: "Not passed", tone: "neutral" });
    expect(r.line).toBe("No lap passed · Best lap: lap 1 · 8m 0s");
    expect(r.detail).toBe("The loop ran all 4 laps it was allowed.");
  });

  it("measures the duration from the earliest run start to the latest run end, in hours for a long loop", () => {
    const long = [
      finalLap(0, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T12:00:00Z", ended_at: "2026-01-01T12:30:00Z" }] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T11:00:00Z" }] }),
    ];
    expect(finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1, title: "Lap 1 passed" }, laps: long, totalLaps: 2 })!.line).toBe("Lap 1 passed · 2h 30m");
  });

  it("leaves the duration out when no run has a start and an end", () => {
    const noTimes = laps.map((l) => ({ ...l, runs: [] }));
    expect(finalResults({ ...passedLoop, laps: noTimes })!.line).toBe("Lap 2 passed");
  });

  it("gives one card for each gating evaluator with the count of the winning lap and of the baseline lap", () => {
    const two = [
      finalLap(0, { "action-correct": [0, 0, 1, 1], tone: [1, 1, 1, 0] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 0, 1, 1] }),
    ];
    const r = finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1 }, laps: two, totalLaps: 2 })!;
    expect(r.cards.slice(0, 2)).toEqual([
      { label: "action-correct", value: "100%", sub: "4 of 4 · was 2 of 4" },
      { label: "tone", value: "75%", sub: "3 of 4 · was 3 of 4" },
    ]);
    expect(r.cards.map((c) => c.label)).toEqual(["action-correct", "tone", "Got worse", "Laps"]);
  });

  it("uses the best lap for the cards of a loop that did not pass", () => {
    expect(finalResults(notPassedLoop)!.cards[0]).toEqual({ label: "action-correct", value: "75%", sub: "3 of 4 · was 2 of 4" });
  });

  it("counts the cases that got worse: passed in the baseline lap and failed in the lap in use", () => {
    expect(finalResults(passedLoop)!.cards[1]).toEqual({ label: "Got worse", value: "0", sub: "of 4 cases, baseline lap to lap 2" });
    expect(finalResults(notPassedLoop)!.cards[1]).toEqual({ label: "Got worse", value: "1", sub: "of 4 cases, baseline lap to lap 1" });
  });

  it("counts a case as got worse when it fails one of two gating evaluators", () => {
    const two = [
      finalLap(0, { "action-correct": [1, 1, 1, 1], tone: [1, 1, 1, 1] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 0, 1, 1] }),
    ];
    const r = finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1 }, laps: two, totalLaps: 2 })!;
    expect(r.cards.find((c) => c.label === "Got worse")!.value).toBe("1");
  });

  it("gives the laps after the baseline lap, with the limit from the loop settings", () => {
    expect(finalResults(passedLoop)!.cards[2]).toEqual({ label: "Laps", value: "2", sub: "of 4 max" });
  });

  it("gives no limit on the Laps card for a loop with no settings", () => {
    expect(finalResults({ ...passedLoop, settings: null })!.cards[2]).toEqual({ label: "Laps", value: "2", sub: "" });
  });

  it("gives one bar for each lap that has a score, with the pass rate over all gating evaluators", () => {
    const two = [
      finalLap(0, { "action-correct": [0, 0, 1, 1], tone: [1, 1, 1, 0] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 0, 1, 1] }),
      finalLap(2, {}),
    ];
    const r = finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1 }, laps: two, totalLaps: 3 })!;
    expect(r.bars).toEqual([
      { lap: 0, label: "Lap 0", rate: 0.25, text: "25%", inUse: false },
      { lap: 1, label: "Lap 1", rate: 0.75, text: "75%", inUse: true },
    ]);
    expect(r.chartLabel).toBe("Pass rate by lap: lap 0, 25%; lap 1, 75%");
  });

  it("gives the criteria rows of a loop with settings, each with its measured value", () => {
    expect(finalResults(passedLoop)!.criteria).toEqual([
      { met: true, label: "Pass rate, at least 90%", value: "100%" },
      { met: true, label: "No case got worse", value: "0 cases got worse" },
    ]);
    expect(finalResults(notPassedLoop)!.criteria).toEqual([
      { met: false, label: "Pass rate, at least 90%", value: "75%" },
      { met: false, label: "No case got worse", value: "1 case got worse" },
    ]);
  });

  it("gives no 'No case got worse' row when that setting is off, and no row for the lap limit", () => {
    const r = finalResults({ ...passedLoop, settings: { criteria: { ...criteria, no_regression: false } } })!;
    expect(r.criteria!.map((c) => c.label)).toEqual(["Pass rate, at least 90%"]);
  });

  it("gives one criteria row for a loop from the Evalve runner", () => {
    const evalve = `Baseline lap\nEvalve loop: ${JSON.stringify({ schema_version: 1, lap: 0, loop_id: "l1", required_consecutive_greens: 2 })}`;
    const evalveLaps = [{ ...laps[0], experiment: { description: evalve } }, laps[1], laps[2]];
    expect(finalResults({ ...passedLoop, laps: evalveLaps, settings: null })!.criteria).toEqual([
      { met: true, label: "Every case passed in 2 consecutive replays", value: "4 of 4 cases passed in lap 2" },
    ]);
    expect(finalResults({ ...notPassedLoop, laps: [evalveLaps[0], laps[1]], totalLaps: 2, settings: null })!.criteria).toEqual([
      { met: false, label: "Every case passed in 2 consecutive replays", value: "3 of 4 cases passed in lap 1" },
    ]);
  });

  it("gives no criteria for a loop with no rules on the server", () => {
    expect(finalResults({ ...passedLoop, settings: null })!.criteria).toBeNull();
  });

  it("says that the agent was not changed", () => {
    expect(finalResults(passedLoop)!.note).toBe("Nothing was changed in your agent");
  });
});
// ── Final results section (#19): end ────────────────────────────────────────
