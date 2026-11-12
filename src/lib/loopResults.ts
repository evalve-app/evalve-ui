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

// ---- Agent diff section (#20): start ----------------------------------------
import { diffLines, type DiffLine } from "./diff";

// The fields of a lap's override that the Agent diff section reads.
export type AgentDiffOverride = { system_prompt?: string | null; model?: string | Record<string, string> | null; model_params?: Record<string, unknown> | null };

// One lap, as the Agent diff section reads it.
export type AgentDiffLap = { lap: number; summary: string; override: AgentDiffOverride | null | undefined; evaluatorReplays: EvaluatorReplays[] };

// The agent's own settings, from the first LLM step of a recorded session.
// `loading` is true while the request runs. A value is null when the session
// does not give it, and all values are null after a failed request.
export type AgentBefore = { loading: boolean; prompt: string | null; model: string | null; modelParams: Record<string, unknown> | null };

export type AgentDiffInput = {
  winnerLap: number | null;
  laps: AgentDiffLap[];
  firstCase: { id: string; name: string } | null; // the recorded session that gives the "before" prompt
  before: AgentBefore;
};

// One line of the full prompt. A removed line has no new number, an added line has no old number.
export type PromptDiffLine = { kind: DiffLine["kind"]; oldNumber: number | null; newNumber: number | null; sign: "+" | "−" | " "; text: string };

// What the primary button copies.
export type AgentDiffCopy = { label: string; text: string };

export type AgentDiffPrompt =
  | { kind: "loading" }
  // The agent's own prompt against the prompt of the winning lap.
  | { kind: "diff"; lines: PromptDiffLine[]; counts: { added: number; removed: number; unchanged: number }; copy: AgentDiffCopy; source: { sessionId: string; name: string } | null }
  // No "before" prompt: the prompt of the winning lap in full.
  | { kind: "after-only"; note: string; text: string; copy: AgentDiffCopy }
  | { kind: "unchanged"; text: string };

export type AgentDiff = {
  winnerLap: number;
  prompt: AgentDiffPrompt;
  chips: string[]; // one for each field that the winning lap did not override
  changedFields: { label: string; before: string; after: string }[]; // model and parameters, when the winning lap overrides them
  lapRows: { lap: number; summary: string; change: string; trend: "better" | "worse" | "same" | null; winning: boolean }[];
};

const OWN_SETTING = "the agent's own setting";
const UNIFIED_CONTEXT = 3;

