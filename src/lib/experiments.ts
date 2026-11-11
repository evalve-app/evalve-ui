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
export function passCounts(agg: EvalAggregate) {
  const replays = agg.replays ?? [];
  const resultPassed = replays.filter((r) => r.result?.passed).length;
  const baselinePassed = replays.filter((r) => r.baseline?.passed).length;
  return { total: replays.length, resultPassed, baselinePassed };
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
