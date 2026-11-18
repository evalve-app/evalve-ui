// The loop results view model: what the three sections of the loop page show
// in the MVP view (Results, Final results, Agent diff). Each function takes
// plain loop data and returns what one section shows, with all text that
// depends on server data already made. The section components only lay it out.
import type { EvalAggregate, Replay } from "../api/client";
import type { CellRun } from "./cellTarget";
import { diffLines, type DiffLine } from "./diff";
import { formatLongDuration, formatPercent } from "./format";
import type { Gate } from "./loopRules";
import { experimentName, isGating, type Criteria } from "./loops";
import type { LoopOutcome } from "./loopStatus";

// One case of the loop's cohort: the id of its recorded session, and its name.
export type CaseInfo = { id: string; name: string };

// One replay of one case, as one gating evaluator scored it.
export type ReplayResult = { caseId: string; caseName: string; sessionId: string | null; passed: boolean };

// The replays of one gating evaluator in one lap, in case order.
export type EvaluatorReplays = { evaluator: string; replays: ReplayResult[] };

// One case in one run: its result session and its pass/fail evaluator results.
export type RunCell = Pick<CellRun, "sessionId" | "results">;

// One run's results.
// - `cells`: by case id, each pass/fail result of the case, for the grid.
// - `passed`: by case id, did the case pass each required evaluator? False: an
//   evaluator failed it. Null: no evaluator failed it, but one or more gave it
//   no result, so the case has no score for this run. It stays in the map so
//   that the lap is not complete without it.
// - `evaluators`: the names of the required evaluators.
// A case id is the id of the recorded session, or the replay id when the
// replay is not in `replays`. A replay result with no passed flag is no
// result: it is not a failure.
//
// The required evaluators: each evaluator of the run that the gating list
// names, also when it gave no result. For a loop with no gating list, and for
// an evaluator with no name, each evaluator that gave a pass/fail result. An
// evaluator of each data type can set the passed flag. One that sets no flag
// is a metric, which doesn't gate here.
export function runResults(aggregates: EvalAggregate[], replays: Replay[], gatingEvaluators: string[] | undefined): { passed: Map<string, boolean | null>; cells: Map<string, RunCell>; evaluators: string[] } {
  const byReplay = new Map(replays.map((x) => [x.id, x]));
  const caseId = (replayId: string) => byReplay.get(replayId)?.baseline_session_id ?? replayId;
  const cells = new Map<string, RunCell>();
  // Per case: the result of each required evaluator that gave one.
  const required = new Map<string, boolean[]>();
  const evaluators: string[] = [];
  for (const agg of aggregates) {
    const gaveResult = !!agg.replays?.some((rep) => rep.result?.passed != null);
    const named = !!gatingEvaluators && !!agg.evaluator_name;
    const isRequired = named ? gatingEvaluators.includes(agg.evaluator_name!) : gaveResult;
    if (isRequired) evaluators.push(agg.evaluator_name ?? UNNAMED);
    for (const rep of agg.replays ?? []) {
      const key = caseId(rep.replay_id);
      if (isRequired && !required.has(key)) required.set(key, []);
      const ok = rep.result?.passed;
      if (ok == null) continue;
      const replay = byReplay.get(rep.replay_id);
      const cell = cells.get(key) ?? { sessionId: replay?.result_session_id ?? null, results: [] };
      cell.results.push({ evaluator: agg.evaluator_name ?? null, passed: ok });
      cells.set(key, cell);
      if (isRequired) required.get(key)!.push(ok);
    }
  }
  const passed = new Map<string, boolean | null>();
  for (const [key, list] of required) passed.set(key, list.includes(false) ? false : list.length === evaluators.length ? true : null);
  return { passed, cells, evaluators };
}

// A pass/fail result with no evaluator name gates (see isGating), so it needs a name to show.
const UNNAMED = "Unnamed evaluator";

// The per-evaluator replay lists of one lap, from one run of the lap (the loop
// data hook gives the first completed run). `cases` sets the order, so each
// lap of a loop has the same order. A case with no result in the run is left
// out. Evaluators follow the loop's gating list, or name order with no list.
// A `required` evaluator (see runResults) that gave no result gets an empty
// list, so that no case counts as a pass without it.
export function evaluatorReplays(run: Map<string, RunCell> | undefined, cases: CaseInfo[], gatingEvaluators: string[] | undefined, required: string[] = []): EvaluatorReplays[] {
  if (!run) return [];
  const lists = new Map<string, ReplayResult[]>(required.map((name) => [name, []]));
  for (const cs of cases) {
    const cell = run.get(cs.id);
    for (const r of cell?.results ?? []) {
      if (!isGating(gatingEvaluators, r.evaluator)) continue;
      const name = r.evaluator ?? UNNAMED;
      const list = lists.get(name) ?? [];
      list.push({ caseId: cs.id, caseName: cs.name, sessionId: cell!.sessionId, passed: r.passed });
      lists.set(name, list);
    }
  }
  const rank = (name: string) => {
    const i = gatingEvaluators?.indexOf(name) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...lists]
    .map(([evaluator, replays]) => ({ evaluator, replays }))
    .sort((a, b) => rank(a.evaluator) - rank(b.evaluator) || a.evaluator.localeCompare(b.evaluator));
}

