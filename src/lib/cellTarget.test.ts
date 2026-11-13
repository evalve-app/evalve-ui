import { describe, expect, it } from "vitest";
import { cellTarget, type CellRun } from "./cellTarget";

const pass = [{ evaluator: "action-correct", passed: true }];
const fail = [{ evaluator: "action-correct", passed: false }];
const run = (n: number, over: Partial<CellRun> = {}): CellRun => ({ run: n, phase: "trial", sessionId: `s${n}`, results: pass, ...over });

describe("cellTarget", () => {
  it("links straight to the session when the cell covers one run", () => {
    expect(cellTarget({ caseName: "refund-late-fee", lap: 0, runs: [run(1)] })).toEqual({ kind: "link", sessionId: "s1" });
  });

  it("lists every run in run order when the cell covers several runs", () => {
    const runs = [
      ...[1, 2, 3, 4, 5].map((n) => run(n, { results: n === 3 ? fail : pass })),
      ...[6, 7, 8, 9, 10].map((n) => run(n, { phase: "confirmation" })),
    ].reverse();
    const t = cellTarget({ caseName: "refund-late-fee", lap: 2, runs });
    expect(t).toEqual({
      kind: "menu",
      header: "refund-late-fee · Experiment 2 · 9 of 10 passed",
      showPhase: true,
      rows: [
        { run: 1, phase: "trial", passed: true, sessionId: "s1" },
        { run: 2, phase: "trial", passed: true, sessionId: "s2" },
        { run: 3, phase: "trial", passed: false, sessionId: "s3" },
        { run: 4, phase: "trial", passed: true, sessionId: "s4" },
        { run: 5, phase: "trial", passed: true, sessionId: "s5" },
        { run: 6, phase: "confirmation", passed: true, sessionId: "s6" },
        { run: 7, phase: "confirmation", passed: true, sessionId: "s7" },
        { run: 8, phase: "confirmation", passed: true, sessionId: "s8" },
        { run: 9, phase: "confirmation", passed: true, sessionId: "s9" },
        { run: 10, phase: "confirmation", passed: true, sessionId: "s10" },
      ],
    });
  });

  it("leaves out a run whose replay has no result session", () => {
    const t = cellTarget({ caseName: "c", lap: 1, runs: [run(1), run(2, { sessionId: null }), run(3)] });
    expect(t.kind === "menu" && t.rows.map((r) => r.run)).toEqual([1, 3]);
  });

  it("counts every run in the header, as the cell does, even a run with no result session", () => {
    const t = cellTarget({ caseName: "c", lap: 1, runs: [run(1), run(2, { sessionId: null, results: fail }), run(3)] });
    expect(t.kind === "menu" && t.header).toBe("c · Experiment 1 · 2 of 3 passed");
  });

  it("links straight to the session when only one run has a result session", () => {
    expect(cellTarget({ caseName: "c", lap: 1, runs: [run(1, { sessionId: null }), run(2)] })).toEqual({ kind: "link", sessionId: "s2" });
  });

  it("passes a run only when the case passed every gating evaluator, and ignores the others", () => {
    const t = cellTarget({
      caseName: "c",
      lap: 1,
      gatingEvaluators: ["action-correct", "tone"],
      runs: [
        run(1, { results: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: true }, { evaluator: "length", passed: false }] }),
        run(2, { results: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: false }, { evaluator: "length", passed: true }] }),
      ],
    });
    expect(t.kind === "menu" && t.rows.map((r) => r.passed)).toEqual([true, false]);
    expect(t.kind === "menu" && t.header).toBe("c · Experiment 1 · 1 of 2 passed");
  });

  it("hides the phase when every run is a trial", () => {
    const t = cellTarget({ caseName: "c", lap: 0, runs: [run(1), run(2), run(3)] });
    expect(t.kind === "menu" && t.showPhase).toBe(false);
  });

  it("names lap 0 as the control experiment in the header, with no number", () => {
    const t = cellTarget({ caseName: "c", lap: 0, runs: [run(1), run(2), run(3)] });
    expect(t.kind === "menu" && t.header).toBe("c · Control experiment · 3 of 3 passed");
  });

  it("has no target, with a reason, when no run has a result session", () => {
    expect(cellTarget({ caseName: "c", lap: 1, runs: [run(1, { sessionId: null })] })).toEqual({ kind: "none", reason: "No replay session to open" });
  });
});
