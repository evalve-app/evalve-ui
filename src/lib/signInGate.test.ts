import { describe, expect, it } from "vitest";
import { createSignInGate } from "./signInGate";

const URL = "http://kitaru.example/api/v1/experiment-runs";
const get = () => new Request(URL);
const post = () => new Request(URL, { method: "POST", body: JSON.stringify({ cohort_version_id: "c1" }) });

// A server that answers each request in turn with the next status of `statuses`.
function server(statuses: number[]) {
  const requests: Request[] = [];
  const send = (request: Request) => {
    requests.push(request);
    return Promise.resolve(new Response(null, { status: statuses[requests.length - 1] ?? 200 }));
  };
  return { requests, send };
}

// A server that answers a request only when the test calls `answer`.
function slowServer() {
  const answers: Array<(response: Response) => void> = [];
  const send = () => new Promise<Response>((resolve) => answers.push(resolve));
  return { answers, send, answer: (index: number, status: number) => answers[index]!(new Response(null, { status })) };
}

// Lets the promises that are ready now complete.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createSignInGate", () => {
  it("starts signed out", () => {
    expect(createSignInGate(server([]).send).state()).toBe("signed-out");
  });

  it("returns a response that is not a 401, with one request", async () => {
    const { requests, send } = server([200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    expect((await gate.fetch(get())).status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-in");
  });

  it("returns a 500 of a signed-in person, so the page shows the failure", async () => {
    const { requests, send } = server([500]);
    const gate = createSignInGate(send);
    gate.signedIn();

    expect((await gate.fetch(get())).status).toBe(500);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-in");
  });

  it("returns the 401 of a person who is not signed in, so the login page opens", async () => {
    const { requests, send } = server([401]);
    const gate = createSignInGate(send);

    expect((await gate.fetch(get())).status).toBe(401);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-out");
  });

  it("holds a read that gets a 401, and sends it again after the person signs in again", async () => {
    const { requests, send } = server([401, 200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    let answer: Response | undefined;
    const pending = gate.fetch(get()).then((response) => (answer = response));
    await settle();
    expect(gate.state()).toBe("ended");
    expect(answer).toBeUndefined();
    expect(requests).toHaveLength(1);

    gate.signedIn();
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(gate.state()).toBe("signed-in");
  });

  it("gives each try a new copy of the request, so the second try can carry the new CSRF token", async () => {
    let token = "old";
    const seen: Array<string | null> = [];
    const gate = createSignInGate((request) => {
      request.headers.set("X-CSRF-Token", token);
      seen.push(request.headers.get("X-CSRF-Token"));
      return Promise.resolve(new Response(null, { status: token === "old" ? 401 : 200 }));
    });
    gate.signedIn();
    const original = get();

    const pending = gate.fetch(original);
    await settle();
    token = "new";
    gate.signedIn();

    expect((await pending).status).toBe(200);
    expect(seen).toEqual(["old", "new"]);
    expect(original.headers.get("X-CSRF-Token")).toBeNull();
  });

  it("holds each read that gets a 401, and one sign-in sends them all again", async () => {
    const { requests, send } = server([401, 401, 401, 200, 200, 200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    const pending = Promise.all([gate.fetch(get()), gate.fetch(get()), gate.fetch(get())]);
    await settle();
    expect(gate.state()).toBe("ended");
    expect(requests).toHaveLength(3);

    gate.signedIn();
    expect((await pending).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(requests).toHaveLength(6);
  });

  it("holds the read again when the server refuses the new sign-in also", async () => {
    const { requests, send } = server([401, 401, 200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    let answer: Response | undefined;
    const pending = gate.fetch(get()).then((response) => (answer = response));
    await settle();
    gate.signedIn();
    await settle();
    expect(gate.state()).toBe("ended");
    expect(answer).toBeUndefined();

    gate.signedIn();
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(3);
  });

  it("returns the 401 of a request that changes data, and does not send the request again", async () => {
    const { requests, send } = server([401, 200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    expect((await gate.fetch(post())).status).toBe(401);
    expect(gate.state()).toBe("ended");

    gate.signedIn();
    await settle();
    expect(requests).toHaveLength(1);
  });

  it("sends the body of a request that changes data", async () => {
    const { requests, send } = server([200]);
    const gate = createSignInGate(send);
    gate.signedIn();

    await gate.fetch(post());
    expect(await requests[0]!.json()).toEqual({ cohort_version_id: "c1" });
  });

  it("sends a read again with no new sign-in, when its 401 answers a request from before the newest sign-in", async () => {
    const { answers, send, answer } = slowServer();
    const gate = createSignInGate(send);
    gate.signedIn();

    // The request leaves, then a sign-in occurs (in the dialog), then the 401 arrives.
    const pending = gate.fetch(get());
    gate.signedIn();
    answer(0, 401);
    await settle();
    expect(gate.state()).toBe("signed-in");
    expect(answers).toHaveLength(2);

    answer(1, 200);
    expect((await pending).status).toBe(200);
  });

  it("returns the 401 to each read that waits, when the person signs out", async () => {
    const { requests, send } = server([401]);
    const gate = createSignInGate(send);
    gate.signedIn();

    const pending = gate.fetch(get());
    await settle();
    gate.signedOut();

    expect((await pending).status).toBe(401);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-out");
  });

  it("tells a listener about each change of the state, and stops after the listener leaves", async () => {
    const { send } = server([401]);
    const gate = createSignInGate(send);
    const states: string[] = [];
    const stop = gate.subscribe(() => states.push(gate.state()));

    gate.signedIn();
    gate.signedIn(); // No change of the state: no call.
    void gate.fetch(get());
    await settle();
    gate.signedIn();
    stop();
    gate.signedOut();

    expect(states).toEqual(["signed-in", "ended", "signed-in"]);
  });
});
