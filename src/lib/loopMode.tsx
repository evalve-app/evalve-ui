import { useSyncExternalStore } from "react";

// The Loop tab has two versions the team is comparing:
//   "mvp"  – one run per lap, stop at a pass rate the user picks.
//   "post" – the full kitaru-loop rules (several trials, pass^k, confirmation).
// The choice is a per-browser preview setting, like the empty-state preview.
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
  const current = useLoopMode();
  const options: { id: LoopMode; label: string }[] = [
    { id: "mvp", label: "MVP" },
    { id: "post", label: "Post-MVP" },
  ];
  return (
    <div className="ev-tabs ev-tabs-default loop-mode" role="tablist" aria-label="Loop version">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" className="ev-tab" aria-selected={current === o.id} onClick={() => setLoopMode(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
