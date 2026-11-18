import { useEffect, useMemo, useRef } from "react";
import { useQueries, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ApiError, getExperiment, type Experiment } from "../../../api/client";
import { getLoop, type LoopDetail } from "../../../api/evalve";
import { backendSetup, detailOutcome, gatingEvaluatorNames, LOOP_POLL_MS } from "../../../lib/backendLoops";
import { lapSummary, type EvalveSetup } from "../../../lib/loops";
import type { LoopOutcome } from "../../../lib/loopStatus";
import { useLoopResults, type LoopExperiment, type LoopResults } from "./useLoopResults";

// A backend Loop: what the Evalve backend says about it, and its results from Kitaru.
export type BackendLoopData = LoopResults & {
  loop: LoopDetail | null; // null until the backend answers, and for a Loop that does not exist
  setup: EvalveSetup | null;
  notFound: boolean; // the backend has no Loop with this id
};

const NO_OUTCOME: LoopOutcome = { kind: "running", title: null, idleDeadline: null };

// The Kitaru experiments of a Loop, by id. Outside the component, so that the
// combined value keeps its identity while no experiment changes.
function combineExperiments(results: UseQueryResult<Experiment>[]) {
  return {
    byId: new Map(results.flatMap((r) => (r.data ? [[r.data.id, r.data] as const] : []))),
    pending: results.some((r) => r.isPending),
    error: (results.find((r) => r.error)?.error ?? null) as Error | null,
  };
}

// Everything the Loop page needs for one backend Loop. The status, the outcome
// and the winning Experiment come from the backend. The Experiments of the Loop
// are the Kitaru experiments that the backend names; their runs and results
// come from Kitaru. While the Loop runs, the page polls the backend and the runs.
// A status call of the Loop owner also moves the Loop: that is the design of the Loop API.
export function useBackendLoop(loopId: string, opts: { lapLimit: number }): BackendLoopData {
  const detail = useQuery({
    queryKey: ["evalve-loop", loopId],
    queryFn: () => getLoop(loopId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? LOOP_POLL_MS : false),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 3,
  });
  const loop = detail.data ?? null;
  const status = loop?.status;
  const pollMs = status === "running" ? LOOP_POLL_MS : false;

  // The runs can load just before the backend ends the Loop, with the last run
  // still running. Load them once more at the end, so that it shows its results.
  const queryClient = useQueryClient();
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current === "running" && status && status !== "running") void queryClient.invalidateQueries({ queryKey: ["experiment-runs"] });
    lastStatus.current = status;
  }, [status, queryClient]);

  // Each Experiment by the id that the backend gives, not from the list of the
  // agent's experiments: that list has only the first 200 of them.
  const experimentIds = (loop?.experiments ?? []).flatMap((e) => (e.experiment_id ? [e.experiment_id] : []));
  const experiments = useQueries({
    queries: experimentIds.map((id) => ({ queryKey: ["experiment", id], queryFn: () => getExperiment(id) })),
    combine: combineExperiments,
  });

  const ordered = useMemo<LoopExperiment[]>(
    () =>
      (loop?.experiments ?? [])
        .flatMap((e) => {
          const experiment = e.experiment_id ? experiments.byId.get(e.experiment_id) : undefined;
          return experiment ? [{ lap: e.number, experiment, summary: e.number === 0 ? lapSummary(null, 0) : e.change }] : [];
        })
        .sort((a, b) => a.lap - b.lap),
    [loop?.experiments, experiments.byId],
  );

  const outcome = useMemo(() => (loop ? detailOutcome(loop) : NO_OUTCOME), [loop]);
  const gatingEvaluators = useMemo(() => (loop ? gatingEvaluatorNames(loop.setup) : undefined), [loop]);
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  const results = useLoopResults({
    experiments: ordered,
    experimentsPending: detail.isPending || experiments.pending,
    experimentsError: notFound ? null : ((detail.error ?? experiments.error) as Error | null),
    lapLimit: opts.lapLimit,
    criteria: null,
    gatingEvaluators,
    outcome,
    pollMs,
  });

  return {
    ...results,
    totalLaps: loop?.experiments.length ?? 0,
    cohortVersionId: loop?.setup.cohort_version_id ?? results.cohortVersionId,
    isLoading: results.isLoading && !notFound,
    loop,
    setup: loop ? backendSetup(loop.setup) : null,
    notFound,
  };
}
