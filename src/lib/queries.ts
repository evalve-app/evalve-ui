import { listAgents, listEvaluators } from "../api/client";

// Queries that more than one page uses. Every caller takes its options from
// here, so the pages share one cache entry for each query.

// Every agent on the server (the first 50).
export const agentsQuery = () => ({ queryKey: ["agents"], queryFn: listAgents });

// Every evaluator on the server (the first 100).
export const evaluatorsQuery = () => ({ queryKey: ["evaluators"], queryFn: listEvaluators });
