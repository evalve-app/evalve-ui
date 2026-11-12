// The loop results view model: what the three sections of the loop page show
// in the MVP view (Results, Final results, Agent diff). Each function takes
// plain loop data and returns what one section shows, with all text that
// depends on server data already made. The section components only lay it out.
import type { CellRun } from "./cellTarget";
import { isGating } from "./loops";

// One replay of one case, as one gating evaluator scored it.
export type ReplayResult = { caseId: string; caseName: string; sessionId: string | null; passed: boolean };

// The replays of one gating evaluator in one lap, in case order.
export type EvaluatorReplays = { evaluator: string; replays: ReplayResult[] };

// One case in one run: its result session and its pass/fail evaluator results.
export type RunCell = Pick<CellRun, "sessionId" | "results">;

// A pass/fail result with no evaluator name gates (see isGating), so it needs a name to show.
const UNNAMED = "Unnamed evaluator";

// The per-evaluator replay lists of one lap, from one run of the lap (the loop
// data hook gives the first completed run). `cases` sets the order, so each
// lap of a loop has the same order. A case with no result in the run is left
// out. Evaluators follow the loop's gating list, or name order with no list.
export function evaluatorReplays(run: Map<string, RunCell> | undefined, cases: { id: string; name: string }[], gatingEvaluators: string[] | undefined): EvaluatorReplays[] {
  if (!run) return [];
  const lists = new Map<string, ReplayResult[]>();
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

// ---- Results table (#18): start ----
// `formatPercent` and `Criteria` come from the imports of the Final results block below.
import type { Gate } from "./loopRules";

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

// One replay as a square. `label` is the name of the square's link.
export type ResultsSquare = { caseId: string; passed: boolean; sessionId: string | null; label: string };

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
  const passed = list.replays.filter((r) => r.passed).length;
  const cut = n >= REPLAY_LIMIT && cohortCaseCount != null && cohortCaseCount > n;
  return {
    evaluator: list.evaluator,
    squares: list.replays.map((r) => ({ caseId: r.caseId, passed: r.passed, sessionId: r.sessionId, label: `${r.caseName}: ${r.passed ? "passed" : "failed"}` })),
    count: `${passed} of ${n} passed${cut ? ` · first ${n} of ${cohortCaseCount}` : ""}`,
    tone: passed === n ? "success" : "destructive",
  };
}

// If the lap met the rule of the loop. `title` says why, for a tooltip.
export type LapResult = { label: string; tone: "success" | "destructive" | "neutral"; title: string };

export type ResultsRow = {
  lap: number;
  summary: string;
  winner: boolean; // the winning lap gets a ★
  status: string; // the run status from the server, as a word
  hasResults: boolean; // false: "No results yet", no squares, no result, and the row does not open
  result: LapResult | null;
  cells: (ResultsCell | null)[]; // one for each column; null when the lap has no replays for that evaluator
  replays: ResultsReplay[]; // what the open row lists, in case order
};

// One replay in an open row. A badge with `passed: null` has no result from that evaluator.
export type ResultsReplay = {
  caseId: string;
  caseName: string;
  sessionId: string | null;
  badges: { evaluator: string; passed: boolean | null }[]; // one for each column
  status: string;
  result: "Passed" | "Failed"; // passed: no gating evaluator failed
};

// The loop data gives a replay only when it has an evaluator result, and the
// server scores a replay after it completes. So each listed replay is completed.
const REPLAY_STATUS = "Completed";

function lapReplays(l: ResultsLap, evaluators: string[], cases: { id: string; name: string }[]): ResultsReplay[] {
  const byEvaluator = new Map(l.evaluatorReplays.map((e) => [e.evaluator, new Map(e.replays.map((r) => [r.caseId, r]))]));
  return cases.flatMap((cs) => {
    const found = evaluators.map((name) => byEvaluator.get(name)?.get(cs.id));
    const any = found.find((r) => r);
    if (!any) return [];
    const badges = found.map((r, i) => ({ evaluator: evaluators[i], passed: r ? r.passed : null }));
    return [{ caseId: cs.id, caseName: any.caseName, sessionId: any.sessionId, badges, status: REPLAY_STATUS, result: badges.some((b) => b.passed === false) ? ("Failed" as const) : ("Passed" as const) }];
  });
}

