import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EvalAggregate, Replay } from "../api/client";
import { agentDiff, evaluatorReplays, finalResults, resultsTable, runReplays, runResults, type AgentDiffInput, type AgentDiffLap, type EvaluatorReplays, type FinalResultsLoop, type ResultsLap, type RunCell, type RunReplays } from "./loopResults";
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
});

describe("runReplays", () => {
  const results = (cells: Map<string, RunCell>, passed = new Map<string, boolean | null>()) => ({ cells, evaluators: ["action-correct"], passed });
  const second = new Map<string, RunCell>([["s1", { sessionId: "q1", results: [{ evaluator: "action-correct", passed: true }] }]]);

  it("keeps the replays of each completed run, with the run number and the run status, oldest run first", () => {
    const runs = [
      { id: "b", number: 2, status: "completed" },
      { id: "a", number: 1, status: "completed" },
    ];
    const list = runReplays(runs, new Map([["a", results(run)], ["b", results(second)]]), cases, ["action-correct"]);
    expect(list.map((r) => [r.run, r.status])).toEqual([[1, "completed"], [2, "completed"]]);
    expect(list[0].evaluatorReplays).toEqual(evaluatorReplays(run, cases, ["action-correct"], ["action-correct"]));
    expect(list[1]).toMatchObject({ unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: [{ caseId: "s1", caseName: "refund-01", sessionId: "q1", passed: true }] }] });
  });

  it("leaves out a run that has no results: a run that is not completed, or whose results did not load", () => {
    const runs = [
      { id: "a", number: 1, status: "failed" },
      { id: "b", number: 2, status: "completed" },
      { id: "c", number: 3, status: "running" },
    ];
    expect(runReplays(runs, new Map([["b", results(second)]]), cases, ["action-correct"]).map((r) => r.run)).toEqual([2]);
  });

  it("keeps a case of the run that got no pass or fail result from a gating evaluator, as a case with no score", () => {
    const passed = new Map<string, boolean | null>([["s1", true], ["s2", null]]);
    const list = runReplays([{ id: "b", number: 1, status: "completed" }], new Map([["b", results(second, passed)]]), cases, ["action-correct"]);
    expect(list[0].unscored).toEqual(["s2"]);
  });

  it("keeps a required evaluator that gave no result in a run, with an empty list", () => {
    const list = runReplays([{ id: "b", number: 1, status: "completed" }], new Map([["b", { cells: second, evaluators: ["action-correct", "tone"], passed: new Map() }]]), cases, ["action-correct", "tone"]);
    expect(list[0].evaluatorReplays.map((e) => [e.evaluator, e.replays.length])).toEqual([["action-correct", 1], ["tone", 0]]);
  });
});

