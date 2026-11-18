// The client for the Evalve backend (/evalve/v1). The backend passes the Kitaru
// session cookie and the X-CSRF-Token header to Kitaru (sc-284), so its calls go
// through the same sign-in gate as the Kitaru calls. Pages call the functions
// below, not `evalve` itself.
import createClient from "openapi-fetch";
import { ApiError, UnauthorizedError, errorDetail, signInGate } from "./client";
import type { components, paths } from "./evalve-schema";

export const evalve = createClient<paths>({ baseUrl: "", credentials: "same-origin", fetch: signInGate.fetch });

export type LoopListItem = components["schemas"]["LoopListItem"];
export type LoopDetail = components["schemas"]["LoopDetail"];

// A 401 takes the same sign-in path as a 401 from Kitaru. Each other failure is
// an ApiError, so that a page can choose its text from the status, such as 404.
async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (data === undefined) throw new ApiError(response.status, errorDetail(error));
  return data;
}

// One page of the Loops of an agent, newest first. `cursor` is the
// `next_cursor` of the page before; `ownerAccountId` keeps only that owner's Loops.
export async function listLoops(agentId: string, opts: { ownerAccountId?: string; cursor?: string } = {}) {
  return unwrap(evalve.GET("/evalve/v1/loops", { params: { query: { agent_id: agentId, owner_account_id: opts.ownerAccountId, cursor: opts.cursor } } }));
}

export async function getLoop(loopId: string): Promise<LoopDetail> {
  return unwrap(evalve.GET("/evalve/v1/loops/{loop_id}", { params: { path: { loop_id: loopId } } }));
}