const RUN_STATUS: Record<string, string> = { running: "Running", canceling: "Stopping", canceled: "Stopped", failed: "Failed", completed: "Completed" };

// The squares come from the first completed run, so that run gives the status.
// With no completed run, the newest run gives it.
function lapStatus(l: ResultsLap, hasResults: boolean): string {
  const run = (hasResults ? l.runs.find((r) => r.status === "completed") : undefined) ?? l.runs[l.runs.length - 1];
  return run ? (RUN_STATUS[run.status] ?? run.status) : "Not started";
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
export function resultsTable(loop: { laps: ResultsLap[]; cases: { id: string; name: string }[]; criteria: Criteria | null; winnerLap: number | null; cohortCaseCount: number | null }): ResultsTable {
  const laps = [...loop.laps].sort((a, b) => a.lap - b.lap);
  // Each lap's lists are in the column order already (see evaluatorReplays).
  const evaluators: string[] = [];
  for (const l of laps) for (const e of l.evaluatorReplays) if (!evaluators.includes(e.evaluator)) evaluators.push(e.evaluator);
  const caseName = (id: string) => loop.cases.find((c) => c.id === id)?.name ?? id;
  const rows = laps.map((l) => {
    const hasResults = l.evaluatorReplays.length > 0;
    return {
      lap: l.lap,
      summary: l.summary,
      winner: l.lap === loop.winnerLap,
      status: lapStatus(l, hasResults),
      hasResults,
      result: hasResults ? lapResult(l, loop.criteria, loop.winnerLap, caseName) : null,
      cells: evaluators.map((name) => {
        const list = l.evaluatorReplays.find((e) => e.evaluator === name);
        return list ? resultsCell(list, loop.cohortCaseCount) : null;
      }),
      replays: lapReplays(l, evaluators, loop.cases),
    };
  });
  return { evaluators, rows };
}
// ---- Results table (#18): end ----

// ── Final results section (#19): start ──────────────────────────────────────
import { formatDuration, formatPercent } from "./format";
import { parseEvalveLoop, type Criteria, type LoopOutcome } from "./loops";

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
  settings: { criteria: Pick<Criteria, "cohort_target_mean_pass_k" | "no_regression" | "max_rounds"> } | null;
};

export type FinalResults = {
  badge: { label: string; tone: "success" | "neutral" };
  line: string; // the outcome title, the best lap for a loop that did not pass, and the duration
  detail: string;
  cards: { label: string; value: string; sub: string }[];
  chartLabel: string; // each lap and its rate as text, for the bar chart
  bars: { lap: number; label: string; rate: number; text: string; inUse: boolean }[];
  criteria: { met: boolean; label: string; value: string }[] | null; // null: the loop has no rules on the server
  note: string;
};

type FinalLap = FinalResultsLoop["laps"][number];

// Case id → did the case pass every gating evaluator in the lap? Empty for a lap with no score.
function casePasses(lap: FinalLap | undefined): Map<string, boolean> {
  const passes = new Map<string, boolean>();
  for (const e of lap?.evaluatorReplays ?? []) for (const r of e.replays) passes.set(r.caseId, (passes.get(r.caseId) ?? true) && r.passed);
  return passes;
}

const passCount = (passes: Map<string, boolean>) => [...passes.values()].filter(Boolean).length;

// From the earliest run start to the latest run end, over the runs that are loaded. Null with no times.
function loopDuration(laps: FinalLap[]): string | null {
  const runs = laps.flatMap((l) => l.runs);
  const starts = runs.flatMap((r) => (r.started_at ? [r.started_at] : []));
  const ends = runs.flatMap((r) => (r.ended_at ? [r.ended_at] : []));
  if (!starts.length || !ends.length) return null;
  const time = (iso: string) => new Date(iso).getTime();
  const start = starts.reduce((a, b) => (time(b) < time(a) ? b : a));
  const end = ends.reduce((a, b) => (time(b) > time(a) ? b : a));
  return formatDuration(start, end);
}

