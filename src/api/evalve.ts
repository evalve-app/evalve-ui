// The client for the Evalve backend (/evalve/v1). The backend passes the Kitaru
// session cookie and the X-CSRF-Token header to Kitaru (sc-284), so its calls go
// through the same sign-in gate as the Kitaru calls. Pages call the functions
// below, not `evalve` itself.
import createClient from "openapi-fetch";
import { ApiError, UnauthorizedError, errorDetail, signInGate } from "./client";
import type { components, paths } from "./evalve-schema";
import { backendVersion } from "../lib/newLoop";

export const evalve = createClient<paths>({ baseUrl: "", credentials: "same-origin", fetch: signInGate.fetch });

export type LoopListItem = components["schemas"]["LoopListItem"];
export type LoopDetail = components["schemas"]["LoopDetail"];
type LoopStatus = LoopListItem["status"];

// A 401 takes the same sign-in path as a 401 from Kitaru. Each other failure is
// an ApiError, so that a page can choose its text from the status, such as 404.
async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (data === undefined) throw new ApiError(response.status, errorDetail(error));
  return data;
}

// One page of the Loops of an agent, newest first. `cursor` is the
// `next_cursor` of the page before; `ownerAccountId` keeps only that owner's Loops,
// and `status` keeps only the Loops with that status.
export async function listLoops(agentId: string, opts: { ownerAccountId?: string; status?: LoopStatus; cursor?: string } = {}) {
  return unwrap(evalve.GET("/evalve/v1/loops", { params: { query: { agent_id: agentId, owner_account_id: opts.ownerAccountId, status: opts.status, cursor: opts.cursor } } }));
}

// Each Loop of an agent that the filters keep, newest first. This follows
// next_cursor to the end. The New Loop page uses it: its name check and its
// wait for the new Loop must not miss a Loop on a later page.
// A backend before 0.2.2 ignores `agent_id`: the caller compares the agent id too.
export async function listAllLoops(agentId: string, opts: { ownerAccountId?: string; status?: LoopStatus } = {}): Promise<LoopListItem[]> {
  const loops: LoopListItem[] = [];
  let cursor: string | undefined;
  do {
    const page = await listLoops(agentId, { ...opts, cursor });
    loops.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return loops;
}

// The version of the Evalve backend that can start a Loop.
// API: GET /evalve/health
// Does not use `unwrap`: the route needs no sign-in, so it gives no 401, and a
// 503 has a body that `backendVersion` must refuse.
export async function getBackendVersion(): Promise<string> {
  const { data, response } = await evalve.GET("/evalve/health");
  const version = backendVersion(response.status, data);
  if (!version) throw new Error("Could not reach the Evalve backend.");
  return version;
}

export async function getLoop(loopId: string): Promise<LoopDetail> {
  return unwrap(evalve.GET("/evalve/v1/loops/{loop_id}", { params: { path: { loop_id: loopId } } }));
}

// Cancels a running Loop of the caller. The answer is the Loop after the
// cancel. A Loop that ended before the cancel arrived answers 200 with its real
// status. A 503 is a usual answer: see `cancelTriesAgain` in src/lib/loopCancel.ts.
export async function cancelLoop(loopId: string): Promise<LoopDetail> {
  return unwrap(evalve.POST("/evalve/v1/loops/{loop_id}/cancel", { params: { path: { loop_id: loopId } } }));
}
