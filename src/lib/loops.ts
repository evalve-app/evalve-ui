// How evalve reads a Loop from Kitaru. The source of truth is the kitaru-loop
// skill (github.com/alyssa43/loop-skills); see docs/loop-contract.md.
//
// - A loop is the set of experiments named `<prefix>-round-0`, `-round-1`, …
//   (the skill's own naming; it finds its state by these names too).
// - Round 0 is the baseline audit. Each later round makes one change, stored
//   as the experiment's override.
// - The loop's rules live in the skill's kitaru-loop.json. The skill copies
//   them into round 0's description as one line, `Loop settings: {json}`, so
//   the dashboard can apply the same gate.
// The UI calls a round a "lap".
import type { Experiment } from "../api/client";

export type ChangeField = "system_prompt" | "model" | "model_params";

// Same keys as `criteria` in kitaru-loop.json.
export type Criteria = {
  trials_per_round: number;
  k: number;
  screen_first: boolean;
  per_case_floor: "allow_one_miss" | "strict";
  cohort_target_mean_pass_k: number;
  no_regression: boolean;
  confirmation_round: boolean;
  max_rounds: number;
  plateau_patience: number | null;
  budget_usd: number | null;
};

export type LoopSettings = {
  name: string;
  criteria: Criteria;
  allowed_changes: ChangeField[];
  allowed_models: string[];
  gate_evaluators?: string[]; // evaluator names that gate; all binary evaluators when absent
};

export const DEFAULT_CRITERIA: Criteria = {
  trials_per_round: 5,
  k: 3,
  screen_first: true,
  per_case_floor: "allow_one_miss",
  cohort_target_mean_pass_k: 0.9,
  no_regression: true,
  confirmation_round: true,
  max_rounds: 6,
  plateau_patience: 2,
  budget_usd: null,
};

export const CHANGE_FIELD_LABELS: Record<ChangeField, string> = {
  system_prompt: "System prompt",
  model: "Model",
  model_params: "Model params",
};

// Same slug rule as the skill's loop.py.
export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const ROUND_NAME = /^(.+)-(?:round|lap)-(\d+)$/i;

// "day-30-refunds-round-1" → { slug: "day-30-refunds", lap: 1 }
export function parseRoundName(experimentName: string): { slug: string; lap: number } | null {
  const m = experimentName.match(ROUND_NAME);
  return m ? { slug: m[1], lap: Number(m[2]) } : null;
}

// Group an agent's experiments into loops by name prefix.
export function groupLoops(experiments: Experiment[]) {
  const loops = new Map<string, { lap: number; experiment: Experiment }[]>();
  for (const e of experiments) {
    const r = parseRoundName(e.name);
    if (!r) continue;
    const list = loops.get(r.slug) ?? [];
    list.push({ lap: r.lap, experiment: e });
    loops.set(r.slug, list);
  }
  for (const list of loops.values()) list.sort((a, b) => a.lap - b.lap);
  return loops;
}

// Round 0's description ends with `Loop settings: {json}`. The kitaru-loop
// skill writes that line (`settings_line` in its loop.py); the dashboard only reads it.
export function parseSettings(description: string | null | undefined): LoopSettings | null {
  const m = description?.match(/Loop settings:\s*(\{.*\})\s*$/m);
  if (!m) return null;
  try {
    const s = JSON.parse(m[1]) as LoopSettings;
    return s.criteria ? { ...s, criteria: { ...DEFAULT_CRITERIA, ...s.criteria } } : null;
  } catch {
    return null;
  }
}

// The one-line change a lap made: the skill writes "Round N: <change> Hypothesis: …".
export function lapSummary(description: string | null | undefined, lap: number) {
  if (lap === 0) return "Baseline audit, no changes";
  const first = (description ?? "").split("\n")[0] ?? "";
  return first
    .replace(/^\s*(lap|round)\s*\d+\s*:\s*/i, "")
    .replace(/\s*Hypothesis:.*$/i, "")
    .trim();
}

// The hypothesis the skill stores on every round's description.
export function loopHypothesis(description: string | null | undefined) {
  const m = description?.match(/Hypothesis:\s*([^\n]*)/i);
  return m ? m[1].trim() : "";
}