describe("agentDiff", () => {
  // One lap: its number and its override.
  const lap = (n: number, override: AgentDiffLap["override"]): AgentDiffLap => ({ lap: n, override });
  const BEFORE = "You are a support agent.\nBe polite.\nRefund when asked.";
  const AFTER = "You are a support agent.\nBe polite and brief.\nRefund when asked.\nRefuse refunds after day 30.";
  const input = (over: Partial<AgentDiffInput> = {}): AgentDiffInput => ({
    winnerLap: 1,
    laps: [lap(0, null), lap(1, { system_prompt: AFTER })],
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

  it("gives one line with the numbers of added, removed and unchanged lines", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ countLine: "2 lines added · 1 removed · 2 unchanged" });
  });

  it("says \"1 line added\" for one added line", () => {
    const d = agentDiff(input({ before: { loading: false, prompt: "keep", model: null, modelParams: null }, laps: [lap(0, null), lap(1, { system_prompt: "keep\nnew" })] }))!;
    expect(d.prompt).toMatchObject({ countLine: "1 line added · 0 removed · 1 unchanged" });
  });

  it("names the control experiment and the winning experiment in the title, with a badge for the system prompt", () => {
    expect(agentDiff(input())).toMatchObject({ title: "Agent diff · Control → Experiment 1", badge: "system prompt" });
    expect(agentDiff(input({ winnerLap: 3, laps: [lap(0, null), lap(3, { system_prompt: AFTER })] }))).toMatchObject({ title: "Agent diff · Control → Experiment 3" });
  });

  it("says what the diff shows, and that the person applies the change", () => {
    expect(agentDiff(input())!.sub).toBe("The full system prompt, with the change that made the loop pass. Copy it and apply it to your agent yourself.");
  });

  it("gives the \"Apply it yourself\" note", () => {
    expect(agentDiff(input())!.note).toEqual({ title: "Apply it yourself", text: "Apply the diff in your repo and deploy. Then replay the cohort to confirm." });
  });

  it("says \"the change\" in the text and in the note when the section shows no line diff", () => {
    const d = agentDiff(input({ laps: [lap(0, null), lap(1, { model: "gpt-4.1" })] }))!;
    expect(d.sub).toBe("The change that experiment 1, the winning experiment, made to the agent. Apply it to your agent yourself.");
    expect(d.note).toEqual({ title: "Apply it yourself", text: "Apply the change in your repo and deploy. Then replay the cohort to confirm." });
  });

  it("gives no badge for the system prompt when the winning experiment did not change it", () => {
    expect(agentDiff(input({ laps: [lap(0, null), lap(1, { model: "gpt-4.1" })] }))!.badge).toBeNull();
  });

  it("keeps the text of the diff while the before prompt loads, so that the text does not change when the diff shows", () => {
    const d = agentDiff(input({ before: { loading: true, prompt: null, model: null, modelParams: null } }))!;
    expect(d.sub).toBe(agentDiff(input())!.sub);
    expect(d.note).toEqual(agentDiff(input())!.note);
  });

  it("says to copy the prompt when the section shows the prompt of the winning experiment in full", () => {
    const d = agentDiff(input({ before: { loading: false, prompt: null, model: null, modelParams: null } }))!;
    expect(d.sub).toBe("The change that experiment 1, the winning experiment, made to the agent. Copy it and apply it to your agent yourself.");
    expect(d.note.text).toBe("Apply the change in your repo and deploy. Then replay the cohort to confirm.");
  });

  it("names only the control experiment when it is the winning experiment, and says that there is no change to apply", () => {
    const d = agentDiff(input({ winnerLap: 0 }))!;
    expect(d).toMatchObject({
      title: "Agent diff · Control",
      badge: null,
      sub: "The control experiment is the winning experiment. It made no change to the agent.",
      prompt: { kind: "unchanged", text: "The control experiment did not change the system prompt." },
      chips: ["model unchanged", "parameters unchanged", "tools unchanged"],
      note: { title: "Nothing to apply", text: "The agent passed with no change." },
    });
  });

  // The copied diff of a change from `before` to `after`.
  const copied = (before: string, after: string) => {
    const d = agentDiff(input({ before: { loading: false, prompt: before, model: null, modelParams: null }, laps: [lap(0, null), lap(1, { system_prompt: after })] }))!;
    if (d.prompt.kind !== "diff") throw new Error(`no diff: ${d.prompt.kind}`);
    return d.prompt.copy.text;
  };

  it("gives a unified diff of the system prompt to copy", () => {
    expect(agentDiff(input({ before: { loading: false, prompt: BEFORE + "\n", model: null, modelParams: null }, laps: [lap(0, null), lap(1, { system_prompt: AFTER + "\n" })] }))!.prompt).toMatchObject({
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
    const d = agentDiff(input({ before: { loading: false, prompt: before.join("\n") + "\n", model: null, modelParams: null }, laps: [lap(0, null), lap(1, { system_prompt: after.join("\n") + "\n" })] }))!;
    expect(d.prompt).toMatchObject({
      copy: {
        text: ["--- a/system_prompt", "+++ b/system_prompt", "@@ -1,5 +1,5 @@", " line 1", "-line 2", "+LINE 2", " line 3", " line 4", " line 5", "@@ -18,3 +18,4 @@", " line 18", " line 19", " line 20", "+line 21", ""].join("\n"),
      },
    });
  });

  it("does not count the final newline of a prompt as one more line", () => {
    const d = agentDiff(input({ before: { loading: false, prompt: "old\n", model: null, modelParams: null }, laps: [lap(0, null), lap(1, { system_prompt: "new\n" })] }))!;
    expect(d.prompt).toMatchObject({ countLine: "1 line added · 1 removed · 0 unchanged" });
    expect(copied("old\n", "new\n")).toBe(["--- a/system_prompt", "+++ b/system_prompt", "@@ -1,1 +1,1 @@", "-old", "+new", ""].join("\n"));
  });

  it("marks a last line that has no final newline", () => {
    expect(copied("keep\nold", "keep\nnew")).toBe(["--- a/system_prompt", "+++ b/system_prompt", "@@ -1,2 +1,2 @@", " keep", "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", ""].join("\n"));
  });

  it.each([
    ["a final newline in the two prompts", "one\ntwo\nthree\n", "one\n2\nthree\nfour\n"],
    ["no final newline in the two prompts", "one\ntwo\nthree", "one\n2\nthree"],
    ["no final newline, with a change in the last line", "one\ntwo", "one\n2"],
    ["no final newline, with lines added at the end", "one\ntwo", "one\ntwo\nthree"],
    ["no final newline, with the last line removed", "one\ntwo\nthree", "one\ntwo"],
    ["a final newline that the winning lap adds", "one\ntwo", "one\n2\n"],
    ["a final newline that the winning lap removes", "one\ntwo\n", "zero\none\ntwo"],
    ["a change far from an end with no final newline", ["a", "b", "c", "d", "e", "f", "g", "h"].join("\n"), ["a", "B", "c", "d", "e", "f", "g", "h"].join("\n")],
  ])("gives a diff that git applies to the exact prompt: %s", (_name, before, after) => {
    const dir = mkdtempSync(join(tmpdir(), "agent-diff-"));
    try {
      writeFileSync(join(dir, "system_prompt"), before);
      execFileSync("git", ["apply", "-"], { cwd: dir, input: copied(before, after) });
      expect(readFileSync(join(dir, "system_prompt"), "utf8")).toBe(after);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("names the recorded session that gave the before prompt", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ source: { sessionId: "s1", name: "refund-01" } });
  });

  it("shows a load state for the prompt while the before prompt loads, and the rest of the section", () => {
    const d = agentDiff(input({ before: { loading: true, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({ kind: "loading" });
    expect(d.title).toBe("Agent diff · Control → Experiment 1");
  });

  it("falls back to the prompt of the winning lap in full when no before prompt is available", () => {
    const d = agentDiff(input({ before: { loading: false, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({
      kind: "after-only",
      note: "The recorded sessions use the agent's own setting, which Kitaru doesn't store, so there's no line-by-line diff. Experiment 1, the winning experiment, sets the system prompt to:",
      text: AFTER,
      copy: { label: "Copy prompt", text: AFTER, primary: false },
    });
  });

  it("says that the page could not load the agent's own prompt when the request for it failed, and keeps the fallback", () => {
    const d = agentDiff(input({ before: { loading: false, failed: true, prompt: null, model: null, modelParams: null } }))!;
    expect(d.prompt).toEqual({
      kind: "after-only",
      note: "The page could not load the agent's own prompt, so there's no line-by-line diff. Experiment 1, the winning experiment, sets the system prompt to:",
      text: AFTER,
      copy: { label: "Copy prompt", text: AFTER, primary: false },
    });
  });

  it("makes \"Copy diff\" the one primary button: the copy of a full prompt with no diff is not primary", () => {
    expect(agentDiff(input())!.prompt).toMatchObject({ copy: { label: "Copy diff", primary: true } });
    expect(agentDiff(input({ before: { loading: false, prompt: null, model: null, modelParams: null } }))!.prompt).toMatchObject({ copy: { label: "Copy prompt", primary: false } });
  });

  it("says that the prompt did not change when the winning lap has no system prompt override", () => {
    const d = agentDiff(input({ laps: [lap(0, null), lap(1, { model: "gpt-4.1" })] }))!;
    expect(d.prompt).toEqual({ kind: "unchanged", text: "The winning experiment did not change the system prompt." });
  });

  it("gives an 'unchanged' chip for each field that the winning lap did not override, and always one for the tools", () => {
    const d = agentDiff(input())!;
    expect(d.chips).toEqual(["model unchanged", "parameters unchanged", "tools unchanged"]);
    expect(d.changedFields).toEqual([]);
  });

  it("gives a before and after line for a changed model, and no chip for it", () => {
    const d = agentDiff(input({ laps: [lap(0, null), lap(1, { system_prompt: AFTER, model: "gpt-4.1" })] }))!;
    expect(d.changedFields).toEqual([{ label: "Model", before: "gpt-4.1-mini", after: "gpt-4.1" }]);
    expect(d.chips).toEqual(["parameters unchanged", "tools unchanged"]);
  });

  it("gives a before and after line for changed parameters, with the agent's own setting when the session does not give them", () => {
    const d = agentDiff(input({ laps: [lap(0, null), lap(1, { model_params: { temperature: 0 } })] }))!;
    expect(d.changedFields).toEqual([{ label: "Parameters", before: "the agent's own setting", after: '{"temperature":0}' }]);
    expect(d.chips).toEqual(["model unchanged", "tools unchanged"]);
  });
});

describe("resultsTable", () => {
  const replay = (id: string, passed: boolean) => ({ caseId: id, caseName: `refund-0${id.slice(1)}`, sessionId: `r-${id}`, passed });
  const oneRun = (lists: EvaluatorReplays[]): RunReplays[] => [{ run: 1, status: "completed", unscored: [], evaluatorReplays: lists }];
  const lap = (n: number, over: Partial<ResultsLap> = {}): ResultsLap => ({
    lap: n,
    summary: n === 0 ? "Replay with no changes" : `Change ${n}`,
    running: false,
    runs: [{ status: "completed" }],
    runReplays: oneRun([{ evaluator: "action-correct", replays: [replay("s1", false), replay("s2", true), replay("s3", true)] }]),
    screenGreen: null,
    selectionGate: null,
    confirmationGate: null,
    ...over,
  });
  const loop = (laps: ResultsLap[], over: Partial<Parameters<typeof resultsTable>[0]> = {}) => ({ laps, cases, criteria: null, winnerLap: null, cohortCaseCount: 3, outcome: { kind: "running", title: null, idleDeadline: null } as const, ...over });

  it("has one column for each gating evaluator, and one row for each lap from the baseline lap on", () => {
    const table = resultsTable(loop([lap(0), lap(1)]));
    expect(table.evaluators).toEqual(["action-correct"]);
    expect(table.rows.map((r) => r.lap)).toEqual([0, 1]);
    expect(table.rows[0].cells.map((c) => c?.evaluator)).toEqual(["action-correct"]);
  });

  it("has no column for an evaluator that does not gate", () => {
    // The run has results for "tone" also, but only "action-correct" gates.
    const table = resultsTable(loop([lap(0, { runReplays: oneRun(evaluatorReplays(run, cases, ["action-correct"])) })]));
    expect(table.evaluators).toEqual(["action-correct"]);
  });

  it("shows one square for each replay, in case order, with a name that gives the case and the result", () => {
    const cell = resultsTable(loop([lap(0)])).rows[0].cells[0]!;
    expect(cell.squares).toEqual([
      { caseId: "s1", state: "fail", sessionId: "r-s1", label: "refund-01: failed", name: "refund-01: failed. Open the result session in a new tab" },
      { caseId: "s2", state: "pass", sessionId: "r-s2", label: "refund-02: passed", name: "refund-02: passed. Open the result session in a new tab" },
      { caseId: "s3", state: "pass", sessionId: "r-s3", label: "refund-03: passed", name: "refund-03: passed. Open the result session in a new tab" },
    ]);
  });

  it("says that a square has no result session when the replay has none", () => {
    const lists = [{ evaluator: "action-correct", replays: [{ ...replay("s1", false), sessionId: null }] }];
    expect(resultsTable(loop([lap(0, { runReplays: oneRun(lists) })])).rows[0].cells[0]!.squares).toEqual([{ caseId: "s1", state: "fail", sessionId: null, label: "refund-01: failed", name: "refund-01: failed. No result session" }]);
  });

  it("counts the passed replays, in the failure tone when a replay failed", () => {
    const cell = resultsTable(loop([lap(0)])).rows[0].cells[0]!;
    expect(cell.count).toBe("2 / 3 passed");
    expect(cell.tone).toBe("destructive");
  });

  it("counts in the success tone when all replays passed", () => {
    const all = [{ evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true), replay("s3", true)] }];
    const cell = resultsTable(loop([lap(1, { runReplays: oneRun(all) })])).rows[0].cells[0]!;
    expect(cell.count).toBe("3 / 3 passed");
    expect(cell.tone).toBe("success");
  });

  it('says "first 50 of N" when the cohort has more cases than the server gives results for', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => replay(`s${i + 1}`, i >= 5));
    const cell = resultsTable(loop([lap(0, { runReplays: oneRun([{ evaluator: "action-correct", replays: fifty }]) })], { cohortCaseCount: 120 })).rows[0].cells[0]!;
    expect(cell.count).toBe("45 / 50 passed · first 50 of 120");
  });

  it('does not say "first 50 of N" when a small cohort has a case with no result', () => {
    const cell = resultsTable(loop([lap(0)], { cohortCaseCount: 4 })).rows[0].cells[0]!;
    expect(cell.count).toBe("2 / 3 passed");
  });

  it("shows the lap summary, and lap 0 says that it is the baseline lap", () => {
    const rows = resultsTable(loop([lap(0, { summary: lapSummary("Round 0: baseline audit", 0) }), lap(1, { summary: lapSummary("Round 1: Refund in full after day 30. Hypothesis: h", 1) })])).rows;
    expect(rows.map((r) => r.summary)).toEqual(["Replay with no changes", "Refund in full after day 30."]);
  });

  it('names the control experiment "Control" and a later experiment by its number', () => {
    expect(resultsTable(loop([lap(0), lap(1), lap(2)])).rows.map((r) => r.name)).toEqual(["Control", "1", "2"]);
  });

  it("says which experiment runs while the loop runs", () => {
    const running = { running: true, runs: [{ status: "running" }], runReplays: [] };
    expect(resultsTable(loop([lap(0), lap(1), lap(2, running)])).state).toBe("experiment 2 running…");
    expect(resultsTable(loop([lap(0, running)])).state).toBe("control experiment running…");
  });

  it("says that the loop runs when no experiment runs at the moment", () => {
    expect(resultsTable(loop([lap(0), lap(1)])).state).toBe("loop running…");
  });

  it("says that the loop finished or that a person canceled it, also when an experiment still shows as running", () => {
    const running = { running: true, runs: [{ status: "running" }], runReplays: [] };
    const completed = { kind: "completed", passed: true, winnerLap: 1, title: "Experiment 1 passed", detail: "" } as const;
    expect(resultsTable(loop([lap(0), lap(1), lap(2, running)], { outcome: completed })).state).toBe("loop finished");
    expect(resultsTable(loop([lap(0)], { outcome: { kind: "canceled", title: null } })).state).toBe("loop canceled");
  });

  it("says that a loop failed, and that a Skill Loop with no result has no result", () => {
    expect(resultsTable(loop([lap(0), lap(1)], { outcome: { kind: "failed", title: null } })).state).toBe("loop failed");
    expect(resultsTable(loop([lap(0), lap(1)], { outcome: { kind: "no_result" } })).state).toBe("no result");
  });

  it("names the status words that an experiment and a run can show, for the footer", () => {
    expect(resultsTable(loop([lap(0)])).statusNote).toBe("Status is one of: Not started, Running, Stopping, Stopped, Failed, Completed.");
  });

  it("marks the winning lap, and only that lap", () => {
    const rows = resultsTable(loop([lap(0), lap(1), lap(2)], { winnerLap: 1 })).rows;
    expect(rows.map((r) => r.winning)).toEqual([false, true, false]);
    expect(rows[0].result).toMatchObject({ label: "Control", tone: "neutral" });
    expect(rows[1].result).toMatchObject({ label: "Passed", tone: "success" });
  });

  it("gives each lap the status of its run from the server", () => {
    const rows = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "failed" }], runReplays: [] }), lap(2, { runs: [{ status: "canceled" }], runReplays: [] }), lap(3, { runs: [], runReplays: [] })])).rows;
    expect(rows.map((r) => r.status)).toEqual(["Completed", "Failed", "Stopped", "Not started"]);
  });

  it("gives the lap result from the rule of the MVP view: the baseline lap has no result, a later lap passed or failed", () => {
    const met = { met: true, incomplete: false, meanPassK: 1, belowFloor: [], regressed: [], flaky: [], improved: [], belowTarget: false };
    const criteria = { ...DEFAULT_CRITERIA, trials_per_round: 1, k: 1, confirmation_round: false };
    const rows = resultsTable(loop([lap(0), lap(1, { selectionGate: { ...met, met: false, regressed: ["s1"] } }), lap(2, { selectionGate: met })], { criteria })).rows;
    expect(rows.map((r) => r.result?.label)).toEqual(["Control", "Failed", "Passed"]);
    expect(rows.map((r) => r.result?.tone)).toEqual(["neutral", "destructive", "success"]);
    expect(rows[1].result?.title).toBe("got worse than the control experiment: refund-01");
  });

  it('gives the control experiment the result "Passed" when it is the winning experiment', () => {
    expect(resultsTable(loop([lap(0), lap(1)], { winnerLap: 0 })).rows[0].result).toMatchObject({ label: "Passed", tone: "success" });
  });

  it("gives no lap result when the loop has no rules on the server", () => {
    expect(resultsTable(loop([lap(0), lap(1)])).rows[1].result).toBeNull();
  });

  it("shows a lap with no completed run with its number, summary and run status, and no squares or result", () => {
    const row = resultsTable(loop([lap(0), lap(1, { running: true, runs: [{ status: "running" }], runReplays: [] })], { criteria: DEFAULT_CRITERIA })).rows[1];
    expect(row).toMatchObject({ lap: 1, summary: "Change 1", status: "Running", noResults: "No results yet", result: null });
    expect(row.cells).toEqual([null]);
  });

  it("gives a lap with results no text in the place of the squares", () => {
    expect(resultsTable(loop([lap(0)])).rows[0].noResults).toBeNull();
  });

  it('says "No results yet" for each lap with no completed run, whatever the run status', () => {
    const rows = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "failed" }], runReplays: [] }), lap(2, { runs: [{ status: "canceled" }], runReplays: [] }), lap(3, { runs: [], runReplays: [] })])).rows;
    expect(rows.slice(1).map((r) => r.noResults)).toEqual(["No results yet", "No results yet", "No results yet"]);
  });

  it("says that a completed run gave no results, and does not show it as a lap with no run", () => {
    const row = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "completed" }], runReplays: [] })], { criteria: DEFAULT_CRITERIA, winnerLap: 1 })).rows[1];
    expect(row).toMatchObject({ status: "Completed", noResults: "No results from a gating evaluator", result: null, passRate: null, runs: [] });
    expect(row.cells).toEqual([null]);
  });

  it("gives the status of the completed run when a later run of the lap still runs", () => {
    const row = resultsTable(loop([lap(0, { runs: [{ status: "completed" }, { status: "running" }] })])).rows[0];
    expect(row.status).toBe("Completed");
  });

  // A lap with two completed runs: s1 failed in both, s2 passed in run 1 only, s3 passed in both.
  const twoRuns: RunReplays[] = [
    { run: 1, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s1", false), replay("s2", true), replay("s3", true)] }] },
    { run: 2, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s1", false), { ...replay("s2", false), sessionId: "q-s2" }, replay("s3", true)] }] },
  ];

  describe("pass rate", () => {
    it("gives an experiment with one completed run the share of cases that passed every gating evaluator", () => {
      const lists = [
        { evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true), replay("s3", true), replay("s4", true)] },
        { evaluator: "tone", replays: [replay("s1", true), replay("s2", false), replay("s3", true), replay("s4", true)] },
      ];
      expect(resultsTable(loop([lap(0, { runReplays: oneRun(lists) })])).rows[0].passRate).toBe("75%");
    });

    it("gives an experiment with several runs the share of cases that passed in every completed run", () => {
      expect(resultsTable(loop([lap(0, { runReplays: twoRuns })])).rows[0].passRate).toBe("33.3%");
    });

    it("gives each run row the share of cases that passed in that run", () => {
      expect(resultsTable(loop([lap(0, { runReplays: twoRuns })])).rows[0].runs.map((r) => r.passRate)).toEqual(["66.7%", "33.3%"]);
    });

    it("does not count a case as passed when a gating evaluator gave it no result", () => {
      const lists = [
        { evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true)] },
        { evaluator: "tone", replays: [replay("s1", true)] },
      ];
      expect(resultsTable(loop([lap(0, { runReplays: oneRun(lists) })])).rows[0].passRate).toBe("50%");
    });

    it("counts a case with no result from any gating evaluator as not passed, and the run gets no result", () => {
      const runs: RunReplays[] = [{ run: 1, status: "completed", unscored: ["s2"], evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s1", true)] }] }];
      const row = resultsTable(loop([lap(0, { runReplays: runs })])).rows[0];
      expect(row.passRate).toBe("50%");
      expect(row.runs[0]).toMatchObject({ passRate: "50%", result: { label: "No result" } });
    });

    it("gives no pass rate for a lap with no results", () => {
      expect(resultsTable(loop([lap(0, { runs: [{ status: "running" }], runReplays: [] })])).rows[0].passRate).toBeNull();
    });
  });

  describe("an experiment with more than one completed run", () => {
    const row = resultsTable(loop([lap(0, { runReplays: twoRuns })])).rows[0];

    it("shows one square for each case: passed every run, mixed, or failed every run", () => {
      expect(row.cells[0]!.squares.map((sq) => [sq.caseId, sq.state, sq.label])).toEqual([
        ["s1", "fail", "refund-01: failed every run"],
        ["s2", "mixed", "refund-02: mixed, passed 1 of 2 runs"],
        ["s3", "pass", "refund-03: passed every run"],
      ]);
    });

    it("gives the squares of the experiment row no link, because a link would go to an arbitrary run", () => {
      expect(row.cells[0]!.squares.map((sq) => sq.sessionId)).toEqual([null, null, null]);
      expect(row.cells[0]!.squares[0].name).toBe("refund-01: failed every run. Show the runs to open a result session");
    });

    it('counts the cases that passed every run, and says "passed every run"', () => {
      expect(row.cells[0]).toMatchObject({ count: "1 / 3 passed every run", tone: "destructive" });
    });

    it("does not show a case as passed every run when a run gave it no result, so that the squares agree with the pass rate", () => {
      const runs: RunReplays[] = [
        { run: 1, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s2", true), replay("s3", false)] }] },
        { run: 2, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true)] }] },
      ];
      const r = resultsTable(loop([lap(0, { runReplays: runs })])).rows[0];
      expect(r.cells[0]!.squares.map((sq) => [sq.state, sq.label])).toEqual([
        ["mixed", "refund-01: mixed, passed 1 of 2 runs, no result in 1"],
        ["pass", "refund-02: passed every run"],
        ["fail", "refund-03: failed 1 of 2 runs, no result in 1"],
      ]);
      expect(r.cells[0]!.count).toBe("1 / 3 passed every run");
      expect(r.passRate).toBe("33.3%");
    });

    it("shows the totals of an experiment as not final while the results of a completed run are not loaded", () => {
      const r = resultsTable(loop([lap(0), lap(1, { runs: [{ status: "completed" }, { status: "completed" }] })], { winnerLap: 1 }));
      const row = r.rows[1];
      expect(row.incomplete).toBe("1 of 2 runs loaded");
      expect(row.passRate).toBeNull();
      expect(row.cells[0]).toMatchObject({ count: "2 / 3 passed every run · 1 of 2 runs loaded", tone: "neutral" });
      expect(row.cells[0]!.squares.map((sq) => sq.sessionId)).toEqual([null, null, null]);
      expect(row.result?.title).toBe("This experiment made the loop pass");
      expect(r.rows[0].incomplete).toBeNull();
      expect(r.legend.map((e) => e.label)).toEqual(["Passed every run", "Mixed", "Failed every run"]);
    });

    it("lists one row for each completed run, with its name, squares, count, status and result", () => {
      expect(row.runs.map((r) => [r.run, r.name, r.status, r.cells[0]!.count, r.result.label])).toEqual([
        [1, "Run #1", "Completed", "2 / 3 passed", "Failed"],
        [2, "Run #2", "Completed", "1 / 3 passed", "Failed"],
      ]);
      expect(row.runs[1].cells[0]!.squares.map((sq) => sq.state)).toEqual(["fail", "fail", "pass"]);
    });

    it("gives each square of a run row the link to the result session of its replay", () => {
      expect(row.runs[1].cells[0]!.squares[1]).toEqual({ caseId: "s2", state: "fail", sessionId: "q-s2", label: "refund-02: failed", name: "refund-02: failed. Open the result session in a new tab" });
    });
  });

  it("gives an experiment with one completed run one run row, and keeps the links in the experiment row", () => {
    const row = resultsTable(loop([lap(0)])).rows[0];
    expect(row.runs.map((r) => r.name)).toEqual(["Run #1"]);
    expect(row.cells[0]!.squares.map((sq) => sq.sessionId)).toEqual(["r-s1", "r-s2", "r-s3"]);
  });

  it("gives a run the result Passed only when each case passed every gating evaluator in it", () => {
    const pass = [replay("s1", true), replay("s2", true)];
    const runs: RunReplays[] = [
      { run: 1, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: pass }, { evaluator: "tone", replays: pass }] },
      { run: 2, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: pass }, { evaluator: "tone", replays: [replay("s1", true)] }] },
      { run: 3, status: "completed", unscored: [], evaluatorReplays: [{ evaluator: "action-correct", replays: pass }, { evaluator: "tone", replays: [replay("s1", true), replay("s2", false)] }] },
    ];
    const results = resultsTable(loop([lap(0, { runReplays: runs })])).rows[0].runs.map((r) => r.result);
    expect(results.map((r) => [r.label, r.tone])).toEqual([["Passed", "success"], ["No result", "neutral"], ["Failed", "destructive"]]);
    expect(results[2].title).toBe("1 case failed a gating evaluator in this run");
  });

  it("lists no runs for a lap with no completed run", () => {
    expect(resultsTable(loop([lap(0, { runs: [{ status: "running" }], runReplays: [] })])).rows[0].runs).toEqual([]);
  });

  describe("legend", () => {
    it('says "Passed" and "Failed", with no "Mixed" entry, when no experiment of the loop has more than one completed run', () => {
      expect(resultsTable(loop([lap(0), lap(1)])).legend).toEqual([{ state: "pass", label: "Passed" }, { state: "fail", label: "Failed" }]);
    });

    it('says "Passed every run", "Mixed" and "Failed every run" when an experiment has more than one completed run', () => {
      expect(resultsTable(loop([lap(0), lap(1, { runReplays: twoRuns })])).legend).toEqual([{ state: "pass", label: "Passed every run" }, { state: "mixed", label: "Mixed" }, { state: "fail", label: "Failed every run" }]);
    });
  });

  describe('the tooltip of a "Passed" badge', () => {
    it("gives the reason when the pass rate of the winning experiment is below 100% over more than one run", () => {
      const row = resultsTable(loop([lap(0), lap(1, { runReplays: twoRuns })], { winnerLap: 1 })).rows[1];
      expect(row.result).toMatchObject({ label: "Passed", title: "This experiment made the loop pass. The pass rate is 33.3% because it counts all 2 completed runs, and a case did not pass in one or more of them." });
    });

    it("gives the reason for an experiment with one completed run also", () => {
      expect(resultsTable(loop([lap(0), lap(1)], { winnerLap: 1 })).rows[1].result?.title).toBe("This experiment made the loop pass. The pass rate is 66.7% because the rules of the loop let the experiment pass with a case that did not pass.");
    });

    it("gives no reason when the pass rate is 100%", () => {
      const all = oneRun([{ evaluator: "action-correct", replays: [replay("s1", true), replay("s2", true)] }]);
      expect(resultsTable(loop([lap(0), lap(1, { runReplays: all })], { winnerLap: 1 })).rows[1].result?.title).toBe("This experiment made the loop pass");
    });
  });

  it('says what "Show runs" lists, for the footer', () => {
    expect(resultsTable(loop([lap(0)])).runsNote).toBe('"Show runs" lists each completed run of the experiment, with the squares, the pass rate, the status and the result of that run.');
  });
});