// What the Agent diff section shows, or null for no section: a loop with no
// winning lap, or a winning lap that is not in `laps`.
export function agentDiff({ winnerLap, laps, firstCase, before }: AgentDiffInput): AgentDiff | null {
  const winner = winnerLap == null ? undefined : laps.find((l) => l.lap === winnerLap);
  if (!winner) return null;
  const o = winner.override ?? {};
  const after = o.system_prompt || null;
  const hasParams = !!o.model_params && Object.keys(o.model_params).length > 0;

  let prompt: AgentDiffPrompt;
  if (after == null) prompt = { kind: "unchanged", text: "The winning lap did not change the system prompt." };
  else if (before.loading) prompt = { kind: "loading" };
  else if (!before.prompt)
    prompt = {
      kind: "after-only",
      note: `The recorded sessions use the agent's own setting, which Kitaru doesn't store, so there's no line-by-line diff. Lap ${winner.lap}, the winning lap, sets the system prompt to:`,
      text: after,
      copy: { label: "Copy prompt", text: after },
    };
  else if (before.prompt === after) prompt = { kind: "unchanged", text: "The system prompt of the winning lap is the same as the agent's own prompt." };
  else {
    const diff = diffLines(before.prompt, after);
    let oldNumber = 0;
    let newNumber = 0;
    const lines = diff.map((l): PromptDiffLine => {
      if (l.kind === "add") return { kind: l.kind, oldNumber: null, newNumber: ++newNumber, sign: "+", text: l.text };
      if (l.kind === "del") return { kind: l.kind, oldNumber: ++oldNumber, newNumber: null, sign: "−", text: l.text };
      return { kind: l.kind, oldNumber: ++oldNumber, newNumber: ++newNumber, sign: " ", text: l.text };
    });
    const count = (kind: DiffLine["kind"]) => lines.filter((l) => l.kind === kind).length;
    prompt = {
      kind: "diff",
      lines,
      counts: { added: count("add"), removed: count("del"), unchanged: count("same") },
      copy: { label: "Copy diff", text: unifiedDiff(lines) },
      source: firstCase ? { sessionId: firstCase.id, name: firstCase.name } : null,
    };
  }

  const changedFields: AgentDiff["changedFields"] = [];
  if (o.model) changedFields.push({ label: "Model", before: before.model ?? OWN_SETTING, after: settingText(o.model) });
  if (hasParams) changedFields.push({ label: "Parameters", before: before.modelParams && Object.keys(before.modelParams).length ? settingText(before.modelParams) : OWN_SETTING, after: settingText(o.model_params) });

  const ordered = [...laps].sort((a, b) => a.lap - b.lap);
  const lapRows = ordered.flatMap((l, i): AgentDiff["lapRows"] => {
    if (l.lap === 0) return [];
    const now = passCount(l);
    const prev = i > 0 ? passCount(ordered[i - 1]) : null;
    return [
      {
        lap: l.lap,
        summary: l.summary,
        change: now ? `${prev ? prev.passed : "—"} → ${now.passed} / ${now.total}` : "No results yet",
        trend: now && prev ? (now.passed > prev.passed ? "better" : now.passed < prev.passed ? "worse" : "same") : null,
        winning: l.lap === winner.lap,
      },
    ];
  });

  return { winnerLap: winner.lap, prompt, chips: [o.model ? null : "model unchanged", hasParams ? null : "parameters unchanged"].filter((c): c is string => !!c), changedFields, lapRows };
}

const settingText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

// The cases that passed each gating evaluator in the lap's first completed run, or null with no results.
function passCount(lap: AgentDiffLap): { passed: number; total: number } | null {
  const byCase = new Map<string, boolean>();
  for (const e of lap.evaluatorReplays) for (const r of e.replays) byCase.set(r.caseId, (byCase.get(r.caseId) ?? true) && r.passed);
  if (byCase.size === 0) return null;
  return { passed: [...byCase.values()].filter(Boolean).length, total: byCase.size };
}

// A unified diff that `git apply` and `patch` read: one hunk for each group of
// changes, with UNIFIED_CONTEXT unchanged lines around it.
function unifiedDiff(lines: PromptDiffLine[]): string {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.kind !== "same") for (let k = Math.max(0, i - UNIFIED_CONTEXT); k <= Math.min(lines.length - 1, i + UNIFIED_CONTEXT); k++) keep[k] = true;
  });
  const out = ["--- a/system_prompt", "+++ b/system_prompt"];
  let oldSeen = 0; // old and new lines before the current line
  let newSeen = 0;
  for (let i = 0; i < lines.length; ) {
    if (!keep[i]) {
      oldSeen++;
      newSeen++;
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && keep[end]) end++;
    const hunk = lines.slice(i, end);
    const oldCount = hunk.filter((l) => l.kind !== "add").length;
    const newCount = hunk.filter((l) => l.kind !== "del").length;
    // A side with no lines gives the line before the hunk, as the format requires.
    out.push(`@@ -${oldCount ? oldSeen + 1 : oldSeen},${oldCount} +${newCount ? newSeen + 1 : newSeen},${newCount} @@`);
    for (const l of hunk) out.push(`${l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}${l.text}`);
    oldSeen += oldCount;
    newSeen += newCount;
    i = end;
  }
  return out.join("\n") + "\n";
}
// ---- Agent diff section (#20): end ------------------------------------------
