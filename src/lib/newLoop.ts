// The checks of the New Loop page that need an answer of the Evalve backend:
// the backend version, the name check, the Loop that ends the wait after the
// copy, and the text of the Loop budget.
import { usd } from "./loopSetup";

// What the page reads of a Loop in the Loop list of the backend.
export type ListedLoop = { loop_id: string; slug: string; agent_id: string; status: string };

// A version such as "0.2.2". The handoff prompt puts it in a shell command, so
// a version with a different form is not usable.
const VERSION = /^\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.]+)?$/;

// The version in an answer of `GET /evalve/health`. Null when the backend can
// not start a Loop: each status that is not 200 (503 is "no database"), and
// each answer with no usable version.
export function backendVersion(status: number, body: unknown): string | null {
  if (status !== 200) return null;
  const version = (body as { version?: unknown } | null | undefined)?.version;
  return typeof version === "string" && VERSION.test(version) ? version : null;
}

// Is a Loop with this name running on the agent? The backend refuses a second
// one with 409. This check is advice only: the 409 is the rule. The agent id
// is compared here too, because a backend before 0.2.2 ignores the `agent_id`
// filter and sends the Loops of each agent.
export function nameInUse(loops: ListedLoop[], agentId: string, slug: string): boolean {
  return !!slug && loops.some((loop) => loop.agent_id === agentId && loop.slug === slug && loop.status === "running");
}

// The Loop that the coding agent started from the handoff prompt, among the
// Loops of the viewer. Null while there is none.
// - `seenIds`: the Loops of the viewer at the time of Approve. A Loop that
//   ended frees its name, so an older Loop can have the same name, and it is
//   not the new Loop. Null when the page did not have the Loops at that time:
//   then only a running Loop is the new Loop.
export function startedLoop<L extends ListedLoop>(loops: L[], { agentId, slug, seenIds }: { agentId: string; slug: string; seenIds: ReadonlySet<string> | null }): L | null {
  if (!slug) return null;
  return loops.find((loop) => loop.agent_id === agentId && loop.slug === slug && (seenIds ? !seenIds.has(loop.loop_id) : loop.status === "running")) ?? null;
}

// The Loop budget as the most that the Loop can spend. The page shows no cost
// estimate of its own: the backend checks the estimate when the Loop starts.
// Null for a budget that a Loop can not have.
export function budgetLimitText(budget: number): string | null {
  return Number.isFinite(budget) && budget > 0 ? `This Loop can spend at most ${usd(budget)}.` : null;
}
