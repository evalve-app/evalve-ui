import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signInGate } from "../api/client";
import { Button } from "../design-system/components";
import { useSignOut } from "../lib/useSignOut";
import { SignInForm } from "./SignInForm";

// Opens when the server refuses a request of a signed-in person: the sign-in
// lasts 1 hour. The page below stays as it is. Each read that got a 401 waits,
// and continues after the sign-in (see src/lib/signInGate.ts).
export function SignInAgainDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const open = useSyncExternalStore(signInGate.subscribe, signInGate.state) === "ended";

  // A native <dialog> gives focus trapping, and makes the page below inert.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Reads the account of the new sign-in. The same account keeps the page as
  // it is. A different account gets a new page with no data and no state of
  // the account before: src/lib/accountChange.ts removes the data, and the key
  // on <main> in App.tsx starts the page again.
  async function onSignedIn() {
    await queryClient.refetchQueries({ queryKey: ["me"] });
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
      {/* The page below is inert, so the account menu is out of reach. */}
      <div className="sign-in-again-out">
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </dialog>
  );
}
