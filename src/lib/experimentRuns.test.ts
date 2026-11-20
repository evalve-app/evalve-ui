import { describe, expect, it } from "vitest";
import type { EvalAggregate } from "../api/client";
import { controlDeltaPoints, replayLimitNote, runCost, runOverview, runsByExperiment, runsSpread, totalCost, type RunOverview } from "./experimentRuns";

const value = (passed: boolean | null) => ({ passed });
// One evaluator's results, one entry for each case. `recorded` gives the
// result of the recorded session of each case, for a run that scored them.
const aggregate = (name: string, results: (boolean | null)[], recorded?: boolean[]): EvalAggregate =>
  ({
    name: name.replace(/-/g, "_"),
    evaluator_name: name,
    data_type: "categorical",
    baseline: { count: recorded?.length ?? 0 },
    result: { count: results.length },
    replays: results.map((passed, i) => ({ replay_id: `p${i + 1}`, baseline: recorded ? value(recorded[i]) : null, result: passed == null ? null : value(passed) })),
  }) as EvalAggregate;

describe("runOverview", () => {
  it("counts the cases that passed every evaluator", () => {
    const overview = runOverview([aggregate("scope-handling", [true, true, false, true]), aggregate("asked-for-less", [true, false, true, true])]);
    expect(overview).toMatchObject({ cases: 4, passed: 2, rate: 0.5, summary: "2 of 4 cases passed every evaluator · 50%" });
    expect(overview.evaluators.map((e) => e.name)).toEqual(["scope-handling", "asked-for-less"]);
  });

  it("does not count a case as passed when an evaluator gave it no result", () => {
    const overview = runOverview([aggregate("scope-handling", [true, true]), aggregate("asked-for-less", [true, null])]);
    expect(overview.summary).toBe("1 of 2 cases passed every evaluator · 50%");
  });

  it("says case for one case", () => {
    expect(runOverview([aggregate("scope-handling", [true])]).summary).toBe("1 of 1 case passed every evaluator · 100%");
  });

  it("has no result when no evaluator gave a pass/fail result", () => {
    expect(runOverview([aggregate("scope-handling", [])])).toMatchObject({ cases: 0, rate: null, summary: null, failures: null, deltaPoints: null });
    expect(runOverview([])).toEqual({ cases: 0, passed: 0, listed: 0, rate: null, summary: null, deltaPoints: null, failures: null, evaluators: [] });
  });

  it("names an evaluator by its evaluation name when the server gives no evaluator name", () => {
    const agg = { ...aggregate("scope-handling", [true]), evaluator_name: null } as EvalAggregate;
    expect(runOverview([agg]).evaluators[0].name).toBe("scope_handling");
  });

  describe("failures", () => {
    it("names the evaluators that failed a case, the one with the most failures first", () => {
      const overview = runOverview([aggregate("asked-for-less", [true, true, true]), aggregate("input-handling", [false, true, true]), aggregate("scope-handling", [false, false, true])]);
      expect(overview.failures).toBe("Failed: scope-handling 2 · input-handling 1");
    });

    it("puts evaluators with the same number of failures in name order", () => {
      const overview = runOverview([aggregate("scope-handling", [false, true]), aggregate("asked-for-less", [true, false])]);
      expect(overview.failures).toBe("Failed: asked-for-less 1 · scope-handling 1");
    });

    it("counts a case with no result from the evaluator as a failure of it", () => {
      expect(runOverview([aggregate("scope-handling", [true, true]), aggregate("asked-for-less", [true, null])]).failures).toBe("Failed: asked-for-less 1");
    });

    it("names three evaluators and counts the others", () => {
      const overview = runOverview(["a", "b", "c", "d", "e"].map((name) => aggregate(name, [false])));
      expect(overview.failures).toBe("Failed: a 1 · b 1 · c 1 · +2 more");
    });

    it("names an evaluator with no evaluator name by its evaluation name, and counts its failures", () => {
      const unnamed = { ...aggregate("scope-handling", [false, false]), evaluator_name: null } as EvalAggregate;
      const overview = runOverview([unnamed]);
      expect(overview).toMatchObject({ passed: 0, rate: 0, failures: "Failed: scope_handling 2" });
      expect(runOverview([unnamed, aggregate("asked-for-less", [true, true])]).failures).toBe("Failed: scope_handling 2");
    });

    it("counts the replays that the results list, with or without a pass/fail result", () => {
      // Scores only: no case has a pass/fail result, and the two replays are still listed.
      expect(runOverview([aggregate("answer-length", [null, null])])).toMatchObject({ cases: 0, listed: 2, rate: null });
      expect(runOverview([aggregate("scope-handling", [true, false, true])])).toMatchObject({ cases: 3, listed: 3 });
    });

    it("counts only the evaluators that give a pass/fail result", () => {
      // A metric sets no passed flag: it does not gate, and it is not in the count of evaluators.
      const metric = aggregate("answer-length", [null, null]);
      expect(runOverview([aggregate("scope-handling", [true, true]), metric]).failures).toBe("Passed the evaluator");
    });

    it("says that each evaluator passed when no case failed", () => {
      expect(runOverview([aggregate("scope-handling", [true]), aggregate("asked-for-less", [true])]).failures).toBe("Passed all 2 evaluators");
      expect(runOverview([aggregate("scope-handling", [true])]).failures).toBe("Passed the evaluator");
    });
  });

  describe("deltaPoints", () => {
    it("is null for a run with no scores for the recorded sessions", () => {
      expect(runOverview([aggregate("scope-handling", [true, false])]).deltaPoints).toBeNull();
    });

    it("is the change from the recorded sessions that passed every evaluator", () => {
      // Recorded: case 1 passed both, cases 2 to 4 failed one. This run: cases 1 to 3 passed both.
      const overview = runOverview([aggregate("scope-handling", [true, true, true, false], [true, false, true, true]), aggregate("asked-for-less", [true, true, true, true], [true, true, false, false])]);
      expect(overview).toMatchObject({ passed: 3, deltaPoints: 50 });
    });

    it("is negative when fewer cases passed than in the recorded sessions", () => {
      expect(runOverview([aggregate("scope-handling", [true, false, false, false], [true, true, true, false])]).deltaPoints).toBe(-50);
    });
  });
});

