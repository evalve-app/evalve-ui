import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, listExperiments } from "../../../api/client";
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

// Everything the Loop page needs for one backend Loop. The status, the outcome
// and the winning Experiment come from the backend. The Experiments of the Loop
// are the Kitaru experiments that the backend names; their runs and results
// come from Kitaru. While the Loop runs, the page polls the backend and the runs.
// A status call of the Loop owner also moves the Loop: that is the design of the Loop API.
export function useBackendLoop(agentId: string, loopId: string, opts: { lapLimit: number }): BackendLoopData {
  const detail = useQuery({
    queryKey: ["evalve-loop", loopId],
    queryFn: () => getLoop(loopId),
    refetchInterval: (q) => (q.state.data?.status === "running" ? LOOP_POLL_MS : false),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 3,
  });
  const loop = detail.data ?? null;
  const pollMs = loop?.status === "running" ? LOOP_POLL_MS : false;

  // A new Experiment of a running Loop shows up in Kitaru, so the experiments poll too.
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId), refetchInterval: pollMs, enabled: !!loop });

  const ordered = useMemo<LoopExperiment[]>(() => {
    const byId = new Map((experiments.data ?? []).map((e) => [e.id, e]));
    return (loop?.experiments ?? [])
      .flatMap((e) => {
        const experiment = e.experiment_id ? byId.get(e.experiment_id) : undefined;
        // An Experiment that Kitaru does not list yet shows on the next poll.
        return experiment ? [{ lap: e.number, experiment, summary: e.number === 0 ? lapSummary(null, 0) : e.change }] : [];
      })
      .sort((a, b) => a.lap - b.lap);
  }, [loop?.experiments, experiments.data]);

  const outcome = useMemo(() => (loop ? detailOutcome(loop) : NO_OUTCOME), [loop]);
  const gatingEvaluators = useMemo(() => (loop ? gatingEvaluatorNames(loop.setup) : undefined), [loop]);
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  const results = useLoopResults({
    experiments: ordered,
    experimentsPending: detail.isPending || (!!loop && experiments.isPending),
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