// One completed run of a lap: the run number, the run status from the server,
// and the replays of each gating evaluator in case order. `unscored` holds the
// ids of the cases of the run that are in no list: no gating evaluator gave a
// pass/fail result for them. Such a case is not a pass and not a failure.
export type RunReplays = { run: number; status: string; evaluatorReplays: EvaluatorReplays[]; unscored: string[] };

// The replays of each run of one lap that has results, oldest run first.
// `results` holds, by run id, what runResults gives for the run. The loop data hook loads results only for a completed run,
// so a run with no entry is left out.
export function runReplays(
  runs: { id: string; number: number; status: string }[],
  results: Map<string, { cells: Map<string, RunCell>; evaluators: string[]; passed: Map<string, boolean | null> }>,
  cases: CaseInfo[],
  gatingEvaluators: string[] | undefined,
): RunReplays[] {
  return [...runs]
    .sort((a, b) => a.number - b.number)
    .flatMap((r) => {
      const found = results.get(r.id);
      if (!found) return [];
      const lists = evaluatorReplays(found.cells, cases, gatingEvaluators, found.evaluators);
      const listed = new Set(lists.flatMap((e) => e.replays.map((x) => x.caseId)));
      return [{ run: r.number, status: r.status, evaluatorReplays: lists, unscored: [...found.passed.keys()].filter((id) => !listed.has(id)) }];
    });
}

// The replays that passed.
const passedCount = (replays: ReplayResult[]) => replays.filter((r) => r.passed).length;

// Case id → did the case pass every gating evaluator in the lap? Empty for a lap with no score.
// False: a gating evaluator failed the case. Null: no evaluator failed it, but
// one or more gave no result, so the case is not a pass and not a failure.
function casePasses(lists: EvaluatorReplays[]): Map<string, boolean | null> {
  const results = new Map<string, boolean[]>();
  for (const e of lists) for (const r of e.replays) results.set(r.caseId, [...(results.get(r.caseId) ?? []), r.passed]);
  return new Map([...results].map(([id, list]) => [id, list.includes(false) ? false : list.length === lists.length ? true : null]));
}

const passCount = (passes: Map<string, boolean | null>) => [...passes.values()].filter((ok) => ok === true).length;

// Agent diff section

// The fields of a lap's override that the Agent diff section reads.
export type AgentDiffOverride = { system_prompt?: string | null; model?: string | Record<string, string> | null; model_params?: Record<string, unknown> | null };

// One lap, as the Agent diff section reads it.
export type AgentDiffLap = { lap: number; override: AgentDiffOverride | null | undefined };

// The agent's own settings, from the first LLM step of a recorded session.
// `loading` is true while the request runs. A value is null when the session
// does not give it. `failed` is true after a failed request, and then all values are null.
export type AgentBefore = { loading: boolean; failed?: boolean; prompt: string | null; model: string | null; modelParams: Record<string, unknown> | null };

export type AgentDiffInput = {
  winnerLap: number | null;
  laps: AgentDiffLap[];
  firstCase: CaseInfo | null; // the recorded session that gives the "before" prompt
  before: AgentBefore;
};

// One line of the full prompt. A removed line has no new number, an added line has no old number.
export type PromptDiffLine = { kind: DiffLine["kind"]; oldNumber: number | null; newNumber: number | null; sign: "+" | "−" | " "; text: string };

// What the copy button copies. Only "Copy diff" is primary, so the page has one primary button.
export type AgentDiffCopy = { label: string; text: string; primary: boolean };

export type AgentDiffPrompt =
  | { kind: "loading" }
  // The agent's own prompt against the prompt of the winning lap.
  // `countLine` gives the numbers of added, removed and unchanged lines.
  | { kind: "diff"; lines: PromptDiffLine[]; countLine: string; copy: AgentDiffCopy; source: { sessionId: string; name: string } | null }
  // No "before" prompt: the prompt of the winning lap in full.
  | { kind: "after-only"; note: string; text: string; copy: AgentDiffCopy }
  | { kind: "unchanged"; text: string };

export type AgentDiff = {
  title: string; // names the two states that the diff compares: the control experiment and the winning lap
  badge: string | null; // the field that the diff is of. Null when the winning lap did not change the system prompt.
  sub: string; // the sentence below the title: what the section shows
  prompt: AgentDiffPrompt;
  chips: string[]; // one for each field that the winning lap did not override
  changedFields: { label: string; before: string; after: string }[]; // model and parameters, when the winning lap overrides them
  note: { title: string; text: string }; // the dashboard does not change the agent
};

