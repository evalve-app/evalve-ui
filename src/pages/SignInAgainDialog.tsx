import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signInGate, type Account } from "../api/client";
import { SignInForm } from "./SignInForm";

// Opens when the server refuses a request of a signed-in person: the sign-in
// lasts 1 hour. The page below stays as it is. Each read that got a 401 waits,
// and continues after the sign-in (see src/lib/signInGate.ts).
export function SignInAgainDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const open = useSyncExternalStore(signInGate.subscribe, signInGate.state) === "ended";

  // A native <dialog> gives focus trapping, and makes the page below inert.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // The top bar shows the account, so it must show the account of the new
  // sign-in. For a different account, each page loads again from the start.
  async function onSignedIn() {
    const before = queryClient.getQueryData<Account>(["me"])?.id;
    await queryClient.refetchQueries({ queryKey: ["me"] });
    const after = queryClient.getQueryData<Account>(["me"])?.id;
    if (before && after && after !== before) await queryClient.resetQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // No close with Escape: with no sign-in, the page cannot load data.
      onCancel={(e) => e.preventDefault()}
      // A browser can close the dialog on a second Escape. Open it again.
      onClose={() => {
        if (signInGate.state() === "ended") ref.current?.showModal();
      }}
    >
      <div className="dialog-header">
        <div>
          <h2 id={titleId} className="dialog-title">
            Sign in again
          </h2>
          <p className="dialog-description">Your sign-in ended. Sign in again to continue. This page stays as it is.</p>
        </div>
      </div>
      {/* Only while open, so that the closed dialog does not keep the password. */}
      {open ? <SignInForm onSignedIn={onSignedIn} /> : null}
    </dialog>
  );
}
