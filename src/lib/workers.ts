// Rows for the Workers page: one row for each worker.
import { sortRows, type Sort, type SortValue } from "./sortRows";

export type WorkerInput = {
  id: string;
  name: string;
  live: boolean;
  last_seen_at: string;
  scope: { claims: { kind: string }[] };
  runtime: { platform: string };
};

export type WorkerRow = {
  id: string;
  name: string;
  live: boolean;
  status: "Live" | "Offline";
  // The kinds of task the worker claims, such as "Agent, evaluator". Null when it lists none.
  claims: string | null;
  platform: string | null;
  lastSeen: string;
};

export type WorkerColumn = "name" | "status" | "claims" | "platform" | "lastSeen";

// The sort the page opens with: the worker seen most recently first.
export const DEFAULT_WORKER_SORT: Sort<WorkerColumn> = { key: "lastSeen", dir: "desc" };

// A new column sorts newest first for "Last seen", A to Z (or Live first) for the rest.
export const firstWorkerSortDir = (key: WorkerColumn) => (key === "lastSeen" ? "desc" : "asc");

export function workerRows(workers: WorkerInput[]): WorkerRow[] {
  return workers.map((w) => ({
    id: w.id,
    name: w.name,
    live: w.live,
    status: w.live ? "Live" : "Offline",
    claims: claimsLabel(w.scope.claims.map((c) => c.kind)),
    platform: w.runtime.platform || null,
    lastSeen: w.last_seen_at,
  }));
}

// ["agent", "evaluator", "agent"] → "Agent, evaluator". An empty list → null.
export function claimsLabel(kinds: string[]): string | null {
  const unique = [...new Set(kinds)].map((k) => k.replace(/_/g, " "));
  if (unique.length === 0) return null;
  const text = unique.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SORT_VALUE: Record<WorkerColumn, (r: WorkerRow) => SortValue> = {
  name: (r) => r.name,
  // Ascending puts live workers first.
  status: (r) => (r.live ? 0 : 1),
  claims: (r) => r.claims,
  platform: (r) => r.platform,
  lastSeen: (r) => new Date(r.lastSeen).getTime(),
};

export function sortWorkerRows(rows: WorkerRow[], sort: Sort<WorkerColumn>): WorkerRow[] {
  return sortRows(rows, SORT_VALUE[sort.key], sort.dir);
}
