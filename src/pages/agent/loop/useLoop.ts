import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getRunAggregates,
  listCohortSessions,
  listExperimentRuns,
  listExperiments,
  listRunReplays,
  signInGate,
  type Experiment,
  type ExperimentRun,
} from "../../../api/client";
import { cellTarget, type CellRun, type CellTarget, type Phase } from "../../../lib/cellTarget";
import { caseName } from "../../../lib/experiments";
import { runReplays, runResults, type CaseInfo, type EvaluatorReplays, type RunCell, type RunReplays } from "../../../lib/loopResults";
import { caseStats, decide, gate, meanPassK, type Decision, type Gate, type LapFacts, type Stats } from "../../../lib/loopRules";
import { LOOP_QUIET_MS, NO_EXPERIMENT_PASSED, experimentName, groupLoops, isActiveRun, knownLegacyLoop, lapSummary, lastLoopActivity, loopHypothesis, loopQuiet, newestRunStatus, parseEvalveLoop, parseSettings, passedTitle, resolveLoopOutcome, shouldPollLoopRuns, type EvalveSetup, type LoopOutcome, type LoopSettings } from "../../../lib/loops";

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

export type LoopData = {
  slug: string;
  settings: LoopSettings | null;
  isEvalveLoop: boolean;
  evalveSetup: EvalveSetup | null; // the setup in the loop settings line of the runner; null for a loop that the old skill made
  cohortVersionId: string | null; // the cohort version of the setup, or of the newest run; null until one of them loads
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

  // The runs of the experiments outside the lap limit. Only the loop status reads
  // them: a person can start a run on an older experiment, and the status is for the whole loop.
  const olderIds = ordered.slice(0, -opts.lapLimit).map((l) => l.experiment.id);
  const olderRuns = useQuery({
    queryKey: ["experiment-runs", olderIds],
    queryFn: () => listExperimentRuns(olderIds),
    enabled: olderIds.length > 0,
    refetchInterval: (q) => (shouldPollLoopRuns(evalve, olderIds, q.state.data ?? []) ? 4000 : false),
  });
  const loopRuns = useMemo(() => [...(runs.data ?? []), ...(olderRuns.data ?? [])], [runs.data, olderRuns.data]);

  // The quiet rule: a loop with no stop result shows Stopped or Failed after
  // LOOP_QUIET_MS with no activity. The time comes from the browser clock.
  // A failed runs request is not a loaded one: an active run can exist.
  const runsLoaded = !experiments.isPending && (ids.length === 0 || runs.isSuccess) && (olderIds.length === 0 || olderRuns.isSuccess);
  const lastActivity = useMemo(() => lastLoopActivity(ordered.map((l) => l.experiment), loopRuns), [ordered, loopRuns]);
  const [now, setNow] = useState(() => Date.now());
  const quietAt = lastActivity == null ? null : lastActivity + LOOP_QUIET_MS;
  // Not quiet while the runs load: an active run or a newer run can be in the answer.
  const quietNow = runsLoaded && quietAt != null && now >= quietAt;
  // After the sign-in ends, a request waits and the runs on the page get old.
  // The loop keeps its quiet value until the answer comes (see `loopQuiet`).
  const signInEnded = useSyncExternalStore(signInGate.subscribe, signInGate.state) === "ended";
  const [quietState, setQuietState] = useState({ waits: false, quiet: false });
  const nextQuiet = loopQuiet(quietState, signInEnded, experiments.isFetching || runs.isFetching || olderRuns.isFetching, quietNow);
  if (nextQuiet.waits !== quietState.waits || nextQuiet.quiet !== quietState.quiet) setQuietState(nextQuiet);
  const quiet = nextQuiet.quiet;
  useEffect(() => {
    if (quietAt == null || now >= quietAt) return;
    // The timer changes the row at the end of the quiet time, with no data change.
    const timer = setTimeout(() => setNow(Date.now()), Math.max(quietAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [quietAt, now]);

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
  const resultsKey = [...aggs, ...reps].map((q) => `${q.dataUpdatedAt}:${q.errorUpdatedAt}`).join(",");
  // A failed request for the results of a run. The totals of its experiment are not complete then.
  const resultsError = [...aggs, ...reps].find((q) => q.error)?.error ?? null;

  return useMemo<LoopData>(() => {
    const legacySettings = parseSettings(round0?.description);
    const known = evalve || legacySettings ? undefined : knownLegacyLoop(slug, round0?.id);
    const settings = legacySettings ?? known?.settings ?? null;
    const c = settings?.criteria ?? null;
    const gateNames = settings?.gate_evaluators;

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
      const firstRunPasses = first ? [...first.values()].filter((ok) => ok === true).length : null;
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
        title: passedTitle(decision.lap),
        detail: `It met every check across ${c.trials_per_round} runs${decision.confirmed ? `, then met them again on ${c.trials_per_round} fresh runs` : ""}.`,
      };
    else if (!legacyCompletion && decision?.action === "stop_plateau")
      legacyCompletion = { kind: "completed", passed: false, winnerLap: null, title: NO_EXPERIMENT_PASSED, detail: `The loop stopped because ${decision.patience} experiments in a row did no better than ${experimentName(decision.bestLap, "inline")}.` };
    else if (!legacyCompletion && c && decision?.action === "stop_cap")
      legacyCompletion = { kind: "completed", passed: false, winnerLap: null, title: NO_EXPERIMENT_PASSED, detail: `The loop ran all ${c.max_rounds} experiments it was allowed after the control.` };
    // A loop of the skill gets its completion from the run results. Until they
    // load, the loop is not quiet, so that Stopped does not show before Completed.
    const completionPending = !evalve && !!c && loading;
    const outcome = resolveLoopOutcome(evalve, legacyCompletion, loopRuns.some(isActiveRun), newestRunStatus(loopRuns), quiet && !completionPending);

    return {
      slug,
      settings,
      isEvalveLoop: !!evalve,
      evalveSetup: evalve?.setup ?? null,
      cohortVersionId: evalve?.setup.cohortVersionId ?? cohortVersionId ?? null,
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
      error: (experiments.error ?? runs.error ?? olderRuns.error ?? resultsError) as Error | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments.data, runs.data, loopRuns, baseline.data, baseline.isError, scored, resultsKey, slug, evalve, quiet]);
}
