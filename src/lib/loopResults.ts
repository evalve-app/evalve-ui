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
