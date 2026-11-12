import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "../design-system/components";

// Shows a handoff prompt: text for the person to paste into a coding agent.
// The dialog creates nothing; the coding agent does the work.
export function HandoffPromptDialog({
  open,
  onClose,
  title,
  description,
  prompt,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  prompt: string;
  hint?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  // A native <dialog> gives focus trapping and Escape-to-close for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setState("done");
    } catch {
      // The browser can refuse the clipboard (no permission, or no HTTPS).
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby={titleId}>
      <div className="dialog-header">
        <div>
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <p className="dialog-description">{description}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="prompt-box">
        <p className="prompt-text">{prompt}</p>
      </div>
      {hint ? <p className="dialog-hint">{hint}</p> : null}
      <div className="dialog-footer">
        <Button icon={state === "done" ? Check : Copy} onClick={copy}>
          <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Could not copy" : "Copy prompt"}</span>
        </Button>
      </div>
    </dialog>
  );
}
