import { describe, expect, it } from "vitest";
import type { EvalAggregate } from "../api/client";
import { baselineNote, hasBaseline, passCounts } from "./experiments";

const value = (passed: boolean) => ({ passed });
const aggregate = (over: Partial<EvalAggregate>): EvalAggregate =>
  ({ name: "scope_handling", data_type: "categorical", baseline: { count: 0 }, result: { count: 0 }, replays: [], ...over }) as EvalAggregate;

describe("passCounts", () => {
  it("counts the replays of the list", () => {
    const replays = [
      { replay_id: "p1", baseline: value(false), result: value(true) },
      { replay_id: "p2", baseline: value(true), result: value(true) },
      { replay_id: "p3", baseline: value(false), result: value(false) },
    ] as EvalAggregate["replays"];
    expect(passCounts(aggregate({ baseline: { count: 3, pass_rate: 1 / 3 }, result: { count: 3, pass_rate: 2 / 3 }, replays }))).toEqual({ total: 3, resultPassed: 2, baselinePassed: 1 });
  });

  it("uses the totals of the server when the list has fewer replays than the run", () => {
    const replays = [{ replay_id: "p103", baseline: value(true), result: value(true) }] as EvalAggregate["replays"];
    const agg = aggregate({ baseline: { count: 103, pass_rate: 97 / 103 }, result: { count: 103, pass_rate: 98 / 103 }, replays });
    expect(passCounts(agg)).toEqual({ total: 103, resultPassed: 98, baselinePassed: 97 });
  });

  it("gives no passed recorded session for a cut list with no scores for them", () => {
    const agg = aggregate({ result: { count: 103, pass_rate: 1 }, replays: [{ replay_id: "p103", result: value(true) }] as EvalAggregate["replays"] });
    expect(passCounts(agg)).toEqual({ total: 103, resultPassed: 103, baselinePassed: 0 });
  });

  it("gives zero for an aggregate with no replay", () => {
    expect(passCounts(aggregate({}))).toEqual({ total: 0, resultPassed: 0, baselinePassed: 0 });
  });
});

describe("hasBaseline and baselineNote", () => {
  it("has a baseline when the server counts scores of recorded sessions", () => {
    const agg = aggregate({ baseline: { count: 16, pass_rate: 0.5 } });
    expect(hasBaseline(agg)).toBe(true);
    expect(baselineNote(agg)).toBeNull();
  });

  it("has a baseline when a listed replay has a score for its recorded session", () => {
    const agg = aggregate({ replays: [{ replay_id: "p1", baseline: value(false), result: value(true) }] as EvalAggregate["replays"] });
    expect(hasBaseline(agg)).toBe(true);
  });

  it("has none for a Run that a Loop started, and says so", () => {
    const agg = aggregate({ result: { count: 2, pass_rate: 1 }, replays: [{ replay_id: "p1", baseline: null, result: value(true) }] as EvalAggregate["replays"] });
    expect(hasBaseline(agg)).toBe(false);
    expect(baselineNote(agg)).toBe("The recorded sessions have no score in this run, so there is no baseline to compare with.");
  });
});
