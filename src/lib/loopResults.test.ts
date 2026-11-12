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
