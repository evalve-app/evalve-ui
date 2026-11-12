import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getRunAggregates,
  listCohortSessions,
  listExperimentRuns,
  listExperiments,
  listRunReplays,
  type Experiment,
  type ExperimentRun,
} from "../../../api/client";
import { cellTarget, type CellRun, type CellTarget, type Phase } from "../../../lib/cellTarget";
import { caseName } from "../../../lib/experiments";
import { evaluatorReplays, runResults, type CaseInfo, type EvaluatorReplays, type RunCell } from "../../../lib/loopResults";
import { decide, gate, meanPassK, type CaseStat, type Decision, type Gate, type LapFacts, type Stats } from "../../../lib/loopRules";
import { groupLoops, isActiveRun, knownLegacyLoop, lapSummary, loopHypothesis, parseEvalveLoop, parseSettings, resolveLoopOutcome, shouldPollLoopRuns, type LoopOutcome, type LoopSettings } from "../../../lib/loops";

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
  meanPassK: number | null; // on the selection trials
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

export type LoopData = {
  slug: string;
  settings: LoopSettings | null;
  isEvalveLoop: boolean;
  hypothesis: string;
  laps: Lap[];
  totalLaps: number;
  cases: CaseInfo[];
  cohortCaseCount: number | null; // cases in the cohort; null until the cohort loads
  firstCohortCase: CaseInfo | null; // the first case of the cohort, in case order; null until the cohort loads
  cohortFailed: boolean; // the cohort request failed, so the two values above stay null
  running: boolean;
  winnerLap: number | null;
  decision: Decision | null;
  outcome: LoopOutcome;
  isLoading: boolean;
  error: Error | null;
};

