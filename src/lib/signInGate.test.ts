import { describe, expect, it } from "vitest";
import { createSignInGate, signInBlocks, type SignInGate } from "./signInGate";

const URL = "http://kitaru.example/api/v1/experiment-runs";
const get = () => new Request(URL);
const post = () => new Request(URL, { method: "POST", body: JSON.stringify({ cohort_version_id: "c1" }) });
const getAccount = () => new Request("http://kitaru.example/api/v1/accounts/me");

type Send = (request: Request) => Promise<Response>;

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

// A gate of a signed-in person: the read of the account got a good answer at
// the page load. `send` gets only the requests after that.
async function signedInGate(send: Send): Promise<SignInGate> {
  let loaded = false;
  const gate = createSignInGate((request) => (loaded ? send(request) : Promise.resolve(new Response(null, { status: 200 }))));
  await gate.fetchAccount(getAccount());
  loaded = true;
  return gate;
}

// The person signs in again in the dialog, and then the page shows the account.
function signInAgain(gate: SignInGate) {
  gate.accepted();
  gate.accountShown();
}

describe("createSignInGate", () => {
  it("starts signed out", () => {
    expect(createSignInGate(server([]).send).state()).toBe("signed-out");
  });

  it("returns a response that is not a 401, with one request", async () => {
    const { requests, send } = server([200]);
    const gate = await signedInGate(send);

    expect((await gate.fetch(get())).status).toBe(200);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-in");
  });

  it("returns a 500 of a signed-in person, so the page shows the failure", async () => {
    const { requests, send } = server([500]);
    const gate = await signedInGate(send);

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
    const gate = await signedInGate(send);

    let answer: Response | undefined;
    const pending = gate.fetch(get()).then((response) => (answer = response));
    await settle();
    expect(gate.state()).toBe("ended");
    expect(answer).toBeUndefined();
    expect(requests).toHaveLength(1);

    signInAgain(gate);
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(gate.state()).toBe("signed-in");
  });

  it("gives each try a new copy of the request, so the second try can carry the new CSRF token", async () => {
    let token = "old";
    const seen: Array<string | null> = [];
    const gate = await signedInGate((request) => {
      request.headers.set("X-CSRF-Token", token);
      seen.push(request.headers.get("X-CSRF-Token"));
      return Promise.resolve(new Response(null, { status: token === "old" ? 401 : 200 }));
    });
    const original = get();

    const pending = gate.fetch(original);
    await settle();
    token = "new";
    signInAgain(gate);

    expect((await pending).status).toBe(200);
    expect(seen).toEqual(["old", "new"]);
    expect(original.headers.get("X-CSRF-Token")).toBeNull();
  });

  it("holds each read that gets a 401, and one sign-in sends them all again", async () => {
    const { requests, send } = server([401, 401, 401, 200, 200, 200]);
    const gate = await signedInGate(send);

    const pending = Promise.all([gate.fetch(get()), gate.fetch(get()), gate.fetch(get())]);
    await settle();
    expect(gate.state()).toBe("ended");
    expect(requests).toHaveLength(3);

    signInAgain(gate);
    expect((await pending).map((response) => response.status)).toEqual([200, 200, 200]);
    expect(requests).toHaveLength(6);
  });

  it("holds the read again when the server refuses the new sign-in also", async () => {
    const { requests, send } = server([401, 401, 200]);
    const gate = await signedInGate(send);

    let answer: Response | undefined;
    const pending = gate.fetch(get()).then((response) => (answer = response));
    await settle();
    signInAgain(gate);
    await settle();
    expect(gate.state()).toBe("ended");
    expect(answer).toBeUndefined();

    signInAgain(gate);
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(3);
  });

  it("returns the 401 of a request that changes data, and does not send the request again", async () => {
    const { requests, send } = server([401, 200]);
    const gate = await signedInGate(send);

    expect((await gate.fetch(post())).status).toBe(401);
    expect(gate.state()).toBe("ended");

    signInAgain(gate);
    await settle();
    expect(requests).toHaveLength(1);
  });

  it("sends the body of a request that changes data", async () => {
    const { requests, send } = server([200]);
    const gate = await signedInGate(send);

    await gate.fetch(post());
    expect(await requests[0]!.json()).toEqual({ cohort_version_id: "c1" });
  });

  it("sends a read again with no new dialog, when its 401 answers a request from before the newest sign-in", async () => {
    const { answers, send, answer } = slowServer();
    const gate = await signedInGate(send);

    // A slow read leaves. A second read gets a 401, and the person signs in again.
    const slow = gate.fetch(get());
    const fast = gate.fetch(get());
    await settle();
    answer(1, 401);
    await settle();
    signInAgain(gate);
    await settle();
    answer(2, 200);
    expect((await fast).status).toBe(200);

    // The 401 of the slow read arrives after the new sign-in.
    answer(0, 401);
    await settle();
    expect(gate.state()).toBe("signed-in");
    expect(answers).toHaveLength(4);

    answer(3, 200);
    expect((await slow).status).toBe(200);
  });

  it("returns the 401 to each read that waits, when the person signs out", async () => {
    const { requests, send } = server([401]);
    const gate = await signedInGate(send);

    const pending = gate.fetch(get());
    await settle();
    gate.signedOut();

    expect((await pending).status).toBe(401);
    expect(requests).toHaveLength(1);
    expect(gate.state()).toBe("signed-out");
  });

  it("tells a listener about each change of the state, and stops after the listener leaves", async () => {
    const { send } = server([200, 401]);
    const gate = createSignInGate(send);
    const states: string[] = [];
    const stop = gate.subscribe(() => states.push(gate.state()));

    await gate.fetchAccount(getAccount());
    void gate.fetch(get());
    await settle();
    gate.accepted();
    gate.accepted(); // No change of the state: no call.
    gate.accountShown();
    stop();
    gate.signedOut();

    expect(states).toEqual(["signed-in", "ended", "checking", "signed-in"]);
  });
});

