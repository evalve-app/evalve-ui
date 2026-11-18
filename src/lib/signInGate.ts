// What a 401 from the Kitaru server does. A sign-in lasts 1 hour and the
// dashboard cannot make it longer, so a page that stays open gets a 401.
//
// The gate keeps the page as it is. A request that reads data waits until the
// person signs in again, and then the gate sends it again. The query of the
// page gets its answer late, not an error.

// "signed-out": no account loaded, so a 401 goes to the caller (the login page opens).
// "signed-in": the server accepted the sign-in.
// "ended": the server refused a request of a signed-in person. The "Sign in again" dialog shows.
export type SignInState = "signed-out" | "signed-in" | "ended";

export type SignInGate = {
  state: () => SignInState;
  // Calls `listener` after each change of the state. Returns the function that stops the calls.
  subscribe: (listener: () => void) => () => void;
  // The server accepted a sign-in, or it returned the account.
  signedIn: () => void;
  // The person signs out. Each request that waits gets its 401.
  signedOut: () => void;
  fetch: (request: Request) => Promise<Response>;
};

// A request with one of these methods changes nothing on the server.
const READ_METHODS = new Set(["GET", "HEAD"]);

// `send` sends one request. The gate gives it a new copy of the request for
// each try, so that `send` can set the newest CSRF token on the copy.
export function createSignInGate(send: (request: Request) => Promise<Response>): SignInGate {
  let state: SignInState = "signed-out";
  // The number of calls to signedIn(). It tells if a 401 is the answer to a
  // request that left before the newest sign-in.
  let signIns = 0;
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

  async function gatedFetch(request: Request): Promise<Response> {
    for (;;) {
      const sentAfter = signIns;
      // The copy goes to the server. `request` stays whole for the next try.
      const response = await send(request.clone());
      if (response.status !== 401 || current() === "signed-out") return response;
      // A request that left before the newest sign-in says nothing about that sign-in.
      if (sentAfter === signIns) setState("ended");
      // A request that changes data is not sent a second time: a different
      // account can sign in. The caller shows the 401, and the person does the action again.
      if (!READ_METHODS.has(request.method)) return response;
      while (current() === "ended") await nextChange();
      if (current() === "signed-out") return response;
    }
  }

  return {
    state: current,
    subscribe,
    signedIn() {
      signIns += 1;
      setState("signed-in");
    },
    signedOut() {
      setState("signed-out");
    },
    fetch: gatedFetch,
  };
}
