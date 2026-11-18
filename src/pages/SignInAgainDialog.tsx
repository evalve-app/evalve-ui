import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentAccount, signInGate, UnauthorizedError } from "../api/client";
import { Button } from "../design-system/components";
import { signInBlocks } from "../lib/signInGate";
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
  const open = signInBlocks(useSyncExternalStore(signInGate.subscribe, signInGate.state));
  // The account that the page shows now. Not enabled: this dialog only reads
  // what the layout in App.tsx loaded.
  const shownId = useQuery({ queryKey: ["me"], queryFn: getCurrentAccount, enabled: false }).data?.id;
  // The account of the sign-in that the server accepted in this dialog. A new
  // object for each sign-in, so that a second sign-in of one account counts.
  const [checked, setChecked] = useState<{ id: string } | null>(null);

  // A native <dialog> gives focus trapping, and makes the page below inert.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Opens the page only after React shows the account of the new sign-in. For
  // a different account, that is the same commit that starts the page again
  // (the key on <main> in App.tsx). Before that commit, the page below still
  // shows the account before, and a click there would act for the new account.
  useEffect(() => {
    if (checked !== null && shownId === checked.id) signInGate.accountShown();
  }, [checked, shownId]);

  // Reads the account of the new sign-in, while the page stays blocked. The
  // same account keeps the page as it is. A different account gets a new page
  // with no data and no state of the account before: src/lib/accountChange.ts
  // removes the data at the write below, and the key on <main> starts the page again.
  async function onSignedIn() {
    const account = await getCurrentAccount().catch((error: unknown) => {
      if (error instanceof UnauthorizedError) throw new Error("The server did not keep the sign-in. Sign in again.");
      throw error;
    });
    // The person signed out during the read.
    if (signInGate.state() !== "checking") return;
    queryClient.setQueryData(["me"], account);
    setChecked({ id: account.id });
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
        if (signInBlocks(signInGate.state())) ref.current?.showModal();
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
