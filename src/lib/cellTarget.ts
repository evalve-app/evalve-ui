import { isGating } from "./loops";

// What a case cell in the loop grid opens. A cell covers one case in one lap,
// across every run of that lap. Each run's replay may have a result session.

export type Phase = "screen" | "trial" | "confirmation";

export type CellRun = {
  run: number; // the run number in its experiment
  phase: Phase;
  sessionId: string | null; // the replay's result session, if the replay produced one
  results: { evaluator: string | null; passed: boolean }[]; // pass/fail evaluator results for this case
};

export type CellMenuRow = { run: number; phase: Phase; passed: boolean; sessionId: string };

export type CellTarget =
  | { kind: "none"; reason: string }
  | { kind: "link"; sessionId: string }
  | { kind: "menu"; header: string; showPhase: boolean; rows: CellMenuRow[] };

export function cellTarget(cell: { caseName: string; lap: number; runs: CellRun[]; gatingEvaluators?: string[] }): CellTarget {
  const passes = (r: CellRun) => r.results.every((x) => !isGating(cell.gatingEvaluators, x.evaluator) || x.passed);
  const rows: CellMenuRow[] = cell.runs
    .filter((r): r is CellRun & { sessionId: string } => !!r.sessionId)
    .sort((a, b) => a.run - b.run)
    .map((r) => ({ run: r.run, phase: r.phase, passed: passes(r), sessionId: r.sessionId }));
  if (rows.length === 0) return { kind: "none", reason: "No replay session to open" };
  if (rows.length === 1) return { kind: "link", sessionId: rows[0].sessionId };
  // The header counts every run, as the cell does, so a run with no session still counts.
  const passed = cell.runs.filter(passes).length;
  return { kind: "menu", header: `${cell.caseName} · lap ${cell.lap} · ${passed} of ${cell.runs.length} passed`, showPhase: rows.some((r) => r.phase !== "trial"), rows };
}
