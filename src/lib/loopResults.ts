// The loop results view model: what the three sections of the loop page show
// in the MVP view (Results, Final results, Agent diff). Each function takes
// plain loop data and returns what one section shows, with all text that
// depends on server data already made. The section components only lay it out.
import type { CellRun } from "./cellTarget";
import { isGating } from "./loops";

// One replay of one case, as one gating evaluator scored it.
export type ReplayResult = { caseId: string; caseName: string; sessionId: string | null; passed: boolean };

// The replays of one gating evaluator in one lap, in case order.
export type EvaluatorReplays = { evaluator: string; replays: ReplayResult[] };

// One case in one run: its result session and its pass/fail evaluator results.
export type RunCell = Pick<CellRun, "sessionId" | "results">;

// A pass/fail result with no evaluator name gates (see isGating), so it needs a name to show.
const UNNAMED = "Unnamed evaluator";

// The per-evaluator replay lists of one lap, from one run of the lap (the loop
// data hook gives the first completed run). `cases` sets the order, so each
// lap of a loop has the same order. A case with no result in the run is left
// out. Evaluators follow the loop's gating list, or name order with no list.
export function evaluatorReplays(run: Map<string, RunCell> | undefined, cases: { id: string; name: string }[], gatingEvaluators: string[] | undefined): EvaluatorReplays[] {
  if (!run) return [];
  const lists = new Map<string, ReplayResult[]>();
  for (const cs of cases) {
    const cell = run.get(cs.id);
    for (const r of cell?.results ?? []) {
      if (!isGating(gatingEvaluators, r.evaluator)) continue;
      const name = r.evaluator ?? UNNAMED;
      const list = lists.get(name) ?? [];
      list.push({ caseId: cs.id, caseName: cs.name, sessionId: cell!.sessionId, passed: r.passed });
      lists.set(name, list);
    }
  }
  const rank = (name: string) => {
    const i = gatingEvaluators?.indexOf(name) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...lists]
    .map(([evaluator, replays]) => ({ evaluator, replays }))
    .sort((a, b) => rank(a.evaluator) - rank(b.evaluator) || a.evaluator.localeCompare(b.evaluator));
}
