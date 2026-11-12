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

// ---- Results table (#18): start ----
import { resultsTable, type ResultsLap } from "./loopResults";
import { DEFAULT_CRITERIA, lapSummary } from "./loops";

describe("resultsTable", () => {
  const replay = (id: string, passed: boolean) => ({ caseId: id, caseName: `refund-0${id.slice(1)}`, sessionId: `r-${id}`, passed });
  const lap = (n: number, over: Partial<ResultsLap> = {}): ResultsLap => ({
    lap: n,
    summary: n === 0 ? "Baseline lap, no changes" : `Change ${n}`,
    running: false,
    runs: [{ status: "completed" }],
    evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s1", false), replay("s2", true), replay("s3", true)] }],
    screenGreen: null,
    selectionGate: null,
    confirmationGate: null,
    ...over,
  });
  const loop = (laps: ResultsLap[], over: Partial<Parameters<typeof resultsTable>[0]> = {}) => ({ laps, cases, criteria: null, winnerLap: null, cohortCaseCount: 3, ...over });

  it("has one column for each gating evaluator, and one row for each lap from the baseline lap on", () => {
    const table = resultsTable(loop([lap(0), lap(1)]));
    expect(table.evaluators).toEqual(["action-correct"]);
    expect(table.rows.map((r) => r.lap)).toEqual([0, 1]);
    expect(table.rows[0].cells.map((c) => c?.evaluator)).toEqual(["action-correct"]);
  });

  it("has no column for an evaluator that does not gate", () => {
    // The run has results for "tone" also, but only "action-correct" gates.
    const table = resultsTable(loop([lap(0, { evaluatorReplays: evaluatorReplays(run, cases, ["action-correct"]) })]));
    expect(table.evaluators).toEqual(["action-correct"]);
  });

  it("shows one square for each replay, in case order, with a name that gives the case and the result", () => {
    const cell = resultsTable(loop([lap(0)])).rows[0].cells[0]!;
    expect(cell.squares).toEqual([
      { caseId: "s1", passed: false, sessionId: "r-s1", label: "refund-01: failed" },
      { caseId: "s2", passed: true, sessionId: "r-s2", label: "refund-02: passed" },
      { caseId: "s3", passed: true, sessionId: "r-s3", label: "refund-03: passed" },
    ]);
  });

  it("counts the passed replays, in the failure tone when a replay failed", () => {
    const cell = resultsTable(loop([lap(0)])).rows[0].cells[0]!;
    expect(cell.count).toBe("2 of 3 passed");
    expect(cell.tone).toBe("destructive");
  });

  it("counts in the success tone when all replays passed", () => {
    const all = [{ evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true), replay("s3", true)] }];
    const cell = resultsTable(loop([lap(1, { evaluatorReplays: all })])).rows[0].cells[0]!;
    expect(cell.count).toBe("3 of 3 passed");
    expect(cell.tone).toBe("success");
  });

  it('says "first 50 of N" when the cohort has more cases than the server gives results for', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => replay(`s${i + 1}`, i >= 5));
    const cell = resultsTable(loop([lap(0, { evaluatorReplays: [{ evaluator: "action-correct", replays: fifty }] })], { cohortCaseCount: 120 })).rows[0].cells[0]!;
    expect(cell.count).toBe("45 of 50 passed · first 50 of 120");
  });

  it('does not say "first 50 of N" when a small cohort has a case with no result', () => {
    const cell = resultsTable(loop([lap(0)], { cohortCaseCount: 4 })).rows[0].cells[0]!;
    expect(cell.count).toBe("2 of 3 passed");
  });

  it("shows the lap summary, and lap 0 says that it is the baseline lap", () => {
    const rows = resultsTable(loop([lap(0, { summary: lapSummary("Round 0: baseline audit", 0) }), lap(1, { summary: lapSummary("Round 1: Refund in full after day 30. Hypothesis: h", 1) })])).rows;
    expect(rows.map((r) => r.summary)).toEqual(["Baseline lap, no changes", "Refund in full after day 30."]);
  });

  it("marks the winning lap, and only that lap", () => {
    const rows = resultsTable(loop([lap(0), lap(1), lap(2)], { winnerLap: 1 })).rows;
    expect(rows.map((r) => r.winner)).toEqual([false, true, false]);
    expect(rows[1].result).toMatchObject({ label: "Passed", tone: "success" });
  });

  it("gives each lap the status of its run from the server", () => {
    const rows = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "failed" }], evaluatorReplays: [] }), lap(2, { runs: [{ status: "canceled" }], evaluatorReplays: [] }), lap(3, { runs: [], evaluatorReplays: [] })])).rows;
    expect(rows.map((r) => r.status)).toEqual(["Completed", "Failed", "Stopped", "Not started"]);
  });

  it("gives the lap result from the rule of the MVP view: the baseline lap is not judged, a later lap passed or failed", () => {
    const met = { met: true, incomplete: false, meanPassK: 1, belowFloor: [], regressed: [], flaky: [], improved: [], belowTarget: false };
    const criteria = { ...DEFAULT_CRITERIA, trials_per_round: 1, k: 1, confirmation_round: false };
    const rows = resultsTable(loop([lap(0), lap(1, { selectionGate: { ...met, met: false, regressed: ["s1"] } }), lap(2, { selectionGate: met })], { criteria })).rows;
    expect(rows.map((r) => r.result?.label)).toEqual(["Baseline lap", "Failed", "Passed"]);
    expect(rows.map((r) => r.result?.tone)).toEqual(["neutral", "destructive", "success"]);
    expect(rows[1].result?.title).toBe("got worse than the baseline lap: refund-01");
  });

  it("gives no lap result when the loop has no rules on the server", () => {
    expect(resultsTable(loop([lap(0), lap(1)])).rows[1].result).toBeNull();
  });

  it("shows a lap with no completed run with its number, summary and run status, and no squares or result", () => {
    const row = resultsTable(loop([lap(0), lap(1, { running: true, runs: [{ status: "running" }], evaluatorReplays: [] })], { criteria: DEFAULT_CRITERIA })).rows[1];
    expect(row).toMatchObject({ lap: 1, summary: "Change 1", status: "Running", hasResults: false, result: null });
    expect(row.cells).toEqual([null]);
  });

  it("lists the replays of a lap in case order, each with one badge for each gating evaluator and a result", () => {
    const lists = [
      { evaluator: "action-correct", replays: [replay("s1", false), replay("s2", true), replay("s3", true)] },
      { evaluator: "tone", replays: [replay("s1", true), replay("s3", false)] },
    ];
    const row = resultsTable(loop([lap(0, { evaluatorReplays: lists })])).rows[0];
    expect(row.replays).toEqual([
      { caseId: "s1", caseName: "refund-01", sessionId: "r-s1", badges: [{ evaluator: "action-correct", passed: false }, { evaluator: "tone", passed: true }], status: "Completed", result: "Failed" },
      { caseId: "s2", caseName: "refund-02", sessionId: "r-s2", badges: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: null }], status: "Completed", result: "Passed" },
      { caseId: "s3", caseName: "refund-03", sessionId: "r-s3", badges: [{ evaluator: "action-correct", passed: true }, { evaluator: "tone", passed: false }], status: "Completed", result: "Failed" },
    ]);
  });

  it("lists no replays for a lap with no completed run", () => {
    expect(resultsTable(loop([lap(0, { runs: [{ status: "running" }], evaluatorReplays: [] })])).rows[0].replays).toEqual([]);
  });
});
// ---- Results table (#18): end ----
