// How the Loop pages read a backend Loop: a Loop that the Evalve backend owns.
// The backend keeps the status, the outcome, the Loop owner and the spend, and
// the dashboard shows them. Skill Loops are in loops.ts.
import type { LoopDetail, LoopListItem } from "../api/evalve";
import { formatCost } from "./format";
import type { EvalveSetup, SkillLoopRow } from "./loops";
import { backendLoopOutcome, type LoopOutcome } from "./loopStatus";

// The Loop page and the list poll at this interval while a Loop is running.
export const LOOP_POLL_MS = 4000;

// Poll while one Loop or more is running, and stop at an end state.
export function loopPollInterval(statuses: LoopListItem["status"][]): number | false {
  return statuses.includes("running") ? LOOP_POLL_MS : false;
}

export function detailOutcome(loop: LoopDetail): LoopOutcome {
  return backendLoopOutcome({
    status: loop.status,
    outcome: loop.outcome,
    reason: loop.reason,
    nextAction: loop.next?.action ?? null,
    idleDeadline: loop.needs?.idle_deadline ?? null,
    passingExperiment: loop.winner?.experiment ?? null,
    requiredGreens: loop.setup.required_consecutive_greens,
  });
}

export function listItemOutcome(item: LoopListItem): LoopOutcome {
  return backendLoopOutcome({
    status: item.status,
    outcome: item.outcome,
    reason: item.reason,
    nextAction: item.next_action,
    idleDeadline: null, // the list shows no idle deadline; the Loop page does
    // A list item has no `winner`. A Loop stops at the first Experiment that
    // passes, so that Experiment is the last one: `experiments` counts the
    // Control Experiment, which is Experiment 0.
    passingExperiment: item.outcome === "passed" ? item.experiments - 1 : null,
    requiredGreens: null,
  });
}

// The time at which a backend Loop ended, for the "Ended" line of the Loop
// page. Null while the Loop runs. The backend sets `updated_at` in the same
// write that ends the Loop.
export function loopEndedAt(loop: Pick<LoopDetail, "status" | "updated_at">): string | null {
  return loop.status === "running" ? null : loop.updated_at;
}

// The name of the Loop owner. "You" for the viewer's own Loop. Before the
// name loads, and when Kitaru refuses the call or has no such account, the
// first 8 characters of the account id.
export function ownerLabel(ownerAccountId: string, viewerAccountId: string | null | undefined, name: string | null | undefined): string {
  if (viewerAccountId && ownerAccountId === viewerAccountId) return "You";
  return name || ownerAccountId.slice(0, 8);
}

export function spendText(spend: LoopListItem["spend"]): string {
  return `${formatCost(spend.recorded_usd)} of ${formatCost(spend.budget_usd)}`;
}

// The setup of a backend Loop, in the shape that the setup card reads.
export function backendSetup(setup: LoopDetail["setup"]): EvalveSetup {
  return {
    name: setup.name,
    cohortVersionId: setup.cohort_version_id,
    agentVersionId: setup.agent_version ?? null,
    evaluators: setup.evaluators.map((e) => e.ref),
    allowedChanges: setup.allowed_changes,
    allowedModels: setup.allowed_models,
    requiredGreens: setup.required_consecutive_greens,
    maxAttempts: setup.max_runs,
    budgetUsd: setup.budget_usd,
  };
}

// The names of the evaluators that decide if a case passed: each ref is "<name>@<version>".
export function gatingEvaluatorNames(setup: LoopDetail["setup"]): string[] {
  return setup.evaluators.map((e) => e.ref.split("@")[0]);
}

// One row of the Loop list: a backend Loop or a Skill Loop.
export type LoopRow =
  | {
      kind: "backend";
      key: string;
      loopId: string;
      name: string;
      hypothesis: string | null;
      ownerAccountId: string;
      outcome: LoopOutcome;
      experimentsTried: number;
      spend: string;
      updatedAt: string;
    }
  | ({ kind: "skill"; key: string } & SkillLoopRow);

// The rows of the Loop list, newest first. The backend Loops are the pages
// loaded so far. "Only my Loops" hides the Skill Loops: they have no Loop owner.
export function loopListRows(backend: LoopListItem[], skill: SkillLoopRow[], onlyMine: boolean): LoopRow[] {
  const rows: LoopRow[] = [
    ...backend.map((item): LoopRow => ({
      kind: "backend",
      key: `loop:${item.loop_id}`,
      loopId: item.loop_id,
      name: item.name,
      hypothesis: item.hypothesis,
      ownerAccountId: item.owner_account_id,
      outcome: listItemOutcome(item),
      experimentsTried: Math.max(item.experiments - 1, 0), // without the Control Experiment
      spend: spendText(item.spend),
      updatedAt: item.updated_at,
    })),
    ...(onlyMine ? [] : skill.map((row): LoopRow => ({ kind: "skill", key: `skill:${row.slug}`, ...row }))),
  ];
  return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
