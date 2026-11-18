// The rules of "Cancel Loop" on the Loop page: who sees the button, which
// failure the dashboard sends again, and the text of the alert. The call is
// POST /evalve/v1/loops/{loop_id}/cancel (`cancelLoop` in src/api/evalve.ts).
import { ApiError, UnauthorizedError } from "../api/client";
import type { LoopDetail } from "../api/evalve";

// Only the Loop owner cancels a Loop, and only a Loop that runs. The backend
// gives 404 to each other account, so each other viewer gets no button. The
// viewer is null while the read of the account is in progress, or after it failed.
export function canCancelLoop(loop: Pick<LoopDetail, "status" | "owner_account_id">, viewerAccountId: string | null): boolean {
  return loop.status === "running" && viewerAccountId !== null && viewerAccountId === loop.owner_account_id;
}

// How the cancel call failed. `status` is null when no response came.
export type CancelFailure = { status: number | null; detail: string | null };

// A call that threw something other than these two errors got no response.
export function cancelFailure(error: unknown): CancelFailure {
  if (error instanceof UnauthorizedError) return { status: 401, detail: null };
  return error instanceof ApiError ? { status: error.status, detail: error.detail } : { status: null, detail: null };
}

// The dashboard sends a refused cancel again as many as 3 more times, with 2 seconds between the tries.
const CANCEL_MORE_TRIES = 3;
const CANCEL_TRY_WAIT_MS = 2000;

// A 503 is a usual answer of the cancel route: a different call holds the Loop
// lock, or Kitaru did not confirm the start of a run yet. The cancel is safe to
// send again, so the dashboard sends it again by itself. `sentAgain` is the
// number of tries after the first one. Each other failure goes to the person.
export function cancelTriesAgain(failure: CancelFailure, sentAgain: number): boolean {
  return failure.status === 503 && sentAgain < CANCEL_MORE_TRIES;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// One cancel: `send` sends the call, and this function sends it again after
// each refused try (see `cancelTriesAgain`). It gives the answer of the first
// good try, or throws the failure of the last try. The tries do not wait for
// the browser tab to be visible: a Loop spends money until the cancel arrives.
export async function cancelWithTries<T>(send: () => Promise<T>, wait: (ms: number) => Promise<void> = sleep): Promise<T> {
  for (let sentAgain = 0; ; sentAgain++) {
    try {
      return await send();
    } catch (error) {
      if (!cancelTriesAgain(cancelFailure(error), sentAgain)) throw error;
      await wait(CANCEL_TRY_WAIT_MS);
    }
  }
}

// The text of the alert "Could not cancel this Loop": the detail of the
// backend, when it gave one. A 401 opens the "Sign in again" dialog (see
// src/lib/signInGate.ts), and the dashboard does not send the cancel again, so
// the text tells the person to do the action again.
export function cancelAlertText({ status, detail }: CancelFailure): string {
  if (status === 401) return "Your sign-in ended before the cancel. Cancel the Loop after you sign in.";
  if (status === null) return "The Evalve backend did not answer. Try again in a moment.";
  return detail ?? `The Evalve backend returned HTTP ${status}.`;
}
