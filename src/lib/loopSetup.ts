// The fields of the setup card of a loop: the name, the hypothesis, the cohort
// version, the gating evaluators, what may change and the rules of the loop.
// The card shows only what the loop carries on the server. A field that the
// loop does not carry shows a dash, never a default value.
import { versionLabel } from "./cohorts";
import { CHANGE_FIELD_LABELS, type ChangeField, type EvalveSetup, type LoopSettings } from "./loops";

// What the card shows for a field that the loop does not carry.
export const ABSENT = "—";

// The cohort version that the loop replays.
export type SetupCohort = { name: string; version: string; caseCount: number };

export type SetupFields = {
  name: string;
  hypothesis: string;
  cohort: string; // "Refund requests · v3 (23 cases)"
  gatingEvaluators: string[]; // one dash when the loop names none
  changes: string[]; // one dash when the loop names none
  greenRuns: string;
  maxRuns: string;
  budget: string; // "$5.00"
};

// The cohort version with id `cohortVersionId` among the cohorts of the agent.
// `versionsByCohort` maps a cohort id to its versions, and has no entry for a
// cohort whose versions did not load. Null when no loaded cohort has the version.
export function findSetupCohort(
  cohorts: { id: string; name: string }[],
  versionsByCohort: Record<string, { id: string; version: number; display_version?: string | null; session_count: number }[] | undefined>,
  cohortVersionId: string | null,
): SetupCohort | null {
  for (const cohort of cohorts) {
    const version = versionsByCohort[cohort.id]?.find((v) => v.id === cohortVersionId);
    if (version) return { name: cohort.name, version: versionLabel(version), caseCount: version.session_count };
  }
  return null;
}

// A budget in USD with two decimals: "5.00" and 1.5 give "$5.00" and "$1.50".
function usd(budget: string | number | null | undefined): string {
  const n = budget == null || budget === "" ? NaN : Number(budget);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : ABSENT;
}

const list = (items: string[] | null | undefined): string[] => (items?.length ? items : [ABSENT]);

// - `evalve`: the setup in the loop settings line of the runner. Null for a loop that the old skill made.
// - `settings`: the settings of a loop that the old skill made. They hold no
//   count of green runs and no cap on runs, so these two fields show a dash.
// - `cohort`: null while the cohort loads, and when the server does not have it.
// A loop always has a name: a loop with no name in its settings shows the name of its experiments.
export function setupFields(loop: { slug: string; hypothesis: string; evalve: EvalveSetup | null; settings: LoopSettings | null; cohort: SetupCohort | null }): SetupFields {
  const { slug, hypothesis, evalve, settings, cohort } = loop;
  const changes = evalve ? evalve.allowedChanges : settings?.allowed_changes;
  const budget = evalve ? evalve.budgetUsd : settings?.criteria.budget_usd;
  return {
    name: (evalve ? evalve.name : settings?.name) || slug,
    hypothesis: hypothesis || ABSENT,
    cohort: cohort ? `${cohort.name} · ${cohort.version} (${cohort.caseCount} ${cohort.caseCount === 1 ? "case" : "cases"})` : ABSENT,
    gatingEvaluators: list(evalve ? evalve.evaluators : settings?.gate_evaluators),
    changes: list(changes?.map((field) => CHANGE_FIELD_LABELS[field as ChangeField] ?? field)),
    greenRuns: evalve ? String(evalve.requiredGreens) : ABSENT,
    maxRuns: evalve?.maxAttempts != null ? String(evalve.maxAttempts) : ABSENT,
    budget: usd(budget),
  };
}
