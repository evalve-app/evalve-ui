import { useQueries, useQuery } from "@tanstack/react-query";
import { listCohortVersions, listCohorts } from "../api/client";

// The cohorts of one agent and the versions of each cohort.
// API: GET /api/v1/cohorts?filter={agent_id eq}&size=50, then
// GET /api/v1/cohorts/{cohort_id}/versions for each cohort.
// `versionsByCohort` maps a cohort id to its versions. It has no value for a
// cohort while its versions call runs, and after that call fails.
export function useCohorts(agentId: string) {
  const cohorts = useQuery({ queryKey: ["cohorts", agentId], queryFn: () => listCohorts(agentId) });
  const versionLists = useQueries({
    queries: (cohorts.data ?? []).map((c) => ({ queryKey: ["cohort-versions", c.id], queryFn: () => listCohortVersions(c.id) })),
  });
  const versionsByCohort = Object.fromEntries((cohorts.data ?? []).map((c, i) => [c.id, versionLists[i]?.data]));
  return { cohorts, versionsByCohort };
}
