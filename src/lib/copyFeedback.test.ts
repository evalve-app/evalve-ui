import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCopyFeedback, type CopyState } from "./copyFeedback";

// A clipboard write that stays pending until the caller settles it.
function pendingWrite() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { write: () => promise, resolve, reject };
}

describe("createCopyFeedback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the copy result, then goes back to idle", async () => {
    const states: CopyState[] = [];
    const feedback = createCopyFeedback({ write: async () => {}, onChange: (s) => states.push(s) });

    await feedback.copy("text");
    expect(states).toEqual(["done"]);

    vi.advanceTimersByTime(2000);
    expect(states).toEqual(["done", "idle"]);
  });

  it("shows a failed copy when the clipboard refuses", async () => {
    const states: CopyState[] = [];
    const feedback = createCopyFeedback({
      write: async () => {
        throw new Error("no permission");
      },
      onChange: (s) => states.push(s),
    });

    await feedback.copy("text");
    expect(states).toEqual(["failed"]);
  });

  it("ignores a copy result that arrives after a reset", async () => {
    const states: CopyState[] = [];
    const clipboard = pendingWrite();
    const feedback = createCopyFeedback({ write: clipboard.write, onChange: (s) => states.push(s) });

    const copy = feedback.copy("text");
    // The person closes the dialog before the browser completes the write.
    feedback.reset();
    clipboard.resolve();
    await copy;
    vi.advanceTimersByTime(2000);

    expect(states).toEqual(["idle"]);
  });

  it("ignores a refused copy that arrives after a reset", async () => {
    const states: CopyState[] = [];
    const clipboard = pendingWrite();
    const feedback = createCopyFeedback({ write: clipboard.write, onChange: (s) => states.push(s) });

    const copy = feedback.copy("text");
    feedback.reset();
    clipboard.reject(new Error("no permission"));
    await copy;

    expect(states).toEqual(["idle"]);
  });

  it("does not go back to idle early when a second copy follows the first", async () => {
    const states: CopyState[] = [];
    const feedback = createCopyFeedback({ write: async () => {}, onChange: (s) => states.push(s) });

    await feedback.copy("text");
    vi.advanceTimersByTime(1500);
    await feedback.copy("text");
    vi.advanceTimersByTime(1500);
    expect(states).toEqual(["done", "done"]);

    vi.advanceTimersByTime(500);
    expect(states).toEqual(["done", "done", "idle"]);
  });
});
