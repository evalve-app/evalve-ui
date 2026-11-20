import { listRunSessions } from "../api/client";
import { runCost } from "./experimentRuns";

// The query for the replay cost of one run (see runCost). Every caller uses
// it, so they share one cache entry for each run and run status.
// API: GET /api/v1/sessions?filter={experiment_run_id eq}&size=1000, with next_cursor to the end.
export const runCostQuery = (run: { id: string; status: string }) => ({ queryKey: ["run-cost", run.id, run.status], queryFn: async () => runCost(await listRunSessions(run.id)) });
