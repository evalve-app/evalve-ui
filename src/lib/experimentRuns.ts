// What the experiment list shows of a run: one result for the whole run, and
// where it failed. The list shows it for the latest run of each experiment,
// and for each run of an experiment that the person opens.
import type { EvalAggregate } from "../api/client";
import { hasBaseline, passCounts } from "./experiments";
import { formatPercent } from "./format";
import { runResults } from "./loopResults";

export type RunOverview = {
  // The cases of the run, and how many passed every evaluator.
  cases: number;
  passed: number;
  // The pass rate of the run (see "Pass rate" in GLOSSARY.md). Null with no case.
  rate: number | null;
  // "95 of 103 cases passed every evaluator · 92.2%". Null with no case.
  summary: string | null;
  // The change in pass rate from the recorded sessions, in percentage points.
  // Null when the run has no scores for the recorded sessions.
  deltaPoints: number | null;
  // "Failed: scope-handling 3 · input-handling 2", or "Passed all 4
  // evaluators". Null with no case.
  failures: string | null;
  // One entry for each evaluator of the run, in the order of the server.
  evaluators: { name: string; aggregate: EvalAggregate }[];
};

// How many evaluators the failures text names before "+N more".
const NAMED = 3;

const evaluatorName = (a: EvalAggregate) => a.evaluator_name ?? a.name;

// The cases whose recorded session passed every evaluator that gives a
// pass/fail result for the recorded sessions.
function recordedPassed(aggregates: EvalAggregate[]): number {
  const scored = aggregates.filter((a) => (a.replays ?? []).some((r) => r.baseline?.passed != null));
  const flags = new Map<string, boolean[]>();
  for (const a of scored) for (const r of a.replays ?? []) flags.set(r.replay_id, [...(flags.get(r.replay_id) ?? []), r.baseline?.passed === true]);
  return [...flags.values()].filter((list) => list.length === scored.length && list.every(Boolean)).length;
}

// The results of one run. `aggregates` must list each replay of the run (see
// runAggregatesQuery.ts). A case passed when it passed every evaluator that
// gives a pass/fail result. A case with no result from one of them is not a pass.
export function runOverview(aggregates: EvalAggregate[]): RunOverview {
  const { passed: byCase, evaluators: required } = runResults(aggregates, [], undefined);
  const cases = byCase.size;
  const passed = [...byCase.values()].filter((v) => v === true).length;
  const evaluators = aggregates.map((a) => ({ name: evaluatorName(a), aggregate: a }));
  if (cases === 0) return { cases, passed, rate: null, summary: null, deltaPoints: null, failures: null, evaluators };

  const failing = aggregates
    .filter((a) => required.includes(evaluatorName(a)))
    .map((a) => ({ name: evaluatorName(a), failed: passCounts(a).total - passCounts(a).resultPassed }))
    .filter((e) => e.failed > 0)
    .sort((a, b) => b.failed - a.failed || a.name.localeCompare(b.name));
  const more = failing.length - NAMED;
  const failures = failing.length
    ? `Failed: ${failing
        .slice(0, NAMED)
        .map((e) => `${e.name} ${e.failed}`)
        .join(" · ")}${more > 0 ? ` · +${more} more` : ""}`
    : required.length === 1
      ? "Passed the evaluator"
      : `Passed all ${required.length} evaluators`;

  return {
    cases,
    passed,
    rate: passed / cases,
    summary: `${passed} of ${cases} ${cases === 1 ? "case" : "cases"} passed every evaluator · ${formatPercent(passed / cases)}`,
    deltaPoints: aggregates.some(hasBaseline) ? Math.round(((passed - recordedPassed(aggregates)) / cases) * 100) : null,
    failures,
    evaluators,
  };
}

// What the list says of the runs of an experiment together, because the
// latest run alone can hide that the runs do not agree: "3 runs: 95 to 96 of
// 103 passed". Null with fewer than two runs that have a result.
export function runsSpread(overviews: RunOverview[]): string | null {
  const scored = overviews.filter((o) => o.rate != null);
  if (scored.length < 2) return null;
  const n = `${scored.length} runs`;
  const cases = scored[0].cases;
  if (scored.some((o) => o.cases !== cases)) {
    // The runs do not have the same cases, so only the rates compare.
    const rates = scored.map((o) => o.rate!);
    return `${n}: ${formatPercent(Math.min(...rates))} to ${formatPercent(Math.max(...rates))} passed`;
  }
  const low = Math.min(...scored.map((o) => o.passed));
  const high = Math.max(...scored.map((o) => o.passed));
  return low === high ? `${n}: ${low} of ${cases} passed in each` : `${n}: ${low} to ${high} of ${cases} passed`;
}

// The change in pass rate from the control experiment of the Loop, in
// percentage points, for an experiment of a Loop. A Run that a Loop starts
// has no scores for the recorded sessions, so the control experiment is what
// it compares with. Null when one of the two has no pass rate.
export function controlDeltaPoints(run: RunOverview, control: RunOverview | undefined): number | null {
  return run.rate == null || control?.rate == null ? null : Math.round((run.rate - control.rate) * 100);
}
export const CONTROL_DELTA_TITLE = "Change in pass rate from the control experiment of the Loop";

// What the "Replay cost" label means, for a tooltip.
export const REPLAY_COST_TITLE = "The cost that Kitaru recorded for the replayed sessions: the model calls of the agent. The model calls of the evaluators are not in it.";

// The cost of the result sessions of one run, as a decimal string in US
// dollars. Null when no session has a cost.
export function runCost(sessions: { cost?: string | null }[]): string | null {
  const costs = sessions.filter((s) => s.cost != null && Number.isFinite(Number(s.cost))).map((s) => Number(s.cost));
  return costs.length ? String(costs.reduce((sum, cost) => sum + cost, 0)) : null;
}

// The cost of an experiment: the sum of the cost of its runs. Null when no
// run has a cost.
export function totalCost(runCosts: (string | null | undefined)[]): string | null {
  return runCost(runCosts.map((cost) => ({ cost })));
}

// The runs of each experiment, oldest run first, as the Results table of a
// Loop lists them.
export function runsByExperiment<T extends { experiment_id: string; number: number }>(runs: T[]): Map<string, T[]> {
  const byExperiment = new Map<string, T[]>();
  for (const run of [...runs].sort((a, b) => a.number - b.number)) byExperiment.set(run.experiment_id, [...(byExperiment.get(run.experiment_id) ?? []), run]);
  return byExperiment;
}
