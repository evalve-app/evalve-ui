import { describe, expect, it } from "vitest";
import type { EvalAggregate, Replay, SessionEvaluation } from "../api/client";
import { aggregatesCut, casesListed, completeAggregates, sessionsToLoad } from "./runAggregates";

const stats = (count: number, passRate: number | null = null) => ({ count, pass_rate: passRate });
const value = (passed: boolean) => ({ score: passed ? 1 : 0, value: passed ? "pass" : "fail", passed, min_score: null, max_score: null, target_score: null });
const aggregate = (over: Partial<EvalAggregate>): EvalAggregate =>
  ({ name: "scope_handling", evaluator_name: "scope-handling", evaluator_version_id: "v1", data_type: "categorical", baseline: stats(0), result: stats(0), replays: [], ...over }) as EvalAggregate;
// Replay p1 is the oldest. Its recorded session is s1 and its result session is r1.
const replay = (n: number): Replay => ({ id: `p${n}`, baseline_session_id: `s${n}`, result_session_id: `r${n}`, created: `2026-11-20T08:00:0${n}Z` }) as Replay;
const evaluation = (sessionId: string, passed: boolean, over: Partial<SessionEvaluation> = {}): SessionEvaluation =>
  ({ session_id: sessionId, name: "scope_handling", evaluator_version_id: "v1", passed, score: passed ? 1 : 0, value: passed ? "pass" : "fail", created: "2026-11-20T08:05:00Z", ...over }) as SessionEvaluation;

describe("aggregatesCut", () => {
  it("is false when each aggregate lists every replay with a value", () => {
    const agg = aggregate({ result: stats(2), replays: [{ replay_id: "p1", result: value(true) }, { replay_id: "p2", result: value(false) }] as EvalAggregate["replays"] });
    expect(aggregatesCut([agg])).toBe(false);
  });

  it("is true when an aggregate lists fewer replays than the run has results for", () => {
    const agg = aggregate({ result: stats(3), replays: [{ replay_id: "p2", result: value(true) }, { replay_id: "p3", result: value(true) }] as EvalAggregate["replays"] });
    expect(aggregatesCut([aggregate({ result: stats(2), replays: agg.replays }), agg])).toBe(true);
  });

  it("counts the scores of the recorded sessions too", () => {
    const agg = aggregate({ baseline: stats(3), result: stats(1), replays: [{ replay_id: "p3", baseline: value(true), result: value(true) }] as EvalAggregate["replays"] });
    expect(aggregatesCut([agg])).toBe(true);
  });

  it("is false for a run with no result yet", () => {
    expect(aggregatesCut([aggregate({})])).toBe(false);
    expect(aggregatesCut([])).toBe(false);
  });
});

describe("casesListed", () => {
  const entry = (id: string) => ({ replay_id: id, baseline: null, result: null });

  it("counts each replay once, across the aggregates", () => {
    expect(casesListed([aggregate({ replays: [entry("p1"), entry("p2")] }), aggregate({ replays: [entry("p2"), entry("p3")] })])).toBe(3);
  });

  it("counts a replay with no result, and is 0 with no replays", () => {
    expect(casesListed([aggregate({ replays: [entry("p1")] })])).toBe(1);
    expect(casesListed([aggregate({})])).toBe(0);
    expect(casesListed([])).toBe(0);
  });
});

describe("sessionsToLoad", () => {
  const replays = [replay(1), replay(2), replay(3)];
  const listed = [{ replay_id: "p3", result: value(true) }] as EvalAggregate["replays"];

  it("gives the result session of each replay that an aggregate does not list", () => {
    expect(sessionsToLoad([aggregate({ result: stats(3), replays: listed })], replays)).toEqual(["r1", "r2"]);
  });

  it("adds the recorded sessions when the run has scores for them", () => {
    expect(sessionsToLoad([aggregate({ baseline: stats(3), result: stats(3), replays: listed })], replays)).toEqual(["r1", "s1", "r2", "s2"]);
  });

  it("gives nothing when each aggregate lists each replay", () => {
    const all = replays.map((r) => ({ replay_id: r.id, result: value(true) })) as EvalAggregate["replays"];
    expect(sessionsToLoad([aggregate({ result: stats(3), replays: all })], replays)).toEqual([]);
  });
});

describe("completeAggregates", () => {
  const replays = [replay(3), replay(1), replay(2)];
  const fromServer = { replay_id: "p3", baseline: null, result: value(true) };

  it("adds an entry for each replay that the server left out, oldest first", () => {
    const agg = aggregate({ result: stats(3), replays: [fromServer] as EvalAggregate["replays"] });
    const [done] = completeAggregates([agg], replays, [evaluation("r1", false), evaluation("r2", true)]);
    expect(done.replays).toEqual([
      { replay_id: "p1", baseline: null, result: value(false) },
      { replay_id: "p2", baseline: null, result: value(true) },
      fromServer,
    ]);
  });

  it("keeps the entry that the server gave", () => {
    const agg = aggregate({ result: stats(3), replays: [fromServer] as EvalAggregate["replays"] });
    const [done] = completeAggregates([agg], replays, [evaluation("r3", false)]);
    expect(done.replays.find((r) => r.replay_id === "p3")).toBe(fromServer);
  });

  it("uses only the evaluations of the aggregate's evaluator version and name", () => {
    const agg = aggregate({ result: stats(2), replays: [] });
    const others = [evaluation("r1", false, { evaluator_version_id: "v2" }), evaluation("r1", false, { name: "input_handling" }), evaluation("r1", true)];
    const [done] = completeAggregates([agg], [replay(1)], others);
    expect(done.replays).toEqual([{ replay_id: "p1", baseline: null, result: value(true) }]);
  });

  it("takes the newest evaluation of a session", () => {
    const agg = aggregate({ result: stats(2), replays: [] });
    const two = [evaluation("r1", true, { created: "2026-11-20T09:00:00Z" }), evaluation("r1", false, { created: "2026-11-20T08:00:00Z" })];
    expect(completeAggregates([agg], [replay(1)], two)[0].replays[0].result).toEqual(value(true));
  });

  it("gives the score of the recorded session only when the run has such scores", () => {
    const evaluations = [evaluation("r1", true), evaluation("s1", false)];
    const loopRun = completeAggregates([aggregate({ result: stats(2), replays: [] })], [replay(1)], evaluations);
    expect(loopRun[0].replays).toEqual([{ replay_id: "p1", baseline: null, result: value(true) }]);
    const withRecorded = completeAggregates([aggregate({ baseline: stats(2), result: stats(2), replays: [] })], [replay(1)], evaluations);
    expect(withRecorded[0].replays).toEqual([{ replay_id: "p1", baseline: value(false), result: value(true) }]);
  });

  it("gives a replay with no evaluation an entry with no values", () => {
    const [done] = completeAggregates([aggregate({ result: stats(2), replays: [] })], [replay(1)], []);
    expect(done.replays).toEqual([{ replay_id: "p1", baseline: null, result: null }]);
  });

  it("keeps an entry for a replay that the replay list does not have", () => {
    const stray = { replay_id: "p9", baseline: null, result: value(true) };
    const [done] = completeAggregates([aggregate({ result: stats(2), replays: [stray] as EvalAggregate["replays"] })], [replay(1)], [evaluation("r1", true)]);
    expect(done.replays.map((r) => r.replay_id)).toEqual(["p9", "p1"]);
  });
});
