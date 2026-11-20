// Helpers for reading experiment overrides and results.
import type { EvalAggregate, Experiment } from "../api/client";

const OVERRIDE_LABELS: Record<string, string> = {
  system_prompt: "System prompt",
  prompt: "Input prompt",
  model: "Model",
  model_params: "Model params",
};

// The parts of the agent this experiment changes (non-empty override fields).
export function changedFields(override: Experiment["override"] | null | undefined) {
  const o = (override ?? {}) as Record<string, unknown>;
  return Object.entries(o)
    .filter(([, v]) => v !== null && v !== undefined && !(typeof v === "object" && Object.keys(v as object).length === 0))
    .map(([key, value]) => ({ key, label: OVERRIDE_LABELS[key] ?? key, value }));
}

// Passed and total counts for one evaluator, for the baseline and the run.
// They come from the list of replays. The server lists only the 50 most
// recent replays of a run, so for a run with more, when the list was not
// completed (see runAggregates.ts), they come from the totals of the server.
export function passCounts(agg: EvalAggregate) {
  const replays = agg.replays ?? [];
  const total = agg.result?.count ?? 0;
  if (replays.length < total) {
    const passed = (stats: EvalAggregate["result"] | undefined) => Math.round((stats?.pass_rate ?? 0) * (stats?.count ?? 0));
    return { total, resultPassed: passed(agg.result), baselinePassed: passed(agg.baseline) };
  }
  const resultPassed = replays.filter((r) => r.result?.passed).length;
  const baselinePassed = replays.filter((r) => r.baseline?.passed).length;
  return { total: replays.length, resultPassed, baselinePassed };
}

// True when the run has scores for the recorded sessions, which the
// "Baseline" row shows. A Run that a Loop starts has none.
export function hasBaseline(agg: EvalAggregate): boolean {
  return (agg.baseline?.count ?? 0) > 0 || (agg.replays ?? []).some((r) => r.baseline != null);
}

// What a result card says in the place of the comparison when the run has no
// scores for the recorded sessions. Null when it has them.
export function baselineNote(agg: EvalAggregate): string | null {
  return hasBaseline(agg) ? null : "The recorded sessions have no score in this run, so there is no baseline to compare with.";
}

// "refund-10 run 1" → "refund-10": the case name without the run suffix.
export function caseName(sessionName: string | null | undefined) {
  return (sessionName ?? "").replace(/\s+run\s+\d+$/i, "");
}

// Human words for Kitaru's tool policy types.
export function toolPolicyLabel(type: string | undefined) {
  if (type === "passthrough") return "Calls the real tool";
  if (type === "history") return "Returns the recorded result";
  if (type === "static") return "Returns a fixed result";
  return type ?? "—";
}