// Everything the Loop pages need for one loop. A loop is the experiments named
// `<slug>-round-N` (or `<slug>-iteration-N`, counted from 1). `lapLimit` caps how many of the newest laps are loaded,
// since every run costs two requests.
export function useLoop(agentId: string, slug: string, opts: { lapLimit: number }): LoopData {
  const experiments = useQuery({
    queryKey: ["experiments", agentId],
    queryFn: () => listExperiments(agentId),
    refetchInterval: (q) => {
      // The runner publishes the result after it collects the settled replay.
      const baseline = q.state.data?.find((e) => e.name === `${slug}-round-0`);
      const evalve = parseEvalveLoop(baseline?.description);
      return evalve && (!evalve.result || evalve.result.status === "running") ? 4000 : false;
    },
  });

  const ordered = useMemo(() => groupLoops(experiments.data ?? []).get(slug) ?? [], [experiments.data, slug]);
  const round0 = ordered.find((l) => l.lap === 0)?.experiment;
  const evalve = useMemo(() => parseEvalveLoop(round0?.description), [round0?.description]);
  const shown = ordered.slice(-opts.lapLimit);
  const ids = shown.map((l) => l.experiment.id);

  const runs = useQuery({
    queryKey: ["experiment-runs", ids],
    queryFn: () => listExperimentRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: (q) => (shouldPollLoopRuns(evalve, ids, q.state.data ?? []) ? 4000 : false),
  });

  const scored = useMemo(() => (runs.data ?? []).filter((r) => r.status === "completed"), [runs.data]);
  const aggs = useQueries({ queries: scored.map((r) => ({ queryKey: ["aggregates", r.id, r.status], queryFn: () => getRunAggregates(r.id) })) });
  const reps = useQueries({ queries: scored.map((r) => ({ queryKey: ["replays", r.id, r.status], queryFn: () => listRunReplays(r.id) })) });

  const cohortVersionId = runs.data?.[0]?.cohort_version_id;
  const baseline = useQuery({
    queryKey: ["cohort-sessions", cohortVersionId],
    queryFn: () => listCohortSessions(cohortVersionId!),
    enabled: !!cohortVersionId,
  });

  // A stable key that changes whenever any per-run result arrives.
  const resultsKey = aggs.map((a) => a.dataUpdatedAt).join(",") + "|" + reps.map((r) => r.dataUpdatedAt).join(",");

  return useMemo<LoopData>(() => {
    const legacySettings = parseSettings(round0?.description);
    const known = evalve || legacySettings ? undefined : knownLegacyLoop(slug, round0?.id);
    const settings = legacySettings ?? known?.settings ?? null;
    const c = settings?.criteria ?? null;
    const gateNames = settings?.gate_evaluators;

    // Per run: did each case pass every gating evaluator?
    const runCases = new Map<string, Map<string, boolean>>();
    // Per run: each case's result session, replay status and pass/fail evaluator results, for the grid cells.
    const runSessions = new Map<string, Map<string, RunCell>>();
    scored.forEach((run, i) => {
      const a = aggs[i]?.data;
      const r = reps[i]?.data;
      if (!a || !r) return;
      const { passed, cells: sessions } = runResults(a, r, gateNames);
      runCases.set(run.id, passed);
      runSessions.set(run.id, sessions);
    });

    const tally = (list: ExperimentRun[]): Stats => {
      const m = new Map<string, CaseStat>();
      for (const run of list) {
        for (const [k, ok] of runCases.get(run.id) ?? []) {
          const s = m.get(k) ?? { c: 0, n: 0 };
          s.n += 1;
          if (ok) s.c += 1;
          m.set(k, s);
        }
      }
      return m;
    };

    let baseStats: Stats | null = null;
    const laps: Lap[] = shown.map(({ experiment, lap }) => {
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
      const firstRunPasses = first ? [...first.values()].filter(Boolean).length : null;
      const base = lap === 0 ? null : baseStats;
      return {
        lap,
        experiment,
        summary: lapSummary(experiment.description, lap),
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

    for (const l of laps) {
      for (const cs of cases) {
        const runsForCase: CellRun[] = l.runs.flatMap((r) => {
          const x = runCases.get(r.id)?.has(cs.id) ? runSessions.get(r.id)?.get(cs.id) : undefined;
          return x ? [{ run: r.number, phase: l.phases.get(r.id) ?? "trial", ...x }] : [];
        });
        l.targets.set(cs.id, cellTarget({ caseName: cs.name, lap: l.lap, runs: runsForCase, gatingEvaluators: gateNames }));
      }
      // The server gives evaluation values for only the 50 most recent replays
      // of a run, so a cohort of more than 50 cases gets 50 replays in each
      // list. `cohortCaseCount` lets the page say "first 50 of N".
      const firstDone = l.runs.find((r) => runCases.has(r.id));
      l.evaluatorReplays = evaluatorReplays(firstDone ? runSessions.get(firstDone.id) : undefined, cases, gateNames);
    }

    const running = laps.some((l) => l.running);
    const facts: LapFacts[] = laps.map((l) => ({
      lap: l.lap,
      hasRuns: l.runs.length > 0,
      screenGreen: l.screenGreen,
      firstRunPasses: l.firstRunPasses,
      selectionTrials: l.selectionTrials,
      confirmationTrials: l.confirmationTrials,
      selectionGate: l.selectionGate,
      confirmationGate: l.confirmationGate,
    }));
    const loading = experiments.isPending || (ids.length > 0 && runs.isPending) || runCases.size < scored.length;
    const decision = !evalve && c && !loading && laps.length ? decide(c, facts) : null;

    let legacyCompletion = known?.outcome ?? null;
    if (!legacyCompletion && c && decision?.action === "stop_success")
      legacyCompletion = {
        kind: "completed",
        passed: true,
        winnerLap: decision.lap,
        title: `Lap ${decision.lap} passed`,
        detail: `It met every check across ${c.trials_per_round} runs${decision.confirmed ? `, then met them again on ${c.trials_per_round} fresh runs` : ""}.`,
      };
    else if (!legacyCompletion && decision?.action === "stop_plateau")
      legacyCompletion = { kind: "completed", passed: false, winnerLap: null, title: "No lap passed", detail: `The loop stopped because ${decision.patience} laps in a row did no better than lap ${decision.bestLap}.` };
    else if (!legacyCompletion && c && decision?.action === "stop_cap")
      legacyCompletion = { kind: "completed", passed: false, winnerLap: null, title: "No lap passed", detail: `The loop ran all ${c.max_rounds} laps it was allowed.` };
    const outcome = resolveLoopOutcome(evalve, legacyCompletion, running, runs.data?.[0]?.status);

    return {
      slug,
      settings,
      isEvalveLoop: !!evalve,
      hypothesis: loopHypothesis(round0?.description),
      laps,
      totalLaps: ordered.length,
      cases,
      cohortCaseCount: baseline.data?.length ?? null,
      firstCohortCase,
      cohortFailed: baseline.isError,
      running,
      winnerLap: outcome.kind === "completed" ? outcome.winnerLap : null,
      decision,
      outcome,
      isLoading: loading,
      error: (experiments.error ?? runs.error ?? null) as Error | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments.data, runs.data, baseline.data, baseline.isError, scored, resultsKey, slug, evalve]);
}