describe("a sign-in in the dialog", () => {
  it("keeps the page blocked after the server accepts the sign-in, until the page shows the account", async () => {
    const { requests, send } = server([401, 200]);
    const gate = await signedInGate(send);

    const pending = gate.fetch(get());
    await settle();
    gate.accepted();
    await settle();
    expect(gate.state()).toBe("checking");
    expect(signInBlocks(gate.state())).toBe(true);
    expect(requests).toHaveLength(1);

    gate.accountShown();
    expect((await pending).status).toBe(200);
    expect(gate.state()).toBe("signed-in");
    expect(requests).toHaveLength(2);
  });

  it("lets the read of the account leave during the check, and holds a new read of other data", async () => {
    const { requests, send } = server([401, 200, 200]);
    const gate = await signedInGate(send);
    await gate.fetch(post());
    gate.accepted();

    let answer: Response | undefined;
    const pending = gate.fetch(get()).then((response) => (answer = response));
    await settle();
    expect(requests).toHaveLength(1);

    expect((await gate.fetchAccount(getAccount())).status).toBe(200);
    expect(requests).toHaveLength(2);
    // The answer of the account does not open the page: the page shows the account before.
    expect(gate.state()).toBe("checking");
    expect(answer).toBeUndefined();

    gate.accountShown();
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(3);
  });

  it("returns the 401 of the account check, and asks for a sign-in again", async () => {
    const { requests, send } = server([401, 401]);
    const gate = await signedInGate(send);
    await gate.fetch(post());
    gate.accepted();

    expect((await gate.fetchAccount(getAccount())).status).toBe(401);
    expect(gate.state()).toBe("ended");
    expect(requests).toHaveLength(2);
  });

  it("holds the read of the account that gets a 401 with no check in progress, so the page stays", async () => {
    const { requests, send } = server([401, 200]);
    const gate = await signedInGate(send);

    let answer: Response | undefined;
    const pending = gate.fetchAccount(getAccount()).then((response) => (answer = response));
    await settle();
    expect(gate.state()).toBe("ended");
    expect(answer).toBeUndefined();

    signInAgain(gate);
    await pending;
    expect(answer?.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("does not open the page before the server accepts a sign-in", async () => {
    const { send } = server([401]);
    const gate = await signedInGate(send);
    await gate.fetch(post());

    gate.accountShown();
    expect(gate.state()).toBe("ended");
  });

  it("releases each read that waits, when the person signs out during the check", async () => {
    const { requests, send } = server([401]);
    const gate = await signedInGate(send);

    const pending = gate.fetch(get());
    await settle();
    gate.accepted();
    gate.signedOut();

    expect((await pending).status).toBe(401);
    expect(requests).toHaveLength(1);
    gate.accountShown();
    expect(gate.state()).toBe("signed-out");
  });
});

describe("the read of the account", () => {
  it("makes a signed-out person signed in, when the server returns the account", async () => {
    const gate = createSignInGate(server([200]).send);

    await gate.fetchAccount(getAccount());
    expect(gate.state()).toBe("signed-in");
  });

  it("keeps a person signed out after a sign-in on the login page, until the server returns the account", async () => {
    const gate = createSignInGate(server([200]).send);

    gate.accepted();
    expect(gate.state()).toBe("signed-out");
    await gate.fetchAccount(getAccount());
    expect(gate.state()).toBe("signed-in");
  });

  it("keeps a person signed out when the read fails", async () => {
    const gate = createSignInGate(server([500, 401]).send);

    expect((await gate.fetchAccount(getAccount())).status).toBe(500);
    expect((await gate.fetchAccount(getAccount())).status).toBe(401);
    expect(gate.state()).toBe("signed-out");
  });

  it("keeps a person signed out when a read of other data gets a good answer", async () => {
    const gate = createSignInGate(server([200]).send);

    await gate.fetch(get());
    expect(gate.state()).toBe("signed-out");
  });

  it("ignores an answer that is from before the sign-out, so the next 401 opens the login page", async () => {
    const { answers, send, answer } = slowServer();
    const gate = await signedInGate(send);

    // The read leaves, then the person signs out, then the good answer arrives.
    const late = gate.fetchAccount(getAccount());
    await settle();
    gate.signedOut();
    answer(0, 200);
    expect((await late).status).toBe(200);
    expect(gate.state()).toBe("signed-out");

    // The 401 of the next page goes to the caller. It does not wait for a dialog.
    const next = gate.fetch(get());
    await settle();
    answer(1, 401);
    expect((await next).status).toBe(401);
    expect(gate.state()).toBe("signed-out");
    expect(answers).toHaveLength(2);
  });
});