const OWN_SETTING = "the agent's own setting";
const UNIFIED_CONTEXT = 3;

// What the Agent diff section shows, or null for no section: a loop with no
// winning lap, or a winning lap that is not in `laps`.
export function agentDiff({ winnerLap, laps, firstCase, before }: AgentDiffInput): AgentDiff | null {
  const winning = winnerLap == null ? undefined : laps.find((l) => l.lap === winnerLap);
  if (!winning) return null;
  const o = winning.override ?? {};
  const after = o.system_prompt || null;
  const hasParams = !!o.model_params && Object.keys(o.model_params).length > 0;

  let prompt: AgentDiffPrompt;
  const isControl = winning.lap === 0;
  if (after == null) prompt = { kind: "unchanged", text: `The ${isControl ? "control" : "winning"} experiment did not change the system prompt.` };
  else if (before.loading) prompt = { kind: "loading" };
  else if (!before.prompt)
    prompt = {
      kind: "after-only",
      // A failed request does not show that Kitaru has no prompt, so it has its own note.
      note: `${before.failed ? "The page could not load the agent's own prompt" : "The recorded sessions use the agent's own setting, which Kitaru doesn't store"}, so there's no line-by-line diff. ${experimentName(winning.lap)}, the winning experiment, sets the system prompt to:`,
      text: after,
      copy: { label: "Copy prompt", text: after, primary: false },
    };
  else if (before.prompt === after) prompt = { kind: "unchanged", text: "The system prompt of the winning experiment is the same as the agent's own prompt." };
  else {
    // A final newline ends the last line. It is not one more empty line.
    const old = withoutFinalNewline(before.prompt);
    const now = withoutFinalNewline(after);
    const diff = diffLines(old.text, now.text);
    let oldNumber = 0;
    let newNumber = 0;
    const lines = diff.map((l): PromptDiffLine => {
      if (l.kind === "add") return { kind: l.kind, oldNumber: null, newNumber: ++newNumber, sign: "+", text: l.text };
      if (l.kind === "del") return { kind: l.kind, oldNumber: ++oldNumber, newNumber: null, sign: "−", text: l.text };
      return { kind: l.kind, oldNumber: ++oldNumber, newNumber: ++newNumber, sign: " ", text: l.text };
    });
    const count = (kind: DiffLine["kind"]) => lines.filter((l) => l.kind === kind).length;
    const added = count("add");
    prompt = {
      kind: "diff",
      lines,
      countLine: `${added} ${added === 1 ? "line" : "lines"} added · ${count("del")} removed · ${count("same")} unchanged`,
      copy: { label: "Copy diff", text: unifiedDiff(diff, old.newline, now.newline), primary: true },
      source: firstCase ? { sessionId: firstCase.id, name: firstCase.name } : null,
    };
  }

  const changedFields: AgentDiff["changedFields"] = [];
  if (o.model) changedFields.push({ label: "Model", before: before.model ?? OWN_SETTING, after: settingText(o.model) });
  if (hasParams) changedFields.push({ label: "Parameters", before: before.modelParams && Object.keys(before.modelParams).length ? settingText(before.modelParams) : OWN_SETTING, after: settingText(o.model_params) });

  // An experiment has no override for tools, so the tools never change.
  const chips = [o.model ? null : "model unchanged", hasParams ? null : "parameters unchanged", "tools unchanged"].filter((c): c is string => !!c);
  // "The diff" is correct only when the section shows a line diff. A change of
  // the model or the parameters, and a prompt with no "before" side, are "the change".
  // The load state uses the text of the diff, which is the usual result, so
  // that the text does not change when the diff shows.
  const showsDiff = prompt.kind === "diff" || prompt.kind === "loading";
  const toApply = showsDiff ? "diff" : "change";
  if (isControl)
    return {
      title: `Agent diff · ${experimentName(0, "short")}`,
      badge: null,
      sub: "The control experiment is the winning experiment. It made no change to the agent.",
      prompt,
      chips,
      changedFields,
      note: { title: "Nothing to apply", text: "The agent passed with no change." },
    };
  return {
    title: `Agent diff · ${experimentName(0, "short")} → ${experimentName(winning.lap)}`,
    badge: after == null ? null : "system prompt",
    sub: showsDiff
      ? "The full system prompt, with the change that made the loop pass. Copy it and apply it to your agent yourself."
      : `The change that ${experimentName(winning.lap, "inline")}, the winning experiment, made to the agent. ${prompt.kind === "after-only" ? "Copy it and apply" : "Apply"} it to your agent yourself.`,
    prompt,
    chips,
    changedFields,
    note: { title: "Apply it yourself", text: `Apply the ${toApply} in your repo and deploy. Then replay the cohort to confirm.` },
  };
}

