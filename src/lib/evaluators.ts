// Rows for the Evaluators page: one row for each evaluator.
import { sortRows, type Sort, type SortValue } from "./sortRows";

export type EvaluatorInput = {
  id: string;
  name: string;
  description?: string | null;
  latest_version: number;
  agent_id?: string | null;
  updated: string;
};

export type EvaluatorRow = {
  id: string;
  name: string;
  description: string | null;
  version: number;
  versionLabel: string;
  updated: string;
  // Null for a global evaluator, which every agent can use.
  agentId: string | null;
  // Null for a global evaluator, and until the agent's name is known.
  agentName: string | null;
};

// Evaluators by name, A to Z. `agentNames` maps an agent id to its name, and
// has no entry for an agent that did not load.
export function evaluatorRows(evaluators: EvaluatorInput[], agentNames: Record<string, string | undefined>): EvaluatorRow[] {
  return [...evaluators]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description ?? null,
      version: e.latest_version,
      versionLabel: `v${e.latest_version}`,
      updated: e.updated,
      agentId: e.agent_id ?? null,
      agentName: e.agent_id ? (agentNames[e.agent_id] ?? null) : null,
    }));
}

export type EvaluatorColumn = "name" | "description" | "scope" | "version" | "updated";

// The sort the page opens with: the evaluator changed most recently first.
export const DEFAULT_EVALUATOR_SORT: Sort<EvaluatorColumn> = { key: "updated", dir: "desc" };

// A new column sorts newest first for "Updated", highest first for "Version", A to Z for the rest.
export const firstEvaluatorSortDir = (key: EvaluatorColumn) => (key === "updated" || key === "version" ? "desc" : "asc");

const SORT_VALUE: Record<EvaluatorColumn, (r: EvaluatorRow) => SortValue> = {
  name: (r) => r.name,
  description: (r) => r.description || null,
  // Global evaluators have no agent, so they go last.
  scope: (r) => r.agentName ?? r.agentId,
  version: (r) => r.version,
  updated: (r) => new Date(r.updated).getTime(),
};

export function sortEvaluatorRows(rows: EvaluatorRow[], sort: Sort<EvaluatorColumn>): EvaluatorRow[] {
  return sortRows(rows, SORT_VALUE[sort.key], sort.dir);
}
