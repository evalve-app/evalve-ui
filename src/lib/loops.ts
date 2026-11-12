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
import type { Experiment, ExperimentRun } from "../api/client";

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

// Does this evaluator's result decide if a case passed? With no gating list,
// every evaluator gates, and so does a result with no evaluator name.
export function isGating(gatingEvaluators: string[] | undefined, evaluator: string | null | undefined): boolean {
  return !gatingEvaluators || !evaluator || gatingEvaluators.includes(evaluator);
}

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

const ROUND_NAME = /^(.+)-(round|lap|iteration)-(\d+)$/i;

// "day-30-refunds-round-1" → { slug: "day-30-refunds", lap: 1 }
// Iterations count from 1: "support-desk-demo-iteration-1" → { slug: "support-desk-demo", lap: 0 }
export function parseRoundName(experimentName: string): { slug: string; lap: number } | null {
  const m = experimentName.match(ROUND_NAME);
  if (!m) return null;
  const lap = m[2].toLowerCase() === "iteration" ? Number(m[3]) - 1 : Number(m[3]);
  return lap >= 0 ? { slug: m[1], lap } : null;
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

export type LoopOutcome =
  | { kind: "running" }
  | { kind: "completed"; passed: boolean; winnerLap: number | null; title: string; detail: string }
  | { kind: "canceled" };

type CompletedLoop = Extract<LoopOutcome, { kind: "completed" }>;
type KnownLoop = { baselineExperimentId?: string; settings?: LoopSettings; outcome: CompletedLoop };

// The archived reports record the outcome of demo loops that predate server metadata.
const KNOWN_LOOPS: Record<string, KnownLoop> = {
  "day-30-refunds": {
    settings: {
      name: "Day-30 refunds",
      criteria: { trials_per_round: 5, k: 3, screen_first: true, per_case_floor: "allow_one_miss", cohort_target_mean_pass_k: 0.9, no_regression: true, confirmation_round: true, max_rounds: 4, budget_usd: 1.0, plateau_patience: 2 },
      allowed_changes: ["system_prompt", "model"],
      allowed_models: ["gpt-4.1-mini", "gpt-4.1", "gpt-5-mini"],
      gate_evaluators: ["support-desk-action-correct"],
    },
    outcome: { kind: "completed", passed: true, winnerLap: 1, title: "Lap 1 passed", detail: "It met every check across 5 runs, then met them again on 5 fresh runs." },
  },
  "support-desk-demo": {
    baselineExperimentId: "01a1c733-f326-70af-af44-7e9bc55cb10a",
    outcome: { kind: "completed", passed: true, winnerLap: 1, title: "Lap 1 passed", detail: "All 20 cases passed in two consecutive replays." },
  },
};

export function knownLegacyLoop(slug: string, baselineExperimentId: string | undefined): KnownLoop | undefined {
  const known = KNOWN_LOOPS[slug];
  return known?.baselineExperimentId && known.baselineExperimentId !== baselineExperimentId ? undefined : known;
}

type EvalveResult =
  | { status: "running" }
  | { status: "stop_success"; winnerLap: number }
  | { status: "stop_attempt_cap" | "stop_budget"; reason: string | null };

type PublishedRun = { experimentId: string; runId: string };
type EvalveLoop = { requiredGreens: number; result: EvalveResult | null; publishedRuns: PublishedRun[] };

function parsePublishedRuns(laps: unknown): PublishedRun[] {
  if (!Array.isArray(laps)) return [];
  return laps.flatMap((lap: unknown) => {
    if (!lap || typeof lap !== "object" || !("experiment_id" in lap) || !("runs" in lap)) return [];
    const experimentId = lap.experiment_id;
    if (typeof experimentId !== "string" || !Array.isArray(lap.runs)) return [];
    return lap.runs.flatMap((run: unknown) => {
      if (!run || typeof run !== "object" || !("run_id" in run) || typeof run.run_id !== "string") return [];
      return [{ experimentId, runId: run.run_id }];
    });
  });
}

function descriptionRecord(description: string, prefix: string): Record<string, unknown> | null {
  const line = description.split("\n").find((line) => line.startsWith(prefix));
  if (!line) return null;
  try {
    const value: unknown = JSON.parse(line.slice(prefix.length));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The MVP runner publishes its decision on the baseline experiment.
export function parseEvalveLoop(description: string | null | undefined): EvalveLoop | null {
  if (!description) return null;
  const settings = descriptionRecord(description, "Evalve loop: ");
  if (settings?.schema_version !== 1 || settings.lap !== 0 || typeof settings.loop_id !== "string") return null;
  const requiredGreens = settings.required_consecutive_greens;
  if (typeof requiredGreens !== "number" || !Number.isInteger(requiredGreens) || requiredGreens < 1) return null;

  const saved = descriptionRecord(description, "Evalve result: ");
  let result: EvalveResult | null = null;
  if (saved?.schema_version === 1 && saved.loop_id === settings.loop_id) {
    const status = saved.status;
    if (status === "stop_success") {
      const winnerLap = saved.winner_lap;
      if (typeof winnerLap === "number" && Number.isInteger(winnerLap) && winnerLap >= 0) {
        result = { status, winnerLap };
      }
    } else if (status === "stop_attempt_cap" || status === "stop_budget") {
      result = { status, reason: typeof saved.reason === "string" ? saved.reason : null };
    } else if (status === "running") {
      result = { status };
    }
  }
  return {
    requiredGreens,
    result,
    publishedRuns: result && result.status !== "running" ? parsePublishedRuns(saved?.laps) : [],
  };
}

export function isActiveRun(run: Pick<ExperimentRun, "status">): boolean {
  return run.status === "running" || run.status === "canceling";
}

export function shouldPollLoopRuns(
  evalve: EvalveLoop | null,
  experimentIds: string[],
  cachedRuns: Pick<ExperimentRun, "id" | "status">[],
): boolean {
  if (cachedRuns.some(isActiveRun)) return true;
  if (!evalve) return false;
  if (!evalve.result || evalve.result.status === "running") return true;

  // The experiment description and run list update independently. A terminal
  // description can arrive before the query has seen the final replay.
  const cachedIds = new Set(cachedRuns.map((run) => run.id));
  return evalve.publishedRuns.some(({ experimentId, runId }) => experimentIds.includes(experimentId) && !cachedIds.has(runId));
}

export function resolveLoopOutcome(
  evalve: EvalveLoop | null,
  legacyCompletion: CompletedLoop | null,
  active: boolean,
  latestStatus: ExperimentRun["status"] | undefined,
): LoopOutcome {
  const result = evalve?.result;
  if (evalve && result?.status === "stop_success") {
    const greens = evalve.requiredGreens;
    return {
      kind: "completed", passed: true, winnerLap: result.winnerLap,
      title: `Lap ${result.winnerLap} passed`,
      detail: `Every case passed in ${greens} consecutive ${greens === 1 ? "replay" : "replays"}.`,
    };
  }
  if (result?.status === "stop_attempt_cap" || result?.status === "stop_budget") {
    return {
      kind: "completed", passed: false, winnerLap: null, title: "No lap passed",
      detail: result.reason ?? (result.status === "stop_budget" ? "The loop reached its replay budget." : "The loop reached its replay attempt cap."),
    };
  }
  if (active) return { kind: "running" };
  if (legacyCompletion) return legacyCompletion;
  return latestStatus === "canceled" ? { kind: "canceled" } : { kind: "running" };
}

// The one-line change a lap made: the skill writes "Round N: <change> Hypothesis: …".
export function lapSummary(description: string | null | undefined, lap: number) {
  if (lap === 0) return "Baseline lap, no changes";
  const first = (description ?? "").split("\n")[0] ?? "";
  return first
    .replace(/^\s*(lap|round|iteration)\s*\d+\s*:\s*/i, "")
    .replace(/\s*Hypothesis:.*$/i, "")
    .trim();
}

// The hypothesis the skill stores on every round's description.
export function loopHypothesis(description: string | null | undefined) {
  const m = description?.match(/Hypothesis:\s*([^\n]*)/i);
  return m ? m[1].trim() : "";
}
