import { describe, expect, it } from "vitest";
import { agentDiff, evaluatorReplays, finalResults, resultsTable, type AgentDiffInput, type AgentDiffLap, type FinalResultsLoop, type ResultsLap, type RunCell } from "./loopResults";
import { DEFAULT_CRITERIA, lapSummary } from "./loops";

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

  it("gives each replay the status that the server gives for it", () => {
    const withStatus = new Map<string, RunCell>([
      ["s1", { sessionId: "r1", status: "completed", results: [{ evaluator: "action-correct", passed: true }] }],
      ["s2", { sessionId: null, status: "failed", results: [{ evaluator: "action-correct", passed: false }] }],
    ]);
    expect(evaluatorReplays(withStatus, cases, ["action-correct"])[0].replays.map((r) => r.status)).toEqual(["completed", "failed"]);
  });
});

describe("agentDiff", () => {
  // One lap: its override, and one gating evaluator with one replay for each case.
  const lap = (n: number, summary: string, override: AgentDiffLap["override"], passes: boolean[]): AgentDiffLap => ({
    lap: n,
    summary,
    override,
    evaluatorReplays: passes.length ? [{ evaluator: "action-correct", replays: passes.map((passed, i) => ({ caseId: `s${i + 1}`, caseName: `refund-0${i + 1}`, sessionId: null, passed })) }] : [],
  });
  const BEFORE = "You are a support agent.\nBe polite.\nRefund when asked.";
  const AFTER = "You are a support agent.\nBe polite and brief.\nRefund when asked.\nRefuse refunds after day 30.";
  const input = (over: Partial<AgentDiffInput> = {}): AgentDiffInput => ({
    winnerLap: 1,
    laps: [lap(0, "Baseline lap, no changes", null, [false, false, false]), lap(1, "Add the day-30 rule.", { system_prompt: AFTER }, [true, true, true])],
    firstCase: { id: "s1", name: "refund-01" },
    before: { loading: false, prompt: BEFORE, model: "gpt-4.1-mini", modelParams: null },
    ...over,
  });

  it("gives no section for a loop with no winning lap", () => {
    expect(agentDiff(input({ winnerLap: null }))).toBeNull();
  });

  it("gives the full prompt with old and new line numbers and a sign for each line", () => {
    const d = agentDiff(input())!;
    expect(d.prompt).toMatchObject({
      kind: "diff",
      lines: [
        { kind: "same", oldNumber: 1, newNumber: 1, sign: " ", text: "You are a support agent." },
        { kind: "del", oldNumber: 2, newNumber: null, sign: "−", text: "Be polite." },
        { kind: "add", oldNumber: null, newNumber: 2, sign: "+", text: "Be polite and brief." },
        { kind: "same", oldNumber: 3, newNumber: 3, sign: " ", text: "Refund when asked." },
        { kind: "add", oldNumber: null, newNumber: 4, sign: "+", text: "Refuse refunds after day 30." },
      ],
    });
  });

  it("counts the added, removed and unchanged lines", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ counts: { added: 2, removed: 1, unchanged: 2 } });
  });

  it("gives a unified diff of the system prompt to copy", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({
      copy: {
        label: "Copy diff",
        text: ["--- a/system_prompt", "+++ b/system_prompt", "@@ -1,3 +1,4 @@", " You are a support agent.", "-Be polite.", "+Be polite and brief.", " Refund when asked.", "+Refuse refunds after day 30.", ""].join("\n"),
      },
    });
  });

  it("keeps three unchanged lines around each change in the unified diff, with one hunk for each group of changes", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const after = [...before];
    after[1] = "LINE 2";
    after.push("line 21");
    const d = agentDiff(input({ before: { loading: false, prompt: before.join("\n"), model: null, modelParams: null }, laps: [lap(0, "", null, []), lap(1, "", { system_prompt: after.join("\n") }, [])] }))!;
    expect(d.prompt).toMatchObject({
      copy: {
        text: ["--- a/system_prompt", "+++ b/system_prompt", "@@ -1,5 +1,5 @@", " line 1", "-line 2", "+LINE 2", " line 3", " line 4", " line 5", "@@ -18,3 +18,4 @@", " line 18", " line 19", " line 20", "+line 21", ""].join("\n"),
      },
    });
  });

  it("names the recorded session that gave the before prompt", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ source: { sessionId: "s1", name: "refund-01" } });
  });

  it("shows a load state for the prompt while the before prompt loads, and the rest of the section", () => {
    const d = agentDiff(input({ before: { loading: true, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({ kind: "loading" });
    expect(d.lapRows).toHaveLength(1);
  });

  it("falls back to the prompt of the winning lap in full when no before prompt is available", () => {
    const d = agentDiff(input({ before: { loading: false, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({
      kind: "after-only",
      note: "The recorded sessions use the agent's own setting, which Kitaru doesn't store, so there's no line-by-line diff. Lap 1, the winning lap, sets the system prompt to:",
      text: AFTER,
      copy: { label: "Copy prompt", text: AFTER, primary: false },
    });
  });

  it("says that the page could not load the agent's own prompt when the request for it failed, and keeps the fallback", () => {
    const d = agentDiff(input({ before: { loading: false, failed: true, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({
      kind: "after-only",
      note: "The page could not load the agent's own prompt, so there's no line-by-line diff. Lap 1, the winning lap, sets the system prompt to:",
      text: AFTER,
      copy: { label: "Copy prompt", text: AFTER, primary: false },
    });
  });

  it("makes \"Copy diff\" the one primary button: the copy of a full prompt with no diff is not primary", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ copy: { label: "Copy diff", primary: true } });
    expect(agentDiff(input({ before: { loading: false, prompt: null, model: null, modelParams: null } }))!.prompt).toMatchObject({ copy: { label: "Copy prompt", primary: false } });
  });

  it("says that the prompt did not change when the winning lap has no system prompt override", () => {
    const d = agentDiff(input({ laps: [lap(0, "", null, []), lap(1, "Use gpt-4.1.", { model: "gpt-4.1" }, [])] }))!;
    expect(d.prompt).toEqual({ kind: "unchanged", text: "The winning lap did not change the system prompt." });
  });

  it("gives an 'unchanged' chip for each field that the winning lap did not override", () => {
    const d = agentDiff(input())!;
    expect(d.chips).toEqual(["model unchanged", "parameters unchanged"]);
    expect(d.changedFields).toEqual([]);
  });

  it("gives a before and after line for a changed model, and no chip for it", () => {
    const d = agentDiff(input({ laps: [lap(0, "", null, []), lap(1, "Use gpt-4.1.", { system_prompt: AFTER, model: "gpt-4.1" }, [])] }))!;
    expect(d.changedFields).toEqual([{ label: "Model", before: "gpt-4.1-mini", after: "gpt-4.1" }]);
    expect(d.chips).toEqual(["parameters unchanged"]);
  });

  it("gives a before and after line for changed parameters, with the agent's own setting when the session does not give them", () => {
    const d = agentDiff(input({ laps: [lap(0, "", null, []), lap(1, "Lower the temperature.", { model_params: { temperature: 0 } }, [])] }))!;
    expect(d.changedFields).toEqual([{ label: "Parameters", before: "the agent's own setting", after: '{"temperature":0}' }]);
    expect(d.chips).toEqual(["model unchanged"]);
  });

  it("lists each lap after the baseline lap with its pass count change, and includes a lap that did not help", () => {
    const d = agentDiff(
      input({
        winnerLap: 3,
        laps: [
          lap(0, "Baseline lap, no changes", null, [false, false, false]),
          lap(1, "Add the day-30 rule.", { system_prompt: "x" }, [true, true, false]),
          lap(2, "Use gpt-4.1.", { model: "gpt-4.1" }, [true, false, false]),
          lap(3, "Name the late fee.", { system_prompt: AFTER }, [true, true, true]),
          lap(4, "Not run yet.", null, []),
        ],
      }),
    )!;
    expect(d.lapRows).toEqual([
      { lap: 1, summary: "Add the day-30 rule.", change: "0 → 2 / 3", trend: "better", winning: false },
      { lap: 2, summary: "Use gpt-4.1.", change: "2 → 1 / 3", trend: "worse", winning: false },
      { lap: 3, summary: "Name the late fee.", change: "1 → 3 / 3", trend: "better", winning: true },
      { lap: 4, summary: "Not run yet.", change: "No results yet", trend: null, winning: false },
    ]);
  });

  it("marks a lap with the same pass count as the lap before as no change", () => {
    const d = agentDiff(input({ winnerLap: 2, laps: [lap(0, "", null, [true, false]), lap(1, "Reword.", { system_prompt: "x" }, [false, true]), lap(2, "Add a rule.", { system_prompt: AFTER }, [true, true])] }))!;
    expect(d.lapRows[0]).toMatchObject({ change: "1 → 1 / 2", trend: "same" });
  });

  it("counts a case as passed only when each gating evaluator passed it", () => {
    const two = lap(1, "Add a rule.", { system_prompt: AFTER }, [true, true]);
    two.evaluatorReplays.push({ evaluator: "tone", replays: [{ caseId: "s1", caseName: "refund-01", sessionId: null, passed: false }, { caseId: "s2", caseName: "refund-02", sessionId: null, passed: true }] });
    const d = agentDiff(input({ laps: [lap(0, "", null, [false, false]), two] }))!;
    expect(d.lapRows[0].change).toBe("0 → 1 / 2");
  });
});

describe("resultsTable", () => {
  const replay = (id: string, passed: boolean) => ({ caseId: id, caseName: `refund-0${id.slice(1)}`, sessionId: `r-${id}`, passed, status: "completed" });
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
      { caseId: "s1", passed: false, sessionId: "r-s1", label: "refund-01: failed", name: "refund-01: failed. Open the result session in a new tab" },
      { caseId: "s2", passed: true, sessionId: "r-s2", label: "refund-02: passed", name: "refund-02: passed. Open the result session in a new tab" },
      { caseId: "s3", passed: true, sessionId: "r-s3", label: "refund-03: passed", name: "refund-03: passed. Open the result session in a new tab" },
    ]);
  });

  it("says that a square has no result session when the replay has none", () => {
    const lists = [{ evaluator: "action-correct", replays: [{ ...replay("s1", false), sessionId: null }] }];
    expect(resultsTable(loop([lap(0, { evaluatorReplays: lists })])).rows[0].cells[0]!.squares).toEqual([{ caseId: "s1", passed: false, sessionId: null, label: "refund-01: failed", name: "refund-01: failed. No result session" }]);
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
    expect(rows.map((r) => r.winning)).toEqual([false, true, false]);
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
    expect(row).toMatchObject({ lap: 1, summary: "Change 1", status: "Running", noResults: "No results yet", result: null });
    expect(row.cells).toEqual([null]);
  });

  it("gives a lap with results no text in the place of the squares", () => {
    expect(resultsTable(loop([lap(0)])).rows[0].noResults).toBeNull();
  });

  it('says "No results yet" for each lap with no completed run, whatever the run status', () => {
    const rows = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "failed" }], evaluatorReplays: [] }), lap(2, { runs: [{ status: "canceled" }], evaluatorReplays: [] }), lap(3, { runs: [], evaluatorReplays: [] })])).rows;
    expect(rows.slice(1).map((r) => r.noResults)).toEqual(["No results yet", "No results yet", "No results yet"]);
  });

  it("says that a completed run gave no results, and does not show it as a lap with no run", () => {
    const row = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "completed" }], evaluatorReplays: [] })], { criteria: DEFAULT_CRITERIA, winnerLap: 1 })).rows[1];
    expect(row).toMatchObject({ status: "Completed", noResults: "No results from a gating evaluator", result: null, replays: [] });
    expect(row.cells).toEqual([null]);
  });

  it("gives the status of the completed run when a later run of the lap still runs", () => {
    const row = resultsTable(loop([lap(0, { runs: [{ status: "completed" }, { status: "running" }] })])).rows[0];
    expect(row.status).toBe("Completed");
  });

  it("lists the replays of a lap in case order, each with one badge for each gating evaluator and a result", () => {
    const lists = [
      { evaluator: "action-correct", replays: [replay("s1", false), replay("s2", true), replay("s3", true)] },
      { evaluator: "tone", replays: [replay("s1", true), replay("s3", false)] },
    ];
    const row = resultsTable(loop([lap(0, { evaluatorReplays: lists })])).rows[0];
    expect(row.replays).toEqual([
      { caseId: "s1", caseName: "refund-01", sessionId: "r-s1", badges: [{ evaluator: "action-correct", passed: false, text: "action-correct: failed" }, { evaluator: "tone", passed: true, text: "tone: passed" }], status: "Completed", result: "Failed" },
      { caseId: "s2", caseName: "refund-02", sessionId: "r-s2", badges: [{ evaluator: "action-correct", passed: true, text: "action-correct: passed" }, { evaluator: "tone", passed: null, text: "tone: no result" }], status: "Completed", result: "Passed" },
      { caseId: "s3", caseName: "refund-03", sessionId: "r-s3", badges: [{ evaluator: "action-correct", passed: true, text: "action-correct: passed" }, { evaluator: "tone", passed: false, text: "tone: failed" }], status: "Completed", result: "Failed" },
    ]);
  });

  it("gives each replay in the list its status from the server, as a word", () => {
    const statuses = ["completed", "failed", "canceled", "evaluating", "pending", undefined];
    const replays = statuses.map((status, i) => ({ ...replay(`s${i + 1}`, true), status }));
    const sixCases = statuses.map((_, i) => ({ id: `s${i + 1}`, name: `refund-0${i + 1}` }));
    const row = resultsTable(loop([lap(0, { evaluatorReplays: [{ evaluator: "action-correct", replays }] })], { cases: sixCases })).rows[0];
    expect(row.replays.map((r) => r.status)).toEqual(["Completed", "Failed", "Stopped", "Evaluating", "Pending", "No status"]);
  });

  it("lists no replays for a lap with no completed run", () => {
    expect(resultsTable(loop([lap(0, { runs: [{ status: "running" }], evaluatorReplays: [] })])).rows[0].replays).toEqual([]);
  });
});

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

  // One run for each lap and k = 1: the pass rate of that run is the number that the rule of the loop uses.
  const criteria = { cohort_target_mean_pass_k: 0.9, no_regression: true, max_rounds: 4, trials_per_round: 1, k: 1 };
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
    expect(r.line).toBe("Lap 2 passed · 12 min");
    expect(r.detail).toBe("It met every check across 1 runs.");
  });

  it("names the best lap in the heading of a loop that did not pass, with a neutral badge", () => {
    const r = finalResults(notPassedLoop)!;
    expect(r.badge).toEqual({ label: "Not passed", tone: "neutral" });
    expect(r.line).toBe("No lap passed · Best lap: lap 1 · 8 min");
    expect(r.detail).toBe("The loop ran all 4 laps it was allowed.");
  });

  it("measures the duration from the earliest run start to the latest run end, in hours for a long loop", () => {
    const long = [
      finalLap(0, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T12:00:00Z", ended_at: "2026-01-01T12:30:00Z" }] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T11:00:00Z" }] }),
    ];
    expect(finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1, title: "Lap 1 passed" }, laps: long, totalLaps: 2 })!.line).toBe("Lap 1 passed · 2 h 30 min");
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
    expect(finalResults(passedLoop)!.cards[2]).toEqual({ label: "Laps", value: "2", sub: "after the baseline lap · limit 4" });
  });

  it("gives no limit on the Laps card for a loop with no settings", () => {
    expect(finalResults({ ...passedLoop, settings: null })!.cards[2]).toEqual({ label: "Laps", value: "2", sub: "after the baseline lap" });
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

  // The shape of `day-30-refunds`: 5 runs for each lap, pass^3, and an outcome that the known loops list gives.
  // One run is 20 of 23, under the 90% target, but the loop passed on pass^3 over 5 runs.
  describe("a loop that the rules judge on more than one run for each lap", () => {
    const row = (n: number) => Array.from({ length: 23 }, (_, i) => (i < n ? 1 : 0));
    const ids = Array.from({ length: 23 }, (_, i) => `s${i + 1}`);
    const lap23 = (lap: number, n: number): FinalLap => ({ ...finalLap(lap, {}), evaluatorReplays: [{ evaluator: "support-desk-action-correct", replays: row(n).map((p, i) => ({ caseId: ids[i], caseName: ids[i], sessionId: null, passed: p === 1 })) }] });
    const day30: FinalResultsLoop = {
      outcome: { kind: "completed", passed: true, winnerLap: 1, title: "Lap 1 passed", detail: "It met every check across 5 runs, then met them again on 5 fresh runs." },
      laps: [lap23(0, 0), lap23(1, 20)],
      totalLaps: 2,
      settings: { criteria: { cohort_target_mean_pass_k: 0.9, no_regression: true, max_rounds: 4, trials_per_round: 5, k: 3 } },
    };

    it("shows no criteria row, because one run does not give the number that the rule uses", () => {
      const r = finalResults(day30)!;
      expect(r.badge.label).toBe("Passed");
      expect(r.criteria).toBeNull();
      expect(r.criteriaSummary).toBeNull();
    });

    it("keeps the cards and the limit of the Laps card", () => {
      expect(finalResults(day30)!.cards).toEqual([
        { label: "support-desk-action-correct", value: "87%", sub: "20 of 23 · was 0 of 23" },
        { label: "Got worse", value: "0", sub: "of 23 cases, baseline lap to lap 1" },
        { label: "Laps", value: "1", sub: "after the baseline lap · limit 4" },
      ]);
    });

    it("shows no criteria row for several runs with k = 1 also", () => {
      expect(finalResults({ ...day30, settings: { criteria: { ...day30.settings!.criteria, k: 1 } } })!.criteria).toBeNull();
    });
  });

  it("never shows an unmet criterion below a Passed badge", () => {
    for (const loop of [passedLoop, { ...passedLoop, settings: null }]) expect(finalResults(loop)!.criteria?.every((c) => c.met) ?? true).toBe(true);
  });

  it("gives no criteria for a loop with no rules on the server", () => {
    expect(finalResults({ ...passedLoop, settings: null })!.criteria).toBeNull();
  });

  it("says how many criteria the lap in use met", () => {
    expect(finalResults(passedLoop)!.criteriaSummary).toBe("all met");
    expect(finalResults(notPassedLoop)!.criteriaSummary).toBe("0 of 2 met");
    expect(finalResults({ ...passedLoop, settings: null })!.criteriaSummary).toBeNull();
  });

  it("says that the agent was not changed, and points to the diff only for a loop that passed", () => {
    expect(finalResults(passedLoop)!.note).toEqual({ title: "Nothing was changed in your agent", text: "The loop changed only its own copy of the agent. The change of the winning lap is below." });
    expect(finalResults(notPassedLoop)!.note).toEqual({ title: "Nothing was changed in your agent", text: "The loop changed only its own copy of the agent." });
  });
});
