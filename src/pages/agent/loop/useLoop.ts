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
import { caseName } from "../../../lib/experiments";
import { decide, gate, meanPassK, type CaseStat, type Decision, type Gate, type LapFacts, type Stats } from "../../../lib/loopRules";
import { groupLoops, lapSummary, loopHypothesis, parseSettings, type LoopSettings } from "../../../lib/loops";

export type CaseInfo = { id: string; name: string; order: number };
export type Phase = "screen" | "trial" | "confirmation";

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
  meanPassK: number | null; // on the selection trials
  selectionGate: Gate | null;
  confirmationGate: Gate | null;
};

// A loop has three statuses. "completed" means one of the skill's stop rules fired.
export type LoopOutcome =
  | { kind: "running" } // a run is in progress, or the loop was active in the last 30 minutes
  | { kind: "completed"; passed: boolean; title: string; detail: string } // shown on the loop page
  | { kind: "stopped"; why: string }; // went quiet with no stop rule, or its rules aren't on the server

// The coding agent pauses between runs to read results and pick a change.
// Longer than this with nothing new and no stop rule means it stopped early.
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

// Loops run before the skill wrote a "Loop settings" line on round 0. Their
// rules are copied here from the project's kitaru-loop.json, and the status is
// the one the skill reported in results.md. Remove an entry once its round 0
// carries the line.
const KNOWN_LOOPS: Record<string, { settings: LoopSettings; outcome: LoopOutcome }> = {
  "day-30-refunds": {
    settings: {
      name: "Day-30 refunds",
      criteria: { trials_per_round: 5, k: 3, screen_first: true, per_case_floor: "allow_one_miss", cohort_target_mean_pass_k: 0.9, no_regression: true, confirmation_round: true, max_rounds: 4, budget_usd: 1.0, plateau_patience: 2 },
      allowed_changes: ["system_prompt", "model"],
      allowed_models: ["gpt-4.1-mini", "gpt-4.1", "gpt-5-mini"],
      gate_evaluators: ["support-desk-action-correct"],
    },
    outcome: { kind: "completed", passed: true, title: "Lap 1 passed", detail: "It met every check across 5 runs, then met them again on 5 fresh runs." },
  },
};

export type LoopData = {
  slug: string;
  settings: LoopSettings | null;
  hypothesis: string;
  laps: Lap[];
  totalLaps: number;
  cases: CaseInfo[];
  running: boolean;
  winnerLap: number | null;
  decision: Decision | null;
  outcome: LoopOutcome;
  isLoading: boolean;
  error: Error | null;
};

// Everything the Loop pages need for one loop. A loop is the experiments named
// `<slug>-round-N`. `lapLimit` caps how many of the newest laps are loaded,
// since every run costs two requests.
export function useLoop(agentId: string, slug: string, opts: { lapLimit: number }): LoopData {
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });

  const ordered = useMemo(() => groupLoops(experiments.data ?? []).get(slug) ?? [], [experiments.data, slug]);
  const shown = ordered.slice(-opts.lapLimit);
  const ids = shown.map((l) => l.experiment.id);

  const runs = useQuery({
    queryKey: ["experiment-runs", ids],
    queryFn: () => listExperimentRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 4000 : false),
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
    const round0 = ordered.find((l) => l.lap === 0)?.experiment;
    const known = KNOWN_LOOPS[slug];
    const settings = parseSettings(round0?.description) ?? known?.settings ?? null;
    const c = settings?.criteria ?? null;
    const gateNames = settings?.gate_evaluators;

    // Per run: did each case pass every gating evaluator?
    const runCases = new Map<string, Map<string, boolean>>();
    scored.forEach((run, i) => {
      const a = aggs[i]?.data;
      const r = reps[i]?.data;
      if (!a || !r) return;
      const toBaseline = new Map(r.map((x) => [x.id, x.baseline_session_id ?? x.id]));
      const passed = new Map<string, boolean>();
      for (const agg of a) {
        if (agg.data_type !== "bool") continue; // metrics don't gate here
        if (gateNames && agg.evaluator_name && !gateNames.includes(agg.evaluator_name)) continue;
        for (const rep of agg.replays ?? []) {
          const key = toBaseline.get(rep.replay_id) ?? rep.replay_id;
          passed.set(key, (passed.get(key) ?? true) && !!rep.result?.passed);
        }
      }
      runCases.set(run.id, passed);
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
        running: lapRuns.some((r) => r.status === "running"),
        screenGreen: lap > 0 && c?.screen_first && first ? firstRunPasses === first.size : null,
        firstRunPasses,
        selectionTrials: sel.length,
        confirmationTrials: conf.length,
        selection,
        confirmation,
        cases: tally(done),
        meanPassK: c ? meanPassK(selection, c.k) : null,
        selectionGate: c && sel.length ? gate(c, selection, base) : null,
        confirmationGate: c && confirmation ? gate(c, confirmation, base) : null,
      };
    });

    const caseIds = new Set<string>();
    for (const l of laps) for (const k of l.cases.keys()) caseIds.add(k);
    const byId = new Map((baseline.data ?? []).map((s) => [s.session.id, s.session]));
    const cases: CaseInfo[] = [...caseIds]
      .map((id) => {
        const s = byId.get(id);
        return { id, name: caseName(s?.name) || (s ? `#${s.number}` : "…"), order: s?.number ?? 0 };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

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
    const decision = c && !loading && laps.length ? decide(c, facts) : null;

    const lastActivity = Math.max(0, ...laps.flatMap((l) => [Date.parse(l.experiment.created), ...l.runs.map((r) => Date.parse(r.ended_at ?? r.created))]).filter(Number.isFinite));
    const active = Date.now() - lastActivity < ACTIVE_WINDOW_MS;
    let outcome: LoopOutcome;
    if (running) outcome = { kind: "running" };
    else if (known && !parseSettings(round0?.description)) outcome = known.outcome;
    else if (!c || !decision) outcome = { kind: "stopped", why: "Round 0 has no Loop settings line, so the stop rules can't be applied" };
    else if (decision.action === "stop_success")
      outcome = {
        kind: "completed",
        passed: true,
        title: `Lap ${decision.lap} passed`,
        detail: `It met every check across ${c.trials_per_round} runs${decision.confirmed ? `, then met them again on ${c.trials_per_round} fresh runs` : ""}.`,
      };
    else if (decision.action === "stop_plateau")
      outcome = { kind: "completed", passed: false, title: "No lap passed", detail: `The loop stopped because ${decision.patience} laps in a row did no better than lap ${decision.bestLap}.` };
    else if (decision.action === "stop_cap") outcome = { kind: "completed", passed: false, title: "No lap passed", detail: `The loop ran all ${c.max_rounds} laps it was allowed.` };
    else if (active) outcome = { kind: "running" };
    else outcome = { kind: "stopped", why: decision.action === "start" ? `No stop rule fired; lap ${decision.lap} was next` : `No stop rule fired; lap ${decision.lap} needed more ${decision.phase} runs` };

    return {
      slug,
      settings,
      hypothesis: loopHypothesis(round0?.description),
      laps,
      totalLaps: ordered.length,
      cases,
      running,
      winnerLap: decision?.action === "stop_success" ? decision.lap : null,
      decision,
      outcome,
      isLoading: loading,
      error: (experiments.error ?? runs.error ?? null) as Error | null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments.data, runs.data, baseline.data, scored, resultsKey, slug]);
}