const settingText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

const withoutFinalNewline = (text: string) => (text.endsWith("\n") ? { text: text.slice(0, -1), newline: true } : { text, newline: false });

const NO_NEWLINE = "\\ No newline at end of file";

// A unified diff that `git apply` and `patch` read: one hunk for each group of
// changes, with UNIFIED_CONTEXT unchanged lines around it. `oldNewline` and
// `newNewline` say if the last line of each text ends with a newline. A last
// line with no newline gets the marker that the format requires.
function unifiedDiff(diff: DiffLine[], oldNewline: boolean, newNewline: boolean): string {
  const lines = [...diff];
  // The index of the last old line (side "add" is not old) or the last new line.
  const last = (side: "add" | "del") => lines.reduce((found, l, i) => (l.kind !== side ? i : found), -1);
  // An unchanged line is a changed line when its newline is not the same in the
  // two texts: the last line of one text, with no newline there, and a line
  // with a newline in the other text.
  const lastOld = last("add");
  const lastNew = last("del");
  const changed = lastOld === lastNew ? (oldNewline !== newNewline ? lastOld : -1) : lastOld > lastNew ? (newNewline ? -1 : lastNew) : oldNewline ? -1 : lastOld;
  if (changed >= 0 && lines[changed].kind === "same") lines.splice(changed, 1, { kind: "del", text: lines[changed].text }, { kind: "add", text: lines[changed].text });
  const oldEnd = oldNewline ? -1 : last("add");
  const newEnd = newNewline ? -1 : last("del");

  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind !== "same") for (let k = Math.max(0, i - UNIFIED_CONTEXT); k <= Math.min(lines.length - 1, i + UNIFIED_CONTEXT); k++) keep[k] = true;
  });
  const out = ["--- a/system_prompt", "+++ b/system_prompt"];
  let oldSeen = 0; // old and new lines before the current line
  let newSeen = 0;
  for (let i = 0; i < lines.length; ) {
    if (!keep[i]) {
      oldSeen++;
      newSeen++;
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && keep[end]) end++;
    const hunk = lines.slice(i, end);
    const oldCount = hunk.filter((l) => l.kind !== "add").length;
    const newCount = hunk.filter((l) => l.kind !== "del").length;
    // A side with no lines gives the line before the hunk, as the format requires.
    out.push(`@@ -${oldCount ? oldSeen + 1 : oldSeen},${oldCount} +${newCount ? newSeen + 1 : newSeen},${newCount} @@`);
    hunk.forEach((l, k) => {
      out.push(`${l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}${l.text}`);
      if (i + k === oldEnd || i + k === newEnd) out.push(NO_NEWLINE);
    });
    oldSeen += oldCount;
    newSeen += newCount;
    i = end;
  }
  return out.join("\n") + "\n";
}

// Results table

