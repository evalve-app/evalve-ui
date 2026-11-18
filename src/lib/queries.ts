import { listAgents, listEvaluators, listSessionNodes, listWorkers } from "../api/client";
import { getLoop } from "../api/evalve";
import { agentOwnSettings } from "./sessionNodes";

// Queries that more than one page uses. Every caller takes its options from
// here, so the pages share one cache entry for each query.

// Every agent on the server (the first 50).
export const agentsQuery = () => ({ queryKey: ["agents"], queryFn: listAgents });

// Every evaluator on the server (the first 100).
export const evaluatorsQuery = () => ({ queryKey: ["evaluators"], queryFn: listEvaluators });

// The agent's own settings, as one recorded session used them (see `agentOwnSettings`).
// API: GET /api/v1/sessions/{session_id}/nodes
export const agentOwnSettingsQuery = (sessionId: string) => ({
  queryKey: ["agent-own-settings", sessionId],
  queryFn: async () => agentOwnSettings(await listSessionNodes(sessionId)),
});

// The live workers.
// API: GET /api/v1/workers
export const workersQuery = () => ({ queryKey: ["workers"], queryFn: listWorkers });

// One backend Loop. The Loop page reads it, and "Cancel Loop" puts its answer here.
// API: GET /evalve/v1/loops/{loop_id}
export const loopQuery = (loopId: string) => ({ queryKey: ["evalve-loop", loopId], queryFn: () => getLoop(loopId) });

// The start of the key of each Loop list (LoopListTab.tsx). After "Cancel
// Loop", each list with this start reads its data again.
export const LOOP_LISTS_KEY = ["evalve-loops"];
