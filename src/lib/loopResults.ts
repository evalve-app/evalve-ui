// The loop results view model: what the three sections of the loop page show
// in the MVP view (Results, Final results, Agent diff). Each function takes
// plain loop data and returns what one section shows, with all text that
// depends on server data already made. The section components only lay it out.
import type { EvalAggregate, Replay } from "../api/client";
import type { CellRun } from "./cellTarget";
import { diffLines, type DiffLine } from "./diff";
import { formatLongDuration, formatPercent } from "./format";
import type { Gate } from "./loopRules";
import { isGating, parseEvalveLoop, type Criteria, type LoopOutcome } from "./loops";

// One case of the loop's cohort: the id of its recorded session, and its name.
export type CaseInfo = { id: string; name: string };

// One replay of one case, as one gating evaluator scored it. `status` is the
// replay status from the server, when the loop data has the replay.
export type ReplayResult = { caseId: string; caseName: string; sessionId: string | null; passed: boolean; status?: string | null };

// The replays of one gating evaluator in one lap, in case order.
export type EvaluatorReplays = { evaluator: string; replays: ReplayResult[] };

// One case in one run: its result session, its pass/fail evaluator results, and the status of its replay.
export type RunCell = Pick<CellRun, "sessionId" | "results"> & { status?: string | null };

// One run's results by case id (the id of the recorded session, or the replay
// id when the replay is not in `replays`). `passed`: did the case pass each
// gating evaluator? `cells`: each pass/fail result of the case, for the grid.
export function runResults(aggregates: EvalAggregate[], replays: Replay[], gatingEvaluators: string[] | undefined): { passed: Map<string, boolean>; cells: Map<string, RunCell> } {
  const byReplay = new Map(replays.map((x) => [x.id, x]));
  const passed = new Map<string, boolean>();
  const cells = new Map<string, RunCell>();
  for (const agg of aggregates) {
    // An evaluator of each data type can set the passed flag. An evaluator that sets no flag is a metric, and metrics don't gate here.
    if (agg.data_type !== "bool" && !agg.replays?.some((rep) => rep.result?.passed != null)) continue;
    for (const rep of agg.replays ?? []) {
      const replay = byReplay.get(rep.replay_id);
      const key = replay?.baseline_session_id ?? rep.replay_id;
      const cell = cells.get(key) ?? { sessionId: replay?.result_session_id ?? null, status: replay?.status ?? null, results: [] };
      cell.results.push({ evaluator: agg.evaluator_name ?? null, passed: !!rep.result?.passed });
      cells.set(key, cell);
      if (!isGating(gatingEvaluators, agg.evaluator_name)) continue;
      passed.set(key, (passed.get(key) ?? true) && !!rep.result?.passed);
    }
  }
  return { passed, cells };
}

// A pass/fail result with no evaluator name gates (see isGating), so it needs a name to show.
const UNNAMED = "Unnamed evaluator";

