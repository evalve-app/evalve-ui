import { describe, expect, it } from "vitest";
import { ApiError, UnauthorizedError } from "../api/client";
import { canCancelLoop, cancelAlertText, cancelFailure, cancelTriesAgain, cancelWithTries } from "./loopCancel";

const OWNER = "8f2c41d0-aaaa-bbbb-cccc-000000000000";
const OTHER = "11111111-aaaa-bbbb-cccc-000000000000";

describe("who sees the Cancel Loop button", () => {
  it("shows the button to the Loop owner while the Loop runs", () => {
    expect(canCancelLoop({ status: "running", owner_account_id: OWNER }, OWNER)).toBe(true);
  });

  it("shows no button to a viewer who is not the Loop owner", () => {
    expect(canCancelLoop({ status: "running", owner_account_id: OWNER }, OTHER)).toBe(false);
  });

  it("shows no button while the account id of the viewer is not known", () => {
    expect(canCancelLoop({ status: "running", owner_account_id: OWNER }, null)).toBe(false);
  });

  it.each(["completed", "failed", "cancelled"] as const)("shows no button on a Loop with the status %s", (status) => {
    expect(canCancelLoop({ status, owner_account_id: OWNER }, OWNER)).toBe(false);
  });
});

describe("which failure of the cancel the dashboard sends again", () => {
  const busy = { status: 503, detail: "Kitaru has not confirmed cancellation. Try again." };

  it("sends the cancel again after a 503, as many as 3 more times", () => {
    expect([0, 1, 2].map((sentAgain) => cancelTriesAgain(busy, sentAgain))).toEqual([true, true, true]);
    expect(cancelTriesAgain(busy, 3)).toBe(false);
  });

  it.each([
    ["no answer from the server", { status: null, detail: null }],
    ["a 401", { status: 401, detail: null }],
    ["a 404", { status: 404, detail: "Loop not found." }],
    ["a 422", { status: 422, detail: null }],
    ["a 500", { status: 500, detail: null }],
  ])("does not send the cancel again after %s", (_, failure) => {
    expect(cancelTriesAgain(failure, 0)).toBe(false);
  });
});

describe("the text of the alert Could not cancel this Loop", () => {
  it("shows the detail of the backend after a 503", () => {
    expect(cancelAlertText({ status: 503, detail: "Kitaru has not confirmed cancellation. Try again." })).toBe("Kitaru has not confirmed cancellation. Try again.");
  });

  it("has no special text for the 404 of an account that is not the Loop owner", () => {
    expect(cancelAlertText({ status: 404, detail: "Loop not found." })).toBe("Loop not found.");
  });

  it("gives the HTTP status when the backend gives no detail", () => {
    expect(cancelAlertText({ status: 422, detail: null })).toBe("The Evalve backend returned HTTP 422.");
  });

  it("says that the Evalve backend did not answer after a network failure", () => {
    expect(cancelAlertText({ status: null, detail: null })).toBe("The Evalve backend did not answer. Try again in a moment.");
  });

  it("tells the person to cancel again after the sign-in ended", () => {
    expect(cancelAlertText({ status: 401, detail: "Not signed in." })).toBe("Your sign-in ended before the cancel. Cancel the Loop after you sign in.");
  });
});

describe("how the cancel call failed", () => {
  it("takes the status and the detail from an answer of the backend", () => {
    expect(cancelFailure(new ApiError(503, "Kitaru has not confirmed cancellation. Try again."))).toEqual({ status: 503, detail: "Kitaru has not confirmed cancellation. Try again." });
  });

  it("gives 401 when the sign-in ended", () => {
    expect(cancelFailure(new UnauthorizedError("Not signed in."))).toEqual({ status: 401, detail: null });
  });

  it("gives no status when no answer came", () => {
    expect(cancelFailure(new TypeError("Failed to fetch"))).toEqual({ status: null, detail: null });
  });
});

describe("the tries of one cancel", () => {
  const busy = () => new ApiError(503, "Kitaru has not confirmed cancellation. Try again.");
  // Sends give the answers in order. An Error is a failed call.
  function calls(answers: (string | Error)[]) {
    const waits: number[] = [];
    let sent = 0;
    const send = async () => {
      const answer = answers[sent++];
      if (answer instanceof Error) throw answer;
      return answer;
    };
    const wait = async (ms: number) => {
      waits.push(ms);
    };
    return { run: () => cancelWithTries(send, wait), waits, sent: () => sent };
  }

  it("gives the answer of the first try, with no wait", async () => {
    const c = calls(["canceled Loop"]);
    await expect(c.run()).resolves.toBe("canceled Loop");
    expect([c.sent(), c.waits]).toEqual([1, []]);
  });

  it("waits 2 seconds after a 503, and gives the answer of the next try", async () => {
    const c = calls([busy(), busy(), "canceled Loop"]);
    await expect(c.run()).resolves.toBe("canceled Loop");
    expect([c.sent(), c.waits]).toEqual([3, [2000, 2000]]);
  });

  it("stops after 3 more tries, and fails with the last 503", async () => {
    const c = calls([busy(), busy(), busy(), busy(), "not sent"]);
    await expect(c.run()).rejects.toMatchObject({ status: 503 });
    expect([c.sent(), c.waits]).toEqual([4, [2000, 2000, 2000]]);
  });

  it("fails at once for a failure that is not a 503", async () => {
    const c = calls([new ApiError(404, "Loop not found."), "not sent"]);
    await expect(c.run()).rejects.toMatchObject({ status: 404 });
    expect([c.sent(), c.waits]).toEqual([1, []]);
  });

  it("fails at once after a 503 when the next failure is not a 503", async () => {
    const c = calls([busy(), new TypeError("Failed to fetch"), "not sent"]);
    await expect(c.run()).rejects.toBeInstanceOf(TypeError);
    expect([c.sent(), c.waits]).toEqual([2, [2000]]);
  });
});