describe("finalResults", () => {
  type FinalLap = FinalResultsLoop["laps"][number];
  const CASE_IDS = ["s1", "s2", "s3", "s4"];

  // One lap from the pass (1) and fail (0) results of each gating evaluator, in case order.
  function finalLap(lap: number, results: Record<string, number[]>, more: Partial<FinalLap> = {}): FinalLap {
    return {
      lap,
      runs: [],
      evaluatorReplays: Object.entries(results).map(([evaluator, passes]) => ({
        evaluator,
        replays: passes.map((p, i) => ({ caseId: CASE_IDS[i], caseName: `refund-0${i + 1}`, sessionId: null, passed: p === 1 })),
      })),
      ...more,
    };
  }

  const criteria = { max_rounds: 4 };
  const passed = { kind: "completed", passed: true, winnerLap: 2, title: "Experiment 2 passed", detail: "It met every check across 1 runs." } as const;
  const notPassed = { kind: "completed", passed: false, winnerLap: null, title: "No experiment passed", detail: "The loop ran all 4 experiments it was allowed after the control." } as const;

  // Lap 1 fixes two cases and breaks the fourth. Lap 2 passes each case.
  const laps = [
    finalLap(0, { "action-correct": [0, 0, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T10:03:00Z" }] }),
    finalLap(1, { "action-correct": [1, 1, 1, 0] }, { runs: [{ started_at: "2026-01-01T10:04:00Z", ended_at: "2026-01-01T10:08:00Z" }] }),
    finalLap(2, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:09:00Z", ended_at: "2026-01-01T10:12:05Z" }, { started_at: "2026-01-01T10:09:30Z", ended_at: null }] }),
  ];
  const passedLoop: FinalResultsLoop = { outcome: passed, laps, totalLaps: 3, criteria };
  // The first two laps in a loop that did not pass: lap 1 has the highest pass rate.
  const notPassedLoop: FinalResultsLoop = {
    outcome: notPassed,
    laps: [laps[0], laps[1], finalLap(2, { "action-correct": [1, 0, 1, 0] })],
    totalLaps: 3,
    criteria,
  };

  it("gives no section for a running loop and a canceled loop", () => {
    expect(finalResults({ ...passedLoop, outcome: { kind: "running", title: null, idleDeadline: null } })).toBeNull();
    expect(finalResults({ ...passedLoop, outcome: { kind: "canceled", title: null } })).toBeNull();
  });

  it("gives no section for a loop with no laps", () => {
    expect(finalResults({ ...passedLoop, laps: [], totalLaps: 0 })).toBeNull();
  });

  it("names the winning lap and the duration in the heading of a loop that passed", () => {
    const r = finalResults(passedLoop)!;
    expect(r.badge).toEqual({ label: "Passed", tone: "success" });
    expect(r.line).toBe("Experiment 2 passed · 12 min. It met every check across 1 runs.");
  });

  it("names the best lap in the heading of a loop that did not pass, with a neutral badge", () => {
    const r = finalResults(notPassedLoop)!;
    expect(r.badge).toEqual({ label: "Not passed", tone: "neutral" });
    expect(r.line).toBe("No experiment passed · Best experiment: experiment 1 · 8 min. The loop ran all 4 experiments it was allowed after the control.");
  });

  it("measures the duration from the earliest run start to the latest run end, in hours for a long loop", () => {
    const long = [
      finalLap(0, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T12:00:00Z", ended_at: "2026-01-01T12:30:00Z" }] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1] }, { runs: [{ started_at: "2026-01-01T10:00:00Z", ended_at: "2026-01-01T11:00:00Z" }] }),
    ];
    expect(finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1, title: "Experiment 1 passed" }, laps: long, totalLaps: 2 })!.line).toBe("Experiment 1 passed · 2 h 30 min. It met every check across 1 runs.");
  });

  it("leaves the duration out when no run has a start and an end", () => {
    const noTimes = laps.map((l) => ({ ...l, runs: [] }));
    expect(finalResults({ ...passedLoop, laps: noTimes })!.line).toBe("Experiment 2 passed. It met every check across 1 runs.");
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
    expect(r.cards.map((c) => c.label)).toEqual(["action-correct", "tone", "Got worse", "Experiments"]);
  });

  it("uses the best lap for the cards of a loop that did not pass", () => {
    expect(finalResults(notPassedLoop)!.cards[0]).toEqual({ label: "action-correct", value: "75%", sub: "3 of 4 · was 2 of 4" });
  });

  it("does not use the baseline lap as the best lap, also when no later lap has a higher pass rate", () => {
    const worse = { ...notPassedLoop, laps: [laps[0], finalLap(1, { "action-correct": [1, 0, 0, 0] })], totalLaps: 2 };
    const r = finalResults(worse)!;
    expect(r.line).toContain("Best experiment: experiment 1");
    expect(r.cards[0]).toEqual({ label: "action-correct", value: "25%", sub: "1 of 4 · was 2 of 4" });
  });

  it("does not count a case as got worse when a gating evaluator gave it no result", () => {
    const partial = finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 1] });
    const r = finalResults({ ...notPassedLoop, laps: [laps[0], partial], totalLaps: 2 })!;
    // No result is not a failure, so those cases did not get worse.
    expect(r.cards.find((c) => c.label === "Got worse")).toMatchObject({ value: "0" });
  });

  it("does not count a case as passed when a gating evaluator gave it no result", () => {
    // Experiment 1 has no failure, but two cases have no result from "tone": 2 of 4 passed. Experiment 2: 3 of 4.
    const partial = finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 1] });
    const full = finalLap(2, { "action-correct": [1, 1, 1, 0], tone: [1, 1, 1, 1] });
    const r = finalResults({ ...notPassedLoop, laps: [laps[0], partial, full] })!;
    expect(r.line).toContain("Best experiment: experiment 2");
  });

  it("names no best lap when only the baseline lap has a score", () => {
    const r = finalResults({ ...notPassedLoop, laps: [laps[0]], totalLaps: 1 })!;
    expect(r.line).not.toContain("Best experiment");
    expect(r.cards.map((c) => c.label)).toEqual(["Experiments"]);
  });

  it("counts the cases that got worse: passed in the baseline lap and failed in the lap in use", () => {
    expect(finalResults(passedLoop)!.cards[1]).toEqual({ label: "Got worse", value: "0", sub: "of 4 cases, control experiment to experiment 2" });
    expect(finalResults(notPassedLoop)!.cards[1]).toEqual({ label: "Got worse", value: "1", sub: "of 4 cases, control experiment to experiment 1" });
  });

  it("counts a case as got worse when it fails one of two gating evaluators", () => {
    const two = [
      finalLap(0, { "action-correct": [1, 1, 1, 1], tone: [1, 1, 1, 1] }),
      finalLap(1, { "action-correct": [1, 1, 1, 1], tone: [1, 0, 1, 1] }),
    ];
    const r = finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 1 }, laps: two, totalLaps: 2 })!;
    expect(r.cards.find((c) => c.label === "Got worse")!.value).toBe("1");
  });

  it("names no change and no second experiment when the control experiment is the winning experiment", () => {
    const r = finalResults({ ...passedLoop, outcome: { ...passed, winnerLap: 0, title: "The control passed" } })!;
    expect(r.cards.find((c) => c.label === "Got worse")).toEqual({ label: "Got worse", value: "0", sub: "of 4 cases" });
    expect(r.note.text).toBe("The loop only changed its own copy.");
  });

  it("gives the laps after the control experiment, with the limit from the loop settings", () => {
    expect(finalResults(passedLoop)!.cards[2]).toEqual({ label: "Experiments", value: "2", sub: "after the control experiment · limit 4" });
  });

  it("gives no limit on the Laps card for a loop with no settings", () => {
    expect(finalResults({ ...passedLoop, criteria: null })!.cards[2]).toEqual({ label: "Experiments", value: "2", sub: "after the control experiment" });
  });

  it("says that the agent was not changed, and points to the diff only for a loop that passed", () => {
    expect(finalResults(passedLoop)!.note).toEqual({ title: "Nothing was changed in your agent", text: "The loop only changed its own copy. The change of the winning experiment is below." });
    expect(finalResults(notPassedLoop)!.note).toEqual({ title: "Nothing was changed in your agent", text: "The loop only changed its own copy." });
  });
});

