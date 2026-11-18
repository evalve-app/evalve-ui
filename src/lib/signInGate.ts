// What a 401 from the Kitaru server does. A sign-in lasts 1 hour and the
// dashboard cannot make it longer, so a page that stays open gets a 401.
//
// The gate keeps the page as it is. A request that reads data waits until the
// person signs in again, and then the gate sends it again. The query of the
// page gets its answer late, not an error.

// "signed-out": no account loaded, so a 401 goes to the caller (the login page opens).
// "signed-in": the server returned the account, and the page shows it.
// "ended": the server refused a request of a signed-in person. The "Sign in again" dialog shows.
// "checking": the server accepted a sign-in in the dialog. The dialog stays
//   open until the page shows the account of that sign-in, because the account
//   can be a different one.
export type SignInState = "signed-out" | "signed-in" | "ended" | "checking";

// True while the "Sign in again" dialog covers the page and the reads wait.
export function signInBlocks(state: SignInState): boolean {
  return state === "ended" || state === "checking";
}

export type SignInGate = {
  state: () => SignInState;
  // Calls `listener` after each change of the state. Returns the function that stops the calls.
  subscribe: (listener: () => void) => () => void;
  // The server accepted a username and password. After "ended", the state
  // becomes "checking": the page stays blocked.
  accepted: () => void;
  // The page shows the account of the sign-in that the server accepted in the
  // dialog. The reads that wait continue.
  accountShown: () => void;
  // The person signs out. Each request that waits gets its 401.
  signedOut: () => void;
  fetch: (request: Request) => Promise<Response>;
  // For the read of the account (GET /accounts/me) only. A good answer to a
  // signed-out person makes the state "signed-in". While the state is
  // "checking", this read does not wait, and its 401 goes to the caller.
  fetchAccount: (request: Request) => Promise<Response>;
};

// A request with one of these methods changes nothing on the server.
const READ_METHODS = new Set(["GET", "HEAD"]);

// `send` sends one request. The gate gives it a new copy of the request for
// each try, so that `send` can set the newest CSRF token on the copy.
export function createSignInGate(send: (request: Request) => Promise<Response>): SignInGate {
  let state: SignInState = "signed-out";
  // The number of calls to accepted(). It tells if a 401 is the answer to a
  // request that left before the newest sign-in.
  let signIns = 0;
  // The number of calls to signedOut(). It tells if the answer to a read of
  // the account is from before the newest sign-out.
  let signOuts = 0;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function setState(next: SignInState) {
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener();
  }

  function nextChange(): Promise<void> {
    return new Promise((resolve) => {
      const stop = subscribe(() => {
        stop();
        resolve();
      });
    });
  }

  // The state now. The state changes while a request waits, and a function
  // call keeps the type checker from an old value.
  const current = (): SignInState => state;

  async function gatedFetch(request: Request, account: boolean): Promise<Response> {
    const read = READ_METHODS.has(request.method);
    for (;;) {
      // While the dialog checks the account of the new sign-in, no other read
      // leaves: its answer can be data of a different account for the page of
      // the account before.
      if (read && !account) while (current() === "checking") await nextChange();
      const sentAfter = signIns;
      const sentOuts = signOuts;
      const check = account && current() === "checking";
      // The copy goes to the server. `request` stays whole for the next try.
      const response = await send(request.clone());
      if (response.status !== 401) {
        // A page load: the server returned the account. An answer to a request
        // from before the newest sign-out says nothing about the person now.
        if (account && response.ok && current() === "signed-out" && sentOuts === signOuts) setState("signed-in");
        return response;
      }
      if (current() === "signed-out") return response;
      // A request that left before the newest sign-in says nothing about that sign-in.
      if (sentAfter === signIns) setState("ended");
      // A request that changes data is not sent a second time: a different
      // account can sign in. The caller shows the 401, and the person does the action again.
      // The check of the account does not wait: the sign-in form waits for its answer.
      if (!read || check) return response;
      while (signInBlocks(current())) await nextChange();
      if (current() === "signed-out") return response;
    }
  }

  return {
    state: current,
    subscribe,
    accepted() {
      signIns += 1;
      if (state === "ended") setState("checking");
    },
    accountShown() {
      if (state === "checking") setState("signed-in");
    },
    signedOut() {
      signOuts += 1;
      setState("signed-out");
    },
    fetch: (request) => gatedFetch(request, false),
    fetchAccount: (request) => gatedFetch(request, true),
  };
}