// The per-evaluator replay lists of one lap, from one run of the lap (the loop
// data hook gives the first completed run). `cases` sets the order, so each
// lap of a loop has the same order. A case with no result in the run is left
// out. Evaluators follow the loop's gating list, or name order with no list.
export function evaluatorReplays(run: Map<string, RunCell> | undefined, cases: CaseInfo[], gatingEvaluators: string[] | undefined): EvaluatorReplays[] {
  if (!run) return [];
  const lists = new Map<string, ReplayResult[]>();
  for (const cs of cases) {
    const cell = run.get(cs.id);
    for (const r of cell?.results ?? []) {
      if (!isGating(gatingEvaluators, r.evaluator)) continue;
      const name = r.evaluator ?? UNNAMED;
      const list = lists.get(name) ?? [];
      list.push({ caseId: cs.id, caseName: cs.name, sessionId: cell!.sessionId, passed: r.passed, status: cell!.status });
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
export type AgentDiffLap = { lap: number; summary: string; override: AgentDiffOverride | null | undefined; evaluatorReplays: EvaluatorReplays[] };

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
  | { kind: "diff"; lines: PromptDiffLine[]; counts: { added: number; removed: number; unchanged: number }; copy: AgentDiffCopy; source: { sessionId: string; name: string } | null }
  // No "before" prompt: the prompt of the winning lap in full.
  | { kind: "after-only"; note: string; text: string; copy: AgentDiffCopy }
  | { kind: "unchanged"; text: string };

export type AgentDiff = {
  winnerLap: number;
  prompt: AgentDiffPrompt;
  chips: string[]; // one for each field that the winning lap did not override
  changedFields: { label: string; before: string; after: string }[]; // model and parameters, when the winning lap overrides them
  lapRows: { lap: number; summary: string; change: string; trend: "better" | "worse" | "same" | null; winning: boolean }[];
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
  if (after == null) prompt = { kind: "unchanged", text: "The winning lap did not change the system prompt." };
  else if (before.loading) prompt = { kind: "loading" };
  else if (!before.prompt)
    prompt = {
      kind: "after-only",
      // A failed request does not show that Kitaru has no prompt, so it has its own note.
      note: `${before.failed ? "The page could not load the agent's own prompt" : "The recorded sessions use the agent's own setting, which Kitaru doesn't store"}, so there's no line-by-line diff. Lap ${winning.lap}, the winning lap, sets the system prompt to:`,
      text: after,
      copy: { label: "Copy prompt", text: after, primary: false },
    };
  else if (before.prompt === after) prompt = { kind: "unchanged", text: "The system prompt of the winning lap is the same as the agent's own prompt." };
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
    prompt = {
      kind: "diff",
      lines,
      counts: { added: count("add"), removed: count("del"), unchanged: count("same") },
      copy: { label: "Copy diff", text: unifiedDiff(diff, old.newline, now.newline), primary: true },
      source: firstCase ? { sessionId: firstCase.id, name: firstCase.name } : null,
    };
  }

  const changedFields: AgentDiff["changedFields"] = [];
  if (o.model) changedFields.push({ label: "Model", before: before.model ?? OWN_SETTING, after: settingText(o.model) });
  if (hasParams) changedFields.push({ label: "Parameters", before: before.modelParams && Object.keys(before.modelParams).length ? settingText(before.modelParams) : OWN_SETTING, after: settingText(o.model_params) });

  const ordered = [...laps].sort((a, b) => a.lap - b.lap);
  const lapRows = ordered.flatMap((l, i): AgentDiff["lapRows"] => {
    if (l.lap === 0) return [];
    const now = lapPassCount(l);
    const prev = i > 0 ? lapPassCount(ordered[i - 1]) : null;
    return [
      {
        lap: l.lap,
        summary: l.summary,
        change: now ? `${prev ? prev.passed : "—"} → ${now.passed} / ${now.total}` : "No results yet",
        trend: now && prev ? (now.passed > prev.passed ? "better" : now.passed < prev.passed ? "worse" : "same") : null,
        winning: l.lap === winning.lap,
      },
    ];
  });

  return { winnerLap: winning.lap, prompt, chips: [o.model ? null : "model unchanged", hasParams ? null : "parameters unchanged"].filter((c): c is string => !!c), changedFields, lapRows };
}

const settingText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

// The cases that passed each gating evaluator in the lap's first completed run, or null with no results.
function lapPassCount(lap: AgentDiffLap): { passed: number; total: number } | null {
  const passes = casePasses(lap.evaluatorReplays);
  return passes.size ? { passed: passCount(passes), total: passes.size } : null;
}

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
  evaluatorReplays: EvaluatorReplays[];
  screenGreen: boolean | null;
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

// One replay as a square. `label` gives the case and the result. `name` is the
// accessible name of the square: the label, and what the square opens.
export type ResultsSquare = { caseId: string; passed: boolean; sessionId: string | null; label: string; name: string };

export type ResultsCell = {
  evaluator: string;
  squares: ResultsSquare[]; // in case order
  count: string; // "18 of 23 passed"
  tone: "success" | "destructive";
};

// The server gives evaluation values for only the 50 most recent replays of a
// run. A cohort with more cases gets 50 squares, and the count says so.
const REPLAY_LIMIT = 50;

function resultsCell(list: EvaluatorReplays, cohortCaseCount: number | null): ResultsCell {
  const n = list.replays.length;
  const passed = passedCount(list.replays);
  const cut = n >= REPLAY_LIMIT && cohortCaseCount != null && cohortCaseCount > n;
  return {
    evaluator: list.evaluator,
    squares: list.replays.map((r) => {
      const label = `${r.caseName}: ${r.passed ? "passed" : "failed"}`;
      return { caseId: r.caseId, passed: r.passed, sessionId: r.sessionId, label, name: `${label}. ${r.sessionId ? "Open the result session in a new tab" : "No result session"}` };
    }),
    count: `${passed} of ${n} passed${cut ? ` · first ${n} of ${cohortCaseCount}` : ""}`,
    tone: passed === n ? "success" : "destructive",
  };
}

// If the lap met the rule of the loop. `title` says why, for a tooltip.
export type LapResult = { label: string; tone: "success" | "destructive" | "neutral"; title: string };

export type ResultsRow = {
  lap: number;
  summary: string;
  winning: boolean; // the winning lap gets a ★
  status: string; // the run status from the server, as a word
  // Null for a lap with results. If not, the text in the place of the squares:
  // the lap has no squares and no result, and the row does not open.
  noResults: string | null;
  result: LapResult | null;
  cells: (ResultsCell | null)[]; // one for each column; null when the lap has no replays for that evaluator
  replays: ResultsReplay[]; // what the open row lists, in case order
};

// One replay in an open row. A badge with `passed: null` has no result from that evaluator. `text` is what the badge says.
export type ResultsReplay = {
  caseId: string;
  caseName: string;
  sessionId: string | null;
  badges: { evaluator: string; passed: boolean | null; text: string }[]; // one for each column
  status: string;
  // Failed: a gating evaluator failed the case. Passed: each gating evaluator passed it.
  // No result: no evaluator failed it, but one or more gave no result.
  result: "Passed" | "Failed" | "No result";
};

// The replay status from the server, as a word. "Stopped" is also the word for a canceled run.
const REPLAY_STATUS: Record<string, string> = { pending: "Pending", evaluating: "Evaluating", completed: "Completed", failed: "Failed", canceled: "Stopped" };
const replayStatus = (status: string | null | undefined) => (status ? (REPLAY_STATUS[status] ?? status) : "No status");

function lapReplays(l: ResultsLap, evaluators: string[], cases: CaseInfo[]): ResultsReplay[] {
  const byEvaluator = new Map(l.evaluatorReplays.map((e) => [e.evaluator, new Map(e.replays.map((r) => [r.caseId, r]))]));
  return cases.flatMap((cs) => {
    const found = evaluators.map((name) => byEvaluator.get(name)?.get(cs.id));
    const any = found.find((r) => r);
    if (!any) return [];
    const badges = found.map((r, i) => ({ evaluator: evaluators[i], passed: r ? r.passed : null, text: `${evaluators[i]}: ${r ? (r.passed ? "passed" : "failed") : "no result"}` }));
    return [{ caseId: cs.id, caseName: any.caseName, sessionId: any.sessionId, badges, status: replayStatus(any.status), result: badges.some((b) => b.passed === false) ? ("Failed" as const) : badges.every((b) => b.passed === true) ? ("Passed" as const) : ("No result" as const) }];
  });
}

const RUN_STATUS: Record<string, string> = { running: "Running", canceling: "Stopping", canceled: "Stopped", failed: "Failed", completed: "Completed" };

const completedRun = (l: ResultsLap) => l.runs.find((r) => r.status === "completed");

// The squares come from the first completed run, so that run gives the status.
// With no completed run, the newest run gives it.
function lapStatus(l: ResultsLap): string {
  const run = completedRun(l) ?? l.runs[l.runs.length - 1];
  return run ? (RUN_STATUS[run.status] ?? run.status) : "Not started";
}

// The run status says if the lap has a completed run. A completed run can have
// no results from a gating evaluator, which is not the same as no run.
function noResultsText(l: ResultsLap): string | null {
  if (l.evaluatorReplays.length > 0) return null;
  return completedRun(l) ? "No results from a gating evaluator" : "No results yet";
}

// The rule of the MVP view (the same as `simpleResult` of the lap grid): the
// gate and the confirmation of the Post-MVP view as one result. The winning
// lap passed, whatever rules the server has.
function lapResult(l: ResultsLap, c: Criteria | null, winnerLap: number | null, caseName: (id: string) => string): LapResult | null {
  const names = (ids: string[]) => ids.map(caseName).join(", ");
  if (l.lap === winnerLap) return { label: "Passed", tone: "success", title: "This lap made the loop pass" };
  if (l.lap === 0) return { label: "Baseline lap", tone: "neutral", title: "Lap 0 is the reference. Nothing was changed." };
  if (l.running) return { label: "Running", tone: "neutral", title: "" };
  if (l.screenGreen === false) return { label: "Failed", tone: "destructive", title: "A case failed on the first run, so the lap ended there" };
  const g = l.selectionGate;
  if (!g || !c) return null;
  if (g.incomplete) return { label: "In progress", tone: "neutral", title: "Not every case has a result yet" };
  if (!g.met) {
    const why = [
      g.regressed.length ? `got worse than the baseline lap: ${names(g.regressed)}` : "",
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
  return { label: "Passed", tone: "success", title: "This lap met the target" };
}

export type ResultsTable = { evaluators: string[]; rows: ResultsRow[] };

// The Results table: one row for each lap, from the baseline lap to the last
// lap, and one column for each gating evaluator.
export function resultsTable(loop: { laps: ResultsLap[]; cases: CaseInfo[]; criteria: Criteria | null; winnerLap: number | null; cohortCaseCount: number | null }): ResultsTable {
  const laps = [...loop.laps].sort((a, b) => a.lap - b.lap);
  // Each lap's lists are in the column order already (see evaluatorReplays).
  const evaluators: string[] = [];
  for (const l of laps) for (const e of l.evaluatorReplays) if (!evaluators.includes(e.evaluator)) evaluators.push(e.evaluator);
  const caseName = (id: string) => loop.cases.find((c) => c.id === id)?.name ?? id;
  const rows = laps.map((l) => {
    const noResults = noResultsText(l);
    return {
      lap: l.lap,
      summary: l.summary,
      winning: l.lap === loop.winnerLap,
      status: lapStatus(l),
      noResults,
      result: noResults == null ? lapResult(l, loop.criteria, loop.winnerLap, caseName) : null,
      cells: evaluators.map((name) => {
        const list = l.evaluatorReplays.find((e) => e.evaluator === name);
        return list ? resultsCell(list, loop.cohortCaseCount) : null;
      }),
      replays: lapReplays(l, evaluators, loop.cases),
    };
  });
  return { evaluators, rows };
}

// Final results section

// The plain loop data that the Final results section reads. The result of the loop data hook fits it.
export type FinalResultsLoop = {
  outcome: LoopOutcome;
  laps: {
    lap: number;
    experiment: { description?: string | null };
    runs: { started_at?: string | null; ended_at?: string | null }[];
    evaluatorReplays: EvaluatorReplays[];
  }[];
  totalLaps: number;
  settings: { criteria: Pick<Criteria, "cohort_target_mean_pass_k" | "no_regression" | "max_rounds" | "trials_per_round" | "k" | "confirmation_round"> } | null;
};

export type FinalResults = {
  badge: { label: string; tone: "success" | "neutral" };
  line: string; // the outcome title, the best lap for a loop that did not pass, and the duration
  detail: string;
  cards: { label: string; value: string; sub: string }[];
  chartLabel: string; // each lap and its rate as text, for the bar chart
  bars: { lap: number; label: string; rate: number; text: string; inUse: boolean }[];
  criteria: { met: boolean; label: string; value: string }[] | null; // null: the loop has no rules on the server, or no rule that the dashboard can measure
  criteriaSummary: string | null; // "all met" or "1 of 2 met"; null with no criteria
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
  const line = [outcome.title, !outcome.passed && inUse ? `Best lap: lap ${inUse.lap.lap}` : null, duration].filter(Boolean).join(" · ");

  const cards: FinalResults["cards"] = [];
  for (const e of inUse?.lap.evaluatorReplays ?? []) {
    const count = (list: ReplayResult[]) => `${passedCount(list)} of ${list.length}`;
    const was = baselineLap?.evaluatorReplays.find((b) => b.evaluator === e.evaluator);
    cards.push({
      label: e.evaluator,
      value: formatPercent(passedCount(e.replays) / e.replays.length),
      sub: was && baselineLap !== inUse!.lap ? `${count(e.replays)} · was ${count(was.replays)}` : count(e.replays),
    });
  }
  if (inUse && gotWorse != null) cards.push({ label: "Got worse", value: String(gotWorse), sub: `of ${inUse.passes.size} cases, baseline lap to lap ${inUse.lap.lap}` });
  cards.push({ label: "Laps", value: String(Math.max(loop.totalLaps - 1, 0)), sub: loop.settings ? `after the baseline lap · limit ${loop.settings.criteria.max_rounds}` : "after the baseline lap" });

  const bars = scored.map((s) => ({ lap: s.lap.lap, label: `Lap ${s.lap.lap}`, rate: s.rate, text: formatPercent(s.rate), inUse: s === inUse }));

  // A row only for a criterion that the dashboard can measure: no lap limit, no budget, no metric gates.
  // The numbers here come from one run of the lap. The rule of a loop with
  // settings uses each run of the lap (mean pass^k), so one run gives the
  // number of the rule only with one run for each lap and k = 1. With more
  // runs (for example `day-30-refunds`: 5 runs, pass^3), or with a
  // confirmation run that also decides the lap, there are no rows, so that
  // the rows cannot contradict the badge.
  let criteria: FinalResults["criteria"] = null;
  const greens = parseEvalveLoop(baselineLap?.experiment.description)?.requiredGreens;
  if (inUse && greens != null) {
    criteria = [
      {
        met: outcome.passed,
        label: `Every case passed in ${greens} consecutive ${greens === 1 ? "replay" : "replays"}`,
        value: `${passCount(inUse.passes)} of ${inUse.passes.size} cases passed in lap ${inUse.lap.lap}`,
      },
    ];
  } else if (inUse && loop.settings && loop.settings.criteria.trials_per_round === 1 && loop.settings.criteria.k === 1 && !loop.settings.criteria.confirmation_round) {
    const c = loop.settings.criteria;
    const rows = [{ met: inUse.rate >= c.cohort_target_mean_pass_k, label: `Pass rate, at least ${formatPercent(c.cohort_target_mean_pass_k)}`, value: formatPercent(inUse.rate) }];
    if (c.no_regression && gotWorse != null) rows.push({ met: gotWorse === 0, label: "No case got worse", value: `${gotWorse} ${gotWorse === 1 ? "case" : "cases"} got worse` });
    // The loop has more rules than these rows (the floor for each case, the
    // budget). When the rows do not agree with the outcome, a rule that the
    // page cannot measure decided it, so the card does not show.
    if (rows.every((r) => r.met) === outcome.passed) criteria = rows;
  }

  return {
    badge: outcome.passed ? { label: "Passed", tone: "success" } : { label: "Not passed", tone: "neutral" },
    line,
    detail: outcome.detail,
    cards,
    chartLabel: `Pass rate by lap: ${bars.map((b) => `lap ${b.lap}, ${b.text}`).join("; ")}`,
    bars,
    criteria,
    criteriaSummary: criteria ? (criteria.every((c) => c.met) ? "all met" : `${criteria.filter((c) => c.met).length} of ${criteria.length} met`) : null,
    note: { title: "Nothing was changed in your agent", text: `The loop changed only its own copy of the agent.${outcome.passed ? " The change of the winning lap is below." : ""}` },
  };
}
