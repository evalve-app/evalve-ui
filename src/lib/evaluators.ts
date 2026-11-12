// Rows for the Evaluators page: one row for each evaluator.

export type EvaluatorInput = {
  id: string;
  name: string;
  description?: string | null;
  provider?: string | null;
  latest_version: number;
  agent_id?: string | null;
  updated: string;
};

export type EvaluatorRow = {
  id: string;
  name: string;
  description: string | null;
  provider: string | null;
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
      provider: e.provider ?? null,
      versionLabel: `v${e.latest_version}`,
      updated: e.updated,
      agentId: e.agent_id ?? null,
      agentName: e.agent_id ? (agentNames[e.agent_id] ?? null) : null,
    }));
}
