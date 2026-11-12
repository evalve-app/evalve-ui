// The result of a "copy" button: it shows the result for a short time, then
// goes back to idle. A reset (the dialog closed) ends the current copy, so a
// clipboard write that completes later changes nothing.

export type CopyState = "idle" | "done" | "failed";

export function createCopyFeedback({
  write,
  onChange,
  resetAfterMs = 2000,
}: {
  write: (text: string) => Promise<void>;
  onChange: (state: CopyState) => void;
  resetAfterMs?: number;
}) {
  // Each copy and each reset starts a new attempt. Only the newest one reports.
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function reset() {
    attempt += 1;
    clearTimeout(timer);
    onChange("idle");
  }

  async function copy(text: string) {
    attempt += 1;
    const mine = attempt;
    clearTimeout(timer);
    let result: CopyState;
    try {
      await write(text);
      result = "done";
    } catch {
      // The browser can refuse the clipboard (no permission, or no HTTPS).
      result = "failed";
    }
    if (mine !== attempt) return;
    onChange(result);
    timer = setTimeout(() => onChange("idle"), resetAfterMs);
  }

  return { copy, reset };
}
