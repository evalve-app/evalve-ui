import { useSyncExternalStore } from "react";

// The loop list and detail pages remember the browser’s preferred scoring view.
export type LoopMode = "mvp" | "post";

const KEY = "evalve.loop-mode";
const listeners = new Set<() => void>();

function read(): LoopMode {
  try {
    return localStorage.getItem(KEY) === "post" ? "post" : "mvp";
  } catch {
    return "mvp";
  }
}

let mode: LoopMode = read();

export function setLoopMode(next: LoopMode) {
  mode = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage can be blocked; the choice then lasts until reload.
  }
  listeners.forEach((l) => l());
}

export function useLoopMode(): LoopMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mode,
  );
}

export function LoopModeToggle() {
  return <LoopModeTabs mode={useLoopMode()} onChange={setLoopMode} />;
}

export function LoopModeTabs({ mode, onChange }: { mode: LoopMode; onChange: (mode: LoopMode) => void }) {
  const options: { id: LoopMode; label: string }[] = [
    { id: "mvp", label: "MVP" },
    { id: "post", label: "Post-MVP" },
  ];
  return (
    <div className="ev-tabs ev-tabs-default loop-mode" role="tablist" aria-label="Loop version">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" className="ev-tab" aria-selected={mode === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