describe("runsByExperiment", () => {
  it("groups the runs by experiment, oldest run first", () => {
    const runs = [
      { experiment_id: "a", number: 3 },
      { experiment_id: "b", number: 1 },
      { experiment_id: "a", number: 1 },
      { experiment_id: "a", number: 2 },
    ];
    const grouped = runsByExperiment(runs);
    expect(grouped.get("a")?.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(grouped.get("b")?.map((r) => r.number)).toEqual([1]);
    expect(grouped.get("c")).toBeUndefined();
  });
});

describe("runsSpread", () => {
  const run = (passed: number, cases: number): RunOverview => ({ cases, passed, listed: cases, rate: cases ? passed / cases : null, summary: null, deltaPoints: null, failures: null, evaluators: [] });

  it("gives the range of the cases that passed", () => {
    expect(runsSpread([run(95, 103), run(96, 103), run(95, 103)])).toBe("3 runs: 95 to 96 of 103 passed");
  });

  it("says when each run passed the same number", () => {
    expect(runsSpread([run(16, 16), run(16, 16)])).toBe("2 runs: 16 of 16 passed in each");
  });

  it("gives the range of the pass rates when the runs do not have the same cases", () => {
    expect(runsSpread([run(8, 16), run(95, 100)])).toBe("2 runs: 50% to 95% passed");
  });

  it("has no text for fewer than two runs with a result", () => {
    expect(runsSpread([run(95, 103)])).toBeNull();
    expect(runsSpread([run(95, 103), run(0, 0)])).toBeNull();
    expect(runsSpread([])).toBeNull();
  });
});

describe("runCost and totalCost", () => {
  it("adds the cost of the sessions", () => {
    expect(Number(runCost([{ cost: "0.00062918" }, { cost: "0.00040000" }, { cost: null }]))).toBeCloseTo(0.00102918, 10);
  });

  it("is null when no session has a cost", () => {
    expect(runCost([{ cost: null }, {}])).toBeNull();
    expect(runCost([])).toBeNull();
  });

  it("leaves out a cost that is not a number", () => {
    expect(runCost([{ cost: "0.5" }, { cost: "unknown" }])).toBe("0.5");
  });

  it("adds the cost of the runs of an experiment", () => {
    expect(Number(totalCost(["0.046", "0.0452", null, undefined]))).toBeCloseTo(0.0912, 10);
    expect(totalCost([null, undefined])).toBeNull();
  });
});

describe("controlDeltaPoints", () => {
  const run = (passed: number, cases: number): RunOverview => ({ cases, passed, listed: cases, rate: cases ? passed / cases : null, summary: null, deltaPoints: null, failures: null, evaluators: [] });

  it("is the change in pass rate from the control experiment, in points", () => {
    expect(controlDeltaPoints(run(94, 103), run(81, 103))).toBe(13);
    expect(controlDeltaPoints(run(3, 6), run(5, 6))).toBe(-33);
    expect(controlDeltaPoints(run(5, 16), run(5, 16))).toBe(0);
  });

  it("is null when the control experiment or the run has no pass rate", () => {
    expect(controlDeltaPoints(run(94, 103), undefined)).toBeNull();
    expect(controlDeltaPoints(run(94, 103), run(0, 0))).toBeNull();
    expect(controlDeltaPoints(run(0, 0), run(81, 103))).toBeNull();
  });
});

describe("replayLimitNote", () => {
  it("is null for a run within the limit", () => {
    expect(replayLimitNote(103, 103)).toBeNull();
    expect(replayLimitNote(999, 999)).toBeNull();
    expect(replayLimitNote(101, 103)).toBeNull();
    expect(replayLimitNote(50, undefined)).toBeNull();
  });

  it("says how many of the cases the results are of, for a run over the limit", () => {
    expect(replayLimitNote(999, 1000)).toBe("Results for 999 of 1,000 cases");
    expect(replayLimitNote(1049, 2500)).toBe("Results for 1,049 of 2,500 cases");
  });
});