// What the Results table needs of one lap. The `Lap` of the loop data hook fits.
export type ResultsLap = {
  lap: number;
  summary: string;
  running: boolean;
  runs: { status: string }[]; // oldest first
  runReplays: RunReplays[]; // the completed runs whose results are loaded, oldest first
  screenGreen: boolean | null;
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

// What a square shows. In a run row: the result of the replay. In an experiment
// row: the result of the case across the completed runs of the experiment.
// "mixed": the case passed in some runs and failed in others.
export type SquareState = "pass" | "mixed" | "fail";

// One case as a square. `label` gives the case and the result. `name` is the
// accessible name of the square: the label, and what the square opens.
// `sessionId` is the result session that the square opens, or null for no link.
export type ResultsSquare = { caseId: string; state: SquareState; sessionId: string | null; label: string; name: string };

export type ResultsCell = {
  evaluator: string;
  squares: ResultsSquare[]; // in case order
  count: string; // "18 / 23 passed", or "18 / 23 passed every run"
  tone: "success" | "destructive" | "neutral"; // neutral: the count is not final
};

// The server gives evaluation values for only the 50 most recent replays of a
// run. A cohort with more cases gets 50 squares, and the count says so.
const REPLAY_LIMIT = 50;

function countText(squares: ResultsSquare[], passedWord: string, cohortCaseCount: number | null): Pick<ResultsCell, "count" | "tone"> {
  const n = squares.length;
  const passed = squares.filter((sq) => sq.state === "pass").length;
  const cut = n >= REPLAY_LIMIT && cohortCaseCount != null && cohortCaseCount > n;
  // Several runs can give results for different cases, so their squares can be more than one run gives.
  const cutText = n === REPLAY_LIMIT ? `first ${n} of ${cohortCaseCount}` : `${n} of ${cohortCaseCount} cases`;
  return { count: `${passed} / ${n} ${passedWord}${cut ? ` · ${cutText}` : ""}`, tone: passed === n ? "success" : "destructive" };
}

// A square of one replay. It opens the result session of the replay.
function replaySquare(r: ReplayResult): ResultsSquare {
  const label = `${r.caseName}: ${r.passed ? "passed" : "failed"}`;
  return { caseId: r.caseId, state: r.passed ? "pass" : "fail", sessionId: r.sessionId, label, name: `${label}. ${r.sessionId ? "Open the result session in a new tab" : "No result session"}` };
}

// One evaluator column of a run row: one square for each replay of the run.
function runCell(list: EvaluatorReplays, cohortCaseCount: number | null): ResultsCell {
  const squares = list.replays.map(replaySquare);
  return { evaluator: list.evaluator, squares, ...countText(squares, "passed", cohortCaseCount) };
}

// One evaluator column of an experiment row: one square for each case, across
// the completed runs. With one completed run (`severalRuns` is false), the
// squares are those of the run. With more, a square has no link, because a
// link would go to an arbitrary run. A case passed only when it passed in each
// run, as in the pass rate: a run that gives the case no result is not a pass.
// `caseOrder` gives the place of each case id in case order.
function experimentCell(evaluator: string, runs: RunReplays[], severalRuns: boolean, caseOrder: Map<string, number>, cohortCaseCount: number | null): ResultsCell | null {
  const lists = runs.flatMap((r) => r.evaluatorReplays.filter((e) => e.evaluator === evaluator && e.replays.length > 0));
  if (lists.length === 0) return null;
  if (!severalRuns) return runCell(lists[0], cohortCaseCount);
  const byCase = new Map<string, ReplayResult[]>();
  for (const list of lists) for (const r of list.replays) byCase.set(r.caseId, [...(byCase.get(r.caseId) ?? []), r]);
  const place = (id: string) => caseOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const n = runs.length;
  const squares = [...byCase.values()]
    .sort((a, b) => place(a[0].caseId) - place(b[0].caseId))
    .map((replays): ResultsSquare => {
      const passed = passedCount(replays);
      const failed = replays.length - passed;
      const noResult = n - replays.length;
      const state = passed === n ? "pass" : passed === 0 ? "fail" : "mixed";
      const result =
        (state === "pass" ? "passed every run" : state === "mixed" ? `mixed, passed ${passed} of ${n} runs` : failed === n ? "failed every run" : `failed ${failed} of ${n} runs`) + (noResult ? `, no result in ${noResult}` : "");
      const label = `${replays[0].caseName}: ${result}`;
      return { caseId: replays[0].caseId, state, sessionId: null, label, name: `${label}. Show the runs to open a result session` };
    });
  return { evaluator, squares, ...countText(squares, "passed every run", cohortCaseCount) };
}

// Case id → did the case pass every gating evaluator in the run? Null: the
// case has no score, which includes each case of `unscored`.
function runPasses(run: RunReplays): Map<string, boolean | null> {
  const passes = casePasses(run.evaluatorReplays);
  for (const id of run.unscored) passes.set(id, null);
  return passes;
}

// The pass rate of a set of completed runs (see "Pass rate" in GLOSSARY.md):
// the share of cases that passed every gating evaluator in each of the runs.
// One run gives the pass rate of that run. Null with no case.
function passRate(runs: RunReplays[]): number | null {
  const perRun = runs.map(runPasses);
  const ids = new Set(perRun.flatMap((passes) => [...passes.keys()]));
  if (ids.size === 0) return null;
  return [...ids].filter((id) => perRun.every((passes) => passes.get(id) === true)).length / ids.size;
}

// If the lap met the rule of the loop. `title` says why, for a tooltip.
export type LapResult = { label: string; tone: "success" | "destructive" | "neutral"; title: string };

// One completed run in an open row, in the columns of the experiment row.
export type ResultsRun = {
  run: number;
  name: string; // "Run #1"
  cells: (ResultsCell | null)[]; // one for each column; null when the run has no replays for that evaluator
  passRate: string | null; // null when the run has no case with a result
  status: string; // the run status from the server, as a word
  result: LapResult;
};

export type ResultsRow = {
  lap: number;
  name: string; // "Control", or the number of a later experiment
  summary: string;
  winning: boolean; // the winning lap gets a ★
  status: string; // the run status from the server, as a word
  // Null for a lap with results. If not, the text in the place of the squares:
  // the lap has no squares and no result, and the row does not open.
  noResults: string | null;
  result: LapResult | null;
  cells: (ResultsCell | null)[]; // one for each column; null when the lap has no replays for that evaluator
  // Over every completed run. Null when the lap has no case with a result, and
  // while `incomplete` has a text: a rate over some of the runs would be wrong.
  passRate: string | null;
  // Null when the results of each completed run are loaded. If not, a text
  // that says how many are loaded, which also shows after each count.
  incomplete: string | null;
  runs: ResultsRun[]; // what the open row lists, oldest run first
};

const RUN_STATUS: Record<string, string> = { running: "Running", canceling: "Canceling", canceled: "Canceled", failed: "Failed", completed: "Completed" };
// The word that the dashboard shows for the status of a Run (see "Canceled" in GLOSSARY.md).
export const runStatus = (status: string) => RUN_STATUS[status] ?? status;

// The result of one run: a run passed when each case passed every gating evaluator in it.
function runResult(run: RunReplays): LapResult {
  const passes = [...runPasses(run).values()];
  const failed = passes.filter((ok) => ok === false).length;
  if (failed) return { label: "Failed", tone: "destructive", title: `${failed} ${failed === 1 ? "case" : "cases"} failed a gating evaluator in this run` };
  if (passes.length && passes.every((ok) => ok === true)) return { label: "Passed", tone: "success", title: "Each case passed every gating evaluator in this run" };
  return { label: "No result", tone: "neutral", title: "No case failed, but a gating evaluator gave no result for one or more cases" };
}

function resultsRun(run: RunReplays, evaluators: string[], cohortCaseCount: number | null): ResultsRun {
  const rate = passRate([run]);
  return {
    run: run.run,
    name: `Run #${run.run}`,
    cells: evaluators.map((name) => {
      const list = run.evaluatorReplays.find((e) => e.evaluator === name);
      return list?.replays.length ? runCell(list, cohortCaseCount) : null;
    }),
    passRate: rate == null ? null : formatPercent(rate),
    status: runStatus(run.status),
    result: runResult(run),
  };
}

const completedRun = (l: ResultsLap) => l.runs.find((r) => r.status === "completed");

// A completed run gives the status, because the squares come from the
// completed runs. With no completed run, the newest run gives it.
function lapStatus(l: ResultsLap): string {
  const run = completedRun(l) ?? l.runs[l.runs.length - 1];
  return run ? runStatus(run.status) : "Not started";
}

// The run status says if the lap has a completed run. A completed run can have
// no results from a gating evaluator, which is not the same as no run.
function noResultsText(l: ResultsLap): string | null {
  if (l.runReplays.some((r) => r.evaluatorReplays.some((e) => e.replays.length > 0))) return null;
  return completedRun(l) ? "No results from a gating evaluator" : "No results yet";
}

// The rule of the MVP view (the same as `simpleResult` of the lap grid): the
// gate and the confirmation of the Post-MVP view as one result. The winning
// lap passed, whatever rules the server has.
function lapResult(l: ResultsLap, c: Criteria | null, winnerLap: number | null, caseName: (id: string) => string): LapResult | null {
  const names = (ids: string[]) => ids.map(caseName).join(", ");
  if (l.lap === winnerLap) return { label: "Passed", tone: "success", title: "This experiment made the loop pass" };
  if (l.lap === 0) return { label: experimentName(0, "short"), tone: "neutral", title: "The control experiment is the reference. Nothing was changed." };
  if (l.running) return { label: "Running", tone: "neutral", title: "" };
  if (l.screenGreen === false) return { label: "Failed", tone: "destructive", title: "A case failed on the first run, so the experiment ended there" };
  const g = l.selectionGate;
  if (!g || !c) return null;
  if (g.incomplete) return { label: "In progress", tone: "neutral", title: "Not every case has a result yet" };
  if (!g.met) {
    const why = [
      g.regressed.length ? `got worse than ${experimentName(0, "inline")}: ${names(g.regressed)}` : "",
      g.belowFloor.length ? `failed too often: ${names(g.belowFloor)}` : "",
      g.belowTarget ? (c.k === 1 ? `pass rate ${formatPercent(g.meanPassK ?? 0)} is under the ${formatPercent(c.cohort_target_mean_pass_k)} target` : "the score is under the target") : "",
    ].filter(Boolean);
    return { label: "Failed", tone: "destructive", title: why.join("; ") };
  }
  if (c.confirmation_round) {
    const cg = l.confirmationGate;
    if (!cg || cg.incomplete) return { label: "In progress", tone: "neutral", title: "Being run again to confirm the result" };
    if (!cg.met) return { label: "Failed", tone: "destructive", title: "It passed once but did not hold up when run again" };
  }
  return { label: "Passed", tone: "success", title: "This experiment met the target" };
}

// A "Passed" experiment can have a pass rate below 100%: the pass rate counts
// every completed run, and the rule of the loop does not. The tooltip of the
// badge gives the reason, so that the two values do not look like an error.
function withPassRateReason(result: LapResult | null, rate: number | null, runCount: number): LapResult | null {
  if (!result || result.label !== "Passed" || rate == null || rate >= 1) return result;
  const reason =
    runCount > 1
      ? `The pass rate is ${formatPercent(rate)} because it counts all ${runCount} completed runs, and a case did not pass in one or more of them.`
      : `The pass rate is ${formatPercent(rate)} because the rules of the loop let the experiment pass with a case that did not pass.`;
  return { ...result, title: `${result.title}. ${reason}` };
}

// - `legend`: the states that a square can show, with the words of the legend row.
// - `state`: the state of the loop, for the head of the panel.
// - `runsNote` says what "Show runs" lists, and `statusNote` names the words
//   that the Status column can show. The two are for the footer.
export type ResultsTable = { evaluators: string[]; rows: ResultsRow[]; legend: { state: SquareState; label: string }[]; state: string; runsNote: string; statusNote: string };

const RUNS_NOTE = '"Show runs" lists each completed run of the experiment, with the squares, the pass rate, the status and the result of that run.';
const STATUS_NOTE = `Status is one of: ${["Not started", ...Object.values(RUN_STATUS)].join(", ")}.`;

// "Mixed" can occur only in an experiment with more than one completed run.
const LEGEND_ONE_RUN: ResultsTable["legend"] = [
  { state: "pass", label: "Passed" },
  { state: "fail", label: "Failed" },
];
const LEGEND_SEVERAL_RUNS: ResultsTable["legend"] = [
  { state: "pass", label: "Passed every run" },
  { state: "mixed", label: "Mixed" },
  { state: "fail", label: "Failed every run" },
];

// The outcome of the loop decides first: an experiment of a loop that finished
// can still show as running until its run data loads again.
function loopState(laps: ResultsLap[], outcome: LoopOutcome): string {
  if (outcome.kind === "completed") return "loop finished";
  if (outcome.kind === "canceled") return "loop canceled";
  if (outcome.kind === "failed") return "loop failed";
  const running = [...laps].reverse().find((l) => l.running);
  // A Skill Loop with no result has no Loop status, only its runs.
  if (!running) return outcome.kind === "no_result" ? "no result" : "loop running…";
  return `${running.lap === 0 ? "control experiment" : experimentName(running.lap, "inline")} running…`;
}

// The Results table: one row for each lap, from the control experiment to the
// last lap, and one column for each gating evaluator. A row shows each case across
// the completed runs of the lap, and it opens to one row for each of these runs.
export function resultsTable(loop: { laps: ResultsLap[]; cases: CaseInfo[]; criteria: Criteria | null; winnerLap: number | null; cohortCaseCount: number | null; outcome: LoopOutcome }): ResultsTable {
  const laps = [...loop.laps].sort((a, b) => a.lap - b.lap);
  // Each run's lists are in the column order already (see evaluatorReplays).
  const evaluators: string[] = [];
  for (const l of laps) for (const r of l.runReplays) for (const e of r.evaluatorReplays) if (!evaluators.includes(e.evaluator)) evaluators.push(e.evaluator);
  const caseName = (id: string) => loop.cases.find((c) => c.id === id)?.name ?? id;
  const caseOrder = new Map(loop.cases.map((c, i) => [c.id, i]));
  // More than one completed run, also while the results of a run still load.
  const severalRuns = (l: ResultsLap) => Math.max(l.runReplays.length, l.runs.filter((r) => r.status === "completed").length) > 1;
  const rows = laps.map((l): ResultsRow => {
    const noResults = noResultsText(l);
    const completed = l.runs.filter((r) => r.status === "completed").length;
    // The results of a completed run still load, or the request for them failed.
    const incomplete = l.runReplays.length < completed ? `${l.runReplays.length} of ${completed} runs loaded` : null;
    const rate = incomplete ? null : passRate(l.runReplays);
    return {
      lap: l.lap,
      name: experimentName(l.lap, "short"),
      summary: l.summary,
      winning: l.lap === loop.winnerLap,
      status: lapStatus(l),
      noResults,
      result: noResults == null ? withPassRateReason(lapResult(l, loop.criteria, loop.winnerLap, caseName), rate, l.runReplays.length) : null,
      cells: evaluators.map((name) => {
        const cell = experimentCell(name, l.runReplays, severalRuns(l), caseOrder, loop.cohortCaseCount);
        return cell && incomplete ? { ...cell, count: `${cell.count} · ${incomplete}`, tone: "neutral" as const } : cell;
      }),
      passRate: noResults == null && rate != null ? formatPercent(rate) : null,
      incomplete,
      runs: noResults == null ? l.runReplays.map((r) => resultsRun(r, evaluators, loop.cohortCaseCount)) : [],
    };
  });
  return { evaluators, rows, legend: laps.some(severalRuns) ? LEGEND_SEVERAL_RUNS : LEGEND_ONE_RUN, state: loopState(laps, loop.outcome), runsNote: RUNS_NOTE, statusNote: STATUS_NOTE };
}

// Final results section

// The plain loop data that the Final results section reads. The result of the loop data hook fits it.
export type FinalResultsLoop = {
  outcome: LoopOutcome;
  laps: {
    lap: number;
    runs: { started_at?: string | null; ended_at?: string | null }[];
    evaluatorReplays: EvaluatorReplays[];
  }[];
  totalLaps: number;
  criteria: Pick<Criteria, "max_rounds"> | null;
};

export type FinalResults = {
  badge: { label: string; tone: "success" | "neutral" };
  line: string; // the outcome title, the best lap for a loop that did not pass, and the duration, then the outcome detail
  cards: { label: string; value: string; sub: string }[];
  note: { title: string; text: string };
};

type FinalLap = FinalResultsLoop["laps"][number];

// From the earliest run start to the latest run end, over the runs that are loaded. Null with no times.
function loopDuration(laps: FinalLap[]): string | null {
  const runs = laps.flatMap((l) => l.runs);
  const starts = runs.flatMap((r) => (r.started_at ? [r.started_at] : []));
  const ends = runs.flatMap((r) => (r.ended_at ? [r.ended_at] : []));
  if (!starts.length || !ends.length) return null;
  const time = (iso: string) => new Date(iso).getTime();
  const start = starts.reduce((a, b) => (time(b) < time(a) ? b : a));
  const end = ends.reduce((a, b) => (time(b) > time(a) ? b : a));
  return formatLongDuration(start, end);
}

// What the Final results section shows, or null for no section: a loop that
// runs, a canceled loop, and a loop with no laps have no final numbers.
// The numbers of a lap come from its first completed run, as in the Results table.
export function finalResults(loop: FinalResultsLoop): FinalResults | null {
  const outcome = loop.outcome;
  if (outcome.kind !== "completed" || loop.laps.length === 0) return null;

  // The pass rate of each lap that has a score: the cases that passed every gating evaluator.
  const scored = loop.laps.flatMap((lap) => {
    const passes = casePasses(lap.evaluatorReplays);
    return passes.size ? [{ lap, passes, rate: passCount(passes) / passes.size }] : [];
  });
  // The lap in use: the winning lap, or the best lap (the earliest lap with the highest pass rate).
  // The baseline lap tried no change, so it is not the best lap.
  const best = scored.filter((s) => s.lap.lap > 0).reduce<(typeof scored)[number] | null>((m, s) => (m == null || s.rate > m.rate ? s : m), null);
  const inUse = outcome.passed ? scored.find((s) => s.lap.lap === outcome.winnerLap) ?? null : best;
  const baselineLap = loop.laps.find((l) => l.lap === 0);
  const baseline = casePasses(baselineLap?.evaluatorReplays ?? []);
  // Got worse: passed in the baseline lap and failed in the lap in use. Null when one of the two has no score.
  const gotWorse = inUse && baseline.size ? [...inUse.passes].filter(([id, ok]) => ok === false && baseline.get(id) === true).length : null;

  const duration = loopDuration(loop.laps);
  const summary = [outcome.title, !outcome.passed && inUse ? `Best experiment: ${experimentName(inUse.lap.lap, "inline")}` : null, duration].filter(Boolean).join(" · ");

  const cards: FinalResults["cards"] = [];
  for (const e of inUse?.lap.evaluatorReplays ?? []) {
    if (e.replays.length === 0) continue; // a required evaluator that gave no result
    const count = (list: ReplayResult[]) => `${passedCount(list)} of ${list.length}`;
    const was = baselineLap?.evaluatorReplays.find((b) => b.evaluator === e.evaluator);
    cards.push({
      label: e.evaluator,
      value: formatPercent(passedCount(e.replays) / e.replays.length),
      sub: was && baselineLap !== inUse!.lap ? `${count(e.replays)} · was ${count(was.replays)}` : count(e.replays),
    });
  }
  // When the control experiment is in use, there is no second experiment to name.
  if (inUse && gotWorse != null) cards.push({ label: "Got worse", value: String(gotWorse), sub: inUse.lap.lap === 0 ? `of ${inUse.passes.size} cases` : `of ${inUse.passes.size} cases, control experiment to ${experimentName(inUse.lap.lap, "inline")}` });
  cards.push({ label: "Experiments", value: String(Math.max(loop.totalLaps - 1, 0)), sub: loop.criteria ? `after the control experiment · limit ${loop.criteria.max_rounds}` : "after the control experiment" });

  return {
    badge: outcome.passed ? { label: "Passed", tone: "success" } : { label: "Not passed", tone: "neutral" },
    line: `${summary}. ${outcome.detail}`,
    cards,
    note: { title: "Nothing was changed in your agent", text: `The loop only changed its own copy.${outcome.passed && inUse?.lap.lap !== 0 ? " The change of the winning experiment is below." : ""}` },
  };
}
