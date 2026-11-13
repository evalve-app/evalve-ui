// Text for the Jobs page: labels, the error summary, the traceback, and the
// failing task. Follows Kitaru's Jobs page (capstone-prototypes/Kitaru-UI).

export const JOB_STATUSES = ["pending", "running", "completed", "failed", "canceled"] as const;

const KIND_LABEL: Record<string, string> = {
  session_run: "Session run",
  import: "Import",
  evaluation: "Evaluation",
  replay: "Replay",
  analysis: "Analysis",
};

// "timed_out" → "Timed out". For statuses and kinds the page has no label for.
export function sentenceCase(s: string): string {
  const text = s.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? sentenceCase(kind);
}

// The first line of a job's error, or null when the job has none.
export function errorSummary(error: string | null | undefined): string | null {
  const first = error?.split("\n").find((line) => line.trim() !== "");
  return first ?? null;
}

// The lines under the summary: the failing task's error when there is one,
// else the job's own, without blank lines and without the summary line again.
export function tracebackLines(jobError: string | null | undefined, taskError: string | null | undefined): string[] {
  const summary = errorSummary(jobError);
  const lines = (taskError ?? jobError ?? "").split("\n").filter((line) => line.trim() !== "");
  return lines[0] === summary ? lines.slice(1) : lines;
}

// What a job that did not fail shows when its row is open: "Completed. No errors."
export function noErrorsText(status: string): string {
  return `${sentenceCase(status)}. No errors.`;
}

// "Agent task · support-desk · worker laptop-1". A missing name leaves its part out,
// except a worker, which falls back to its short id.
export function failingTaskLabel(
  task: { kind: string; agent_id?: string | null; worker_id?: string | null },
  agentName: (id: string) => string | undefined,
  workerName: (id: string) => string | undefined,
): string {
  const parts = [
    `${sentenceCase(task.kind)} task`,
    task.agent_id ? agentName(task.agent_id) : undefined,
    task.worker_id ? `worker ${workerName(task.worker_id) ?? task.worker_id.slice(-8)}` : undefined,
  ];
  return parts.filter(Boolean).join(" · ");
}

// A row is open when the person opened it. Until they open or close it, only
// the first row is open.
export function isJobOpen(toggled: Record<string, boolean>, jobId: string, index: number): boolean {
  return toggled[jobId] ?? index === 0;
}
