import { listAgents, listEvaluators, listSessionNodes } from "../api/client";
import { systemPrompt } from "./sessionNodes";

// Queries that more than one page uses. Every caller takes its options from
// here, so the pages share one cache entry for each query.

// Every agent on the server (the first 50).
export const agentsQuery = () => ({ queryKey: ["agents"], queryFn: listAgents });

// Every evaluator on the server (the first 100).
export const evaluatorsQuery = () => ({ queryKey: ["evaluators"], queryFn: listEvaluators });

// The agent's own settings, as one recorded session used them: the system
// prompt of the first LLM step that has one, and the model and parameters of
// the first LLM step. A value is null when the session does not give it.
// API: GET /api/v1/sessions/{session_id}/nodes
export const agentOwnSettingsQuery = (sessionId: string) => ({
  queryKey: ["agent-own-settings", sessionId],
  queryFn: async () => {
    const llmSteps = (await listSessionNodes(sessionId)).filter((n) => n.node_type === "llm_call");
    const first = llmSteps[0];
    return {
      prompt: llmSteps.map(systemPrompt).find((p) => !!p) ?? null,
      model: first?.model ?? first?.requested_model ?? null,
      modelParams: first?.model_params ?? null,
    };
  },
});