describe("runResults", () => {
  const verdict = (passed: boolean | null, value: string | null = null) => ({ score: null, value, passed, min_score: null, max_score: null, target_score: null });
  const aggregate = (over: Partial<EvalAggregate>): EvalAggregate => ({ name: "check", evaluator_name: "action-correct", data_type: "bool", replays: [], ...over }) as EvalAggregate;
  const replays = [
    { id: "p1", baseline_session_id: "s1", result_session_id: "r1", status: "completed" },
    { id: "p2", baseline_session_id: "s2", result_session_id: "r2", status: "completed" },
  ] as Replay[];

  it("reads the pass or fail results of a bool evaluator", () => {
    const agg = aggregate({ replays: [{ replay_id: "p1", result: verdict(true) }, { replay_id: "p2", result: verdict(false) }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([agg], replays, ["action-correct"]);
    expect([...passed]).toEqual([["s1", true], ["s2", false]]);
    expect(cells.get("s1")).toEqual({ sessionId: "r1", results: [{ evaluator: "action-correct", passed: true }] });
  });

  // The pedac loop: the evaluator gives the text "pass" or "fail" and sets the passed flag.
  it("reads the pass or fail results of a text evaluator that sets the passed flag", () => {
    const agg = aggregate({ data_type: "str", replays: [{ replay_id: "p1", result: verdict(true, "pass") }, { replay_id: "p2", result: verdict(false, "fail") }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([agg], replays, ["action-correct"]);
    expect([...passed]).toEqual([["s1", true], ["s2", false]]);
    expect(cells.get("s2")?.results).toEqual([{ evaluator: "action-correct", passed: false }]);
  });

  it("gives no result for a replay that has no passed flag, and keeps the case", () => {
    const agg = aggregate({ data_type: "str", replays: [{ replay_id: "p1", result: verdict(true, "pass") }, { replay_id: "p2", result: null }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([agg], replays, ["action-correct"]);
    expect([...passed]).toEqual([["s1", true], ["s2", null]]);
    expect(cells.has("s2")).toBe(false);
  });

  it("gives a case no score when one required evaluator gave it no result", () => {
    const action = aggregate({ replays: [{ replay_id: "p1", result: verdict(true) }, { replay_id: "p2", result: verdict(true) }] as EvalAggregate["replays"] });
    const tone = aggregate({ name: "tone", evaluator_name: "tone", replays: [{ replay_id: "p1", result: verdict(true) }, { replay_id: "p2", result: verdict(null) }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([action, tone], replays, undefined);
    expect([...passed]).toEqual([["s1", true], ["s2", null]]);
    expect(cells.get("s2")?.results).toEqual([{ evaluator: "action-correct", passed: true }]);
  });

  it("fails a case that one required evaluator failed, also when a second gave it no result", () => {
    const action = aggregate({ replays: [{ replay_id: "p1", result: verdict(false) }] as EvalAggregate["replays"] });
    const tone = aggregate({ name: "tone", evaluator_name: "tone", replays: [{ replay_id: "p1", result: null }, { replay_id: "p2", result: verdict(true) }] as EvalAggregate["replays"] });
    expect([...runResults([action, tone], replays, undefined).passed]).toEqual([["s1", false], ["s2", null]]);
  });

  it("requires an evaluator of the gating list that gave no result at all", () => {
    const action = aggregate({ replays: [{ replay_id: "p1", result: verdict(true) }, { replay_id: "p2", result: verdict(false) }] as EvalAggregate["replays"] });
    const tone = aggregate({ name: "tone", evaluator_name: "tone", replays: [{ replay_id: "p1", result: verdict(null) }, { replay_id: "p2", result: null }] as EvalAggregate["replays"] });
    const { passed, evaluators } = runResults([action, tone], replays, ["action-correct", "tone"]);
    expect([...passed]).toEqual([["s1", null], ["s2", false]]);
    expect(evaluators).toEqual(["action-correct", "tone"]);
  });

  it("does not require a metric in a loop with no gating list", () => {
    const action = aggregate({ replays: [{ replay_id: "p1", result: verdict(true) }] as EvalAggregate["replays"] });
    const cost = aggregate({ name: "cost", evaluator_name: "cost", data_type: "float", replays: [{ replay_id: "p1", result: { ...verdict(null), score: 0.4 } }] as EvalAggregate["replays"] });
    const { passed, evaluators } = runResults([action, cost], replays, undefined);
    expect([...passed]).toEqual([["s1", true]]);
    expect(evaluators).toEqual(["action-correct"]);
  });

  it("ignores an evaluator that gives no pass or fail result", () => {
    const agg = aggregate({ data_type: "float", replays: [{ replay_id: "p1", result: { ...verdict(null), score: 0.4 } }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([agg], replays, undefined);
    expect(passed.size).toBe(0);
    expect(cells.size).toBe(0);
  });

  it("does not let an evaluator outside the gating list decide if a case passed", () => {
    const agg = aggregate({ evaluator_name: "tone", replays: [{ replay_id: "p1", result: verdict(false) }] as EvalAggregate["replays"] });
    const { passed, cells } = runResults([agg], replays, ["action-correct"]);
    expect(passed.size).toBe(0);
    expect(cells.get("s1")?.results).toEqual([{ evaluator: "tone", passed: false }]);
  });
});

describe("a required evaluator that gave no result", () => {
  const cells = new Map<string, RunCell>([["s1", { sessionId: "r1", results: [{ evaluator: "action-correct", passed: true }] }]]);
  const lists = evaluatorReplays(cells, cases, ["action-correct", "tone"], ["action-correct", "tone"]);

  it("gets an empty list of replays", () => {
    expect(lists.map((e) => [e.evaluator, e.replays.length])).toEqual([["action-correct", 1], ["tone", 0]]);
  });

  it("gives the case no result in the Results section, and its column no squares", () => {
    const lap = { lap: 0, summary: "", running: false, screenGreen: null, selectionGate: null, confirmationGate: null, runs: [{ status: "completed" }], runReplays: [{ run: 1, status: "completed", unscored: [], evaluatorReplays: lists }] } as unknown as ResultsLap;
    const row = resultsTable({ laps: [lap], cases, criteria: null, winnerLap: null, cohortCaseCount: 3, outcome: { kind: "running", title: null, idleDeadline: null } }).rows[0];
    expect(row.noResults).toBeNull();
    expect(row.cells.map((c) => c?.evaluator ?? null)).toEqual(["action-correct", null]);
    expect(row.runs.map((r) => r.result.label)).toEqual(["No result"]);
  });
});
