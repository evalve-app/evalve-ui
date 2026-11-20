import { getRunAggregates, listEvaluationsOfSessions, listRunReplays } from "../api/client";
import { aggregatesCut, completeAggregates, sessionsToLoad } from "./runAggregates";

// The results of one run, with the values of each replay.
// API: GET /api/v1/ui/experiment-runs/{run_id}/evaluation-aggregates. That
// call lists only the 50 most recent replays. For a run with more, also
// GET /api/v1/replays?filter={experiment_run_id eq} and
// GET /api/v1/evaluations?filter={session_id in} for the replays it left out.
// Limit: RUN_REPLAY_LIMIT replays of a run (see listRunReplays). A run with
// more has results for that many, and replayLimitNote says so on the page.
export async function loadRunAggregates(runId: string) {
  const aggregates = await getRunAggregates(runId);
  if (!aggregatesCut(aggregates)) return aggregates;
  const replays = await listRunReplays(runId);
  return completeAggregates(aggregates, replays, await listEvaluationsOfSessions(sessionsToLoad(aggregates, replays)));
}

// The query for the results of one run. Every caller uses it, so they share
// one cache entry for each run and run status.
export const runAggregatesQuery = (run: { id: string; status: string }) => ({ queryKey: ["aggregates", run.id, run.status], queryFn: () => loadRunAggregates(run.id) });
