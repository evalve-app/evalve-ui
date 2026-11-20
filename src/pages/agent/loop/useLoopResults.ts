import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  listCohortSessions,
  listExperimentRuns,
  listRunReplays,
  type Experiment,
  type ExperimentRun,
} from "../../../api/client";
import { cellTarget, type CellRun, type CellTarget, type Phase } from "../../../lib/cellTarget";
import { caseName } from "../../../lib/experiments";
import { runReplays, runResults, type CaseInfo, type EvaluatorReplays, type RunCell, type RunReplays } from "../../../lib/loopResults";
import { caseStats, gate, meanPassK, type Gate, type Stats } from "../../../lib/loopRules";
import { isActiveRun, type Criteria } from "../../../lib/loops";
import type { LoopOutcome } from "../../../lib/loopStatus";
import { runAggregatesQuery } from "../../../lib/runAggregatesQuery";

export type { CaseInfo };

export type Lap = {
  lap: number;
  experiment: Experiment;
  summary: string;
  runs: ExperimentRun[]; // oldest first
  phases: Map<string, Phase>; // run id → phase
  running: boolean;
  screenGreen: boolean | null;
  firstRunPasses: number | null;
  selectionTrials: number;
  confirmationTrials: number;
  selection: Stats; // screen + trial runs
  confirmation: Stats | null;
  cases: Stats; // every scored run, for the grid
  targets: Map<string, CellTarget>; // case id → what its grid cell opens
  // Each gating evaluator's replays in case order, from the first completed run. Empty with no completed run.
  evaluatorReplays: EvaluatorReplays[];
  // The replays of each completed run, with the run number and the run status, oldest run first.
  runReplays: RunReplays[];
  meanPassK: number | null; // on the selection trials
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

// What the result sections of a Loop show, the same for each kind of Loop:
// the experiments and their runs, the cases, and the outcome. The status and
// the outcome come from the caller. These results only show them.
export type LoopResults = {
  laps: Lap[];
  totalLaps: number;
  cases: CaseInfo[];
  cohortVersionId: string | null; // the cohort version of the newest run; null until the runs load
  cohortCaseCount: number | null; // cases in the cohort; null until the cohort loads
  firstCohortCase: CaseInfo | null; // the first case of the cohort, in case order; null until the cohort loads
  cohortFailed: boolean; // the cohort request failed, so the two values above stay null
  criteria: Criteria | null; // the rules of the Post-MVP view; null for a Loop with no such rules
  outcome: LoopOutcome;
  winnerLap: number | null;
  isLoading: boolean;
  error: Error | null;
};

// One experiment of a Loop, in lap order. `summary` is the change that it made.
export type LoopExperiment = { lap: number; experiment: Experiment; summary: string };

export type LoopResultsInput = {
  experiments: LoopExperiment[]; // every experiment of the Loop, in lap order
  experimentsPending: boolean;
  experimentsError: Error | null;
  lapLimit: number; // how many of the newest laps load, since every run costs two requests
  criteria: Criteria | null;
  gatingEvaluators: string[] | undefined; // the evaluator names that gate; all binary evaluators when undefined
  outcome: LoopOutcome;
  pollMs?: number | false; // how often the runs load again; a Skill Loop does not poll
};

// The results of the experiments of one Loop, from Kitaru.
export function useLoopResults({ experiments, experimentsPending, experimentsError, lapLimit, criteria: c, gatingEvaluators: gateNames, outcome, pollMs = false }: LoopResultsInput): LoopResults {
  const shown = experiments.slice(-lapLimit);
  const ids = shown.map((l) => l.experiment.id);

  const runs = useQuery({
    queryKey: ["experiment-runs", ids],
    queryFn: () => listExperimentRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: pollMs,
  });

  const scored = useMemo(() => (runs.data ?? []).filter((r) => r.status === "completed"), [runs.data]);
  const aggs = useQueries({ queries: scored.map((r) => runAggregatesQuery(r)) });
  const reps = useQueries({ queries: scored.map((r) => ({ queryKey: ["replays", r.id, r.status], queryFn: () => listRunReplays(r.id) })) });

  const cohortVersionId = runs.data?.[0]?.cohort_version_id ?? null;
  const baseline = useQuery({
    queryKey: ["cohort-sessions", cohortVersionId],
    queryFn: () => listCohortSessions(cohortVersionId!),
    enabled: !!cohortVersionId,
  });

  // A stable key that changes whenever any per-run result arrives.
  const resultsKey = [...aggs, ...reps].map((q) => `${q.dataUpdatedAt}:${q.errorUpdatedAt}`).join(",");
  // A failed request for the results of a run. The totals of its experiment are not complete then.
  const resultsError = [...aggs, ...reps].find((q) => q.error)?.error ?? null;

  return useMemo<LoopResults>(() => {
    // Per run: did each case pass every required evaluator? Null: the run has no score for the case.
    const runCases = new Map<string, Map<string, boolean | null>>();
    // Per run: the names of the required evaluators.
    const runEvaluators = new Map<string, string[]>();
    // Per run: each case's result session, replay status and pass/fail evaluator results, for the grid cells.
    const runSessions = new Map<string, Map<string, RunCell>>();
    scored.forEach((run, i) => {
      const a = aggs[i]?.data;
      const r = reps[i]?.data;
      if (!a || !r) return;
      const { passed, cells: sessions, evaluators } = runResults(a, r, gateNames);
      runEvaluators.set(run.id, evaluators);
      runCases.set(run.id, passed);
      runSessions.set(run.id, sessions);
    });

    const tally = (list: ExperimentRun[]): Stats => caseStats(list.flatMap((run) => runCases.get(run.id) ?? []));

    let baseStats: Stats | null = null;
    const laps: Lap[] = shown.map(({ experiment, lap, summary }) => {
      const lapRuns = (runs.data ?? []).filter((r) => r.experiment_id === experiment.id).sort((a, b) => a.number - b.number);
      const done = lapRuns.filter((r) => runCases.has(r.id));
      // Phases follow the skill: round 0 is all trials; later rounds are
      // screen (run 1), trials up to n, then n confirmation runs.
      const n = c?.trials_per_round ?? Number.MAX_SAFE_INTEGER;
      const phases = new Map<string, Phase>();
      lapRuns.forEach((r, i) => phases.set(r.id, i >= n ? "confirmation" : lap > 0 && i === 0 && c?.screen_first ? "screen" : "trial"));
      const sel = done.filter((r) => phases.get(r.id) !== "confirmation");
      const conf = done.filter((r) => phases.get(r.id) === "confirmation");
      const selection = tally(sel);
      const confirmation = conf.length ? tally(conf) : null;
      if (lap === 0) baseStats = selection;
      const first = done[0] ? runCases.get(done[0].id)! : null;
      const firstRunPasses = first ? [...first.values()].filter((ok) => ok === true).length : null;
      const base = lap === 0 ? null : baseStats;
      return {
        lap,
        experiment,
        summary,
        runs: lapRuns,
        phases,
        running: lapRuns.some(isActiveRun),
        screenGreen: lap > 0 && c?.screen_first && first ? firstRunPasses === first.size : null,
        firstRunPasses,
        selectionTrials: sel.length,
        confirmationTrials: conf.length,
        selection,
        confirmation,
        cases: tally(done),
        targets: new Map(), // filled in once case names are known
        evaluatorReplays: [], // filled in once case names are known
        runReplays: [], // filled in once case names are known
        meanPassK: c ? meanPassK(selection, c.k) : null,
        selectionGate: c && sel.length ? gate(c, selection, base) : null,
        confirmationGate: c && confirmation ? gate(c, confirmation, base) : null,
      };
    });

    const caseIds = new Set<string>();
    for (const l of laps) for (const k of l.cases.keys()) caseIds.add(k);
    const byId = new Map((baseline.data ?? []).map((s) => [s.session.id, s.session]));
    // Case order: the number of the recorded session, then the name.
    const inCaseOrder = (ids: string[]): CaseInfo[] =>
      ids
        .map((id) => {
          const s = byId.get(id);
          return { id, name: caseName(s?.name) || (s ? `#${s.number}` : "…"), order: s?.number ?? 0 };
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map(({ id, name }) => ({ id, name }));
    const cases = inCaseOrder([...caseIds]);
    // The first case of the whole cohort, also when it has no result in the laps that are loaded.
    const firstCohortCase = inCaseOrder([...byId.keys()])[0] ?? null;

    const runData = new Map([...runSessions].map(([id, cells]) => [id, { cells, evaluators: runEvaluators.get(id) ?? [], passed: runCases.get(id) ?? new Map<string, boolean | null>() }]));
    for (const l of laps) {
      for (const cs of cases) {
        const runsForCase: CellRun[] = l.runs.flatMap((r) => {
          // A run with no score for the case is not a run of the cell.
          const x = runCases.get(r.id)?.get(cs.id) != null ? runSessions.get(r.id)?.get(cs.id) : undefined;
          return x ? [{ run: r.number, phase: l.phases.get(r.id) ?? "trial", ...x }] : [];
        });
        l.targets.set(cs.id, cellTarget({ caseName: cs.name, lap: l.lap, runs: runsForCase, gatingEvaluators: gateNames }));
      }
      // The server gives evaluation values for only the 50 most recent replays
      // of a run, so a cohort of more than 50 cases gets 50 replays in each
      // list. `cohortCaseCount` lets the page say "first 50 of N".
      l.runReplays = runReplays(l.runs, runData, cases, gateNames);
      l.evaluatorReplays = l.runReplays[0]?.evaluatorReplays ?? [];
    }

    return {
      laps,
      totalLaps: experiments.length,
      cases,
      cohortVersionId,
      cohortCaseCount: baseline.data?.length ?? null,
      firstCohortCase,
      cohortFailed: baseline.isError,
      criteria: c,
      outcome,
      winnerLap: outcome.kind === "completed" ? outcome.winnerLap : null,
      isLoading: experimentsPending || (ids.length > 0 && runs.isPending) || runCases.size < scored.length,
      error: (experimentsError ?? runs.error ?? resultsError) as Error | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments, experimentsPending, experimentsError, runs.data, runs.isPending, runs.error, baseline.data, baseline.isError, scored, resultsKey, c, gateNames, outcome]);
}
