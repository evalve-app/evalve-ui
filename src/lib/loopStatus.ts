// The status and the outcome that the Loop pages show. The dashboard
// calculates no Loop status. For a backend Loop, `backendLoopOutcome` puts the
// words of the Evalve backend into the words of the UI. A Skill Loop gets its
// outcome from `skillLoopOutcome` in loops.ts.
import type { components } from "../api/evalve-schema";
import { CONTROL_PASSED_DETAIL, passedTitle } from "./loops";

type LoopDetail = components["schemas"]["LoopDetail"];
type NextAction = NonNullable<components["schemas"]["LoopListItem"]["next_action"]>;

// `title` is the outcome text next to the badge. Null: the badge shows alone.
export type LoopOutcome =
  | { kind: "running"; title: string | null; idleDeadline: string | null }
  | { kind: "completed"; passed: boolean; winnerLap: number | null; title: string; detail: string }
  | { kind: "canceled"; title: string | null }
  | { kind: "failed"; title: string | null }
  // A Skill Loop with no published end state. "No result" is not a Loop status.
  | { kind: "no_result" };

// What the status of a backend Loop comes from. A Loop list item has no
// `needs`, no `winner` and no setup, so the list passes null for the fields
// that come from them.
export type BackendLoopFacts = {
  status: LoopDetail["status"];
  outcome: LoopDetail["outcome"];
  reason: string | null;
  nextAction: NextAction | null;
  idleDeadline: string | null; // `needs.idle_deadline`
  passingExperiment: number | null; // the number of the Experiment that passed
  requiredGreens: number | null; // `setup.required_consecutive_greens`
};

export const WAITS_FOR_CHANGE = "Waits for a change";
export const WAITS_FOR_AGENT = "Waits for the coding agent";

// The next actions that only a call from the coding agent of the Loop owner
// starts (a Bearer credential, sc-484). The dashboard only refreshes a Loop,
// so the Loop waits for that call.
const AGENT_STARTS_RUN: ReadonlySet<NextAction> = new Set(["start_control", "resume_start", "replay", "retry"]);

function greensDetail(greens: number | null): string {
  if (greens == null) return "Every case passed.";
  return `Every case passed in ${greens} consecutive ${greens === 1 ? "run" : "runs"}.`;
}

export function backendLoopOutcome(loop: BackendLoopFacts): LoopOutcome {
  if (loop.status === "running") {
    if (loop.nextAction === "needs_change") return { kind: "running", title: WAITS_FOR_CHANGE, idleDeadline: loop.idleDeadline };
    if (loop.nextAction && AGENT_STARTS_RUN.has(loop.nextAction)) return { kind: "running", title: WAITS_FOR_AGENT, idleDeadline: null };
    return { kind: "running", title: null, idleDeadline: null };
  }
  if (loop.status === "cancelled") return { kind: "canceled", title: loop.outcome === "stopped_by_user" ? "Canceled by the Loop owner" : loop.reason };
  if (loop.status === "failed") return { kind: "failed", title: loop.reason };

  const completed = (passed: boolean, lap: number | null, title: string, detail: string): LoopOutcome => ({ kind: "completed", passed, winnerLap: lap, title, detail });
  switch (loop.outcome) {
    case "passed": {
      const lap = loop.passingExperiment;
      return completed(true, lap, lap == null ? "An experiment passed" : passedTitle(lap), greensDetail(loop.requiredGreens));
    }
    case "already_passing":
      return completed(true, 0, passedTitle(0), CONTROL_PASSED_DETAIL);
    case "max_runs":
      return completed(false, null, "Run limit reached", "The Loop used all of its runs.");
    case "budget_reached":
      return completed(false, null, "Budget reached", "The Loop reached its budget.");
    case "stopped_idle":
      return completed(false, null, "Wait limit reached", "No change came for 24 hours.");
    default:
      // The backend gives one of the outcomes above for a completed Loop.
      return completed(false, null, loop.reason ?? "No outcome", "");
  }
}

// The word and the dot tone of the status badge.
export function loopStatusLabel(outcome: LoopOutcome): { status: string; tone: "success" | "warning" | "destructive" | "muted" } {
  if (outcome.kind === "running") return { status: "Running", tone: "warning" };
  if (outcome.kind === "completed") return { status: "Completed", tone: outcome.passed ? "success" : "muted" };
  if (outcome.kind === "failed") return { status: "Failed", tone: "destructive" };
  if (outcome.kind === "canceled") return { status: "Canceled", tone: "muted" };
  return { status: "No result", tone: "muted" };
}

// The outcome text next to the badge, or null for none.
export function loopOutcomeText(outcome: LoopOutcome): string | null {
  return outcome.kind === "no_result" ? null : outcome.title;
}