// What the Final results section shows, or null for no section: a loop that
// runs, a canceled loop, and a loop with no laps have no final numbers.
// The numbers of a lap come from its first completed run, as in the Results table.
export function finalResults(loop: FinalResultsLoop): FinalResults | null {
  const outcome = loop.outcome;
  if (outcome.kind !== "completed" || loop.laps.length === 0) return null;

  // The pass rate of each lap that has a score: the cases that passed every gating evaluator.
  const scored = loop.laps.flatMap((lap) => {
    const passes = casePasses(lap);
    return passes.size ? [{ lap, passes, rate: passCount(passes) / passes.size }] : [];
  });
  // The lap in use: the winning lap, or the best lap (the earliest lap with the highest pass rate).
  const best = scored.reduce<(typeof scored)[number] | null>((m, s) => (m == null || s.rate > m.rate ? s : m), null);
  const inUse = outcome.passed ? scored.find((s) => s.lap.lap === outcome.winnerLap) ?? null : best;
  const baselineLap = loop.laps.find((l) => l.lap === 0);
  const baseline = casePasses(baselineLap);
  // Got worse: passed in the baseline lap and failed in the lap in use. Null when one of the two has no score.
  const gotWorse = inUse && baseline.size ? [...inUse.passes].filter(([id, ok]) => !ok && baseline.get(id) === true).length : null;

  const duration = loopDuration(loop.laps);
  const line = [outcome.title, !outcome.passed && inUse ? `Best lap: lap ${inUse.lap.lap}` : null, duration].filter(Boolean).join(" · ");

  const cards: FinalResults["cards"] = [];
  for (const e of inUse?.lap.evaluatorReplays ?? []) {
    const count = (list: ReplayResult[]) => `${list.filter((r) => r.passed).length} of ${list.length}`;
    const was = baselineLap?.evaluatorReplays.find((b) => b.evaluator === e.evaluator);
    cards.push({
      label: e.evaluator,
      value: formatPercent(e.replays.filter((r) => r.passed).length / e.replays.length),
      sub: was && baselineLap !== inUse!.lap ? `${count(e.replays)} · was ${count(was.replays)}` : count(e.replays),
    });
  }
  if (inUse && gotWorse != null) cards.push({ label: "Got worse", value: String(gotWorse), sub: `of ${inUse.passes.size} cases, baseline lap to lap ${inUse.lap.lap}` });
  cards.push({ label: "Laps", value: String(Math.max(loop.totalLaps - 1, 0)), sub: loop.settings ? `of ${loop.settings.criteria.max_rounds} max` : "" });

  const bars = scored.map((s) => ({ lap: s.lap.lap, label: `Lap ${s.lap.lap}`, rate: s.rate, text: formatPercent(s.rate), inUse: s === inUse }));

  // A row only for a criterion that the dashboard can measure: no lap limit, no budget, no metric gates.
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
  } else if (inUse && loop.settings) {
    const c = loop.settings.criteria;
    criteria = [{ met: inUse.rate >= c.cohort_target_mean_pass_k, label: `Pass rate, at least ${formatPercent(c.cohort_target_mean_pass_k)}`, value: formatPercent(inUse.rate) }];
    if (c.no_regression && gotWorse != null) criteria.push({ met: gotWorse === 0, label: "No case got worse", value: `${gotWorse} ${gotWorse === 1 ? "case" : "cases"} got worse` });
  }

  return {
    badge: outcome.passed ? { label: "Passed", tone: "success" } : { label: "Not passed", tone: "neutral" },
    line,
    detail: outcome.detail,
    cards,
    chartLabel: `Pass rate by lap: ${bars.map((b) => `lap ${b.lap}, ${b.text}`).join("; ")}`,
    bars,
    criteria,
    note: "Nothing was changed in your agent",
  };
}
// ── Final results section (#19): end ────────────────────────────────────────
