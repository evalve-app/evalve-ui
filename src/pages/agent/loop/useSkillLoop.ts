import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listExperiments } from "../../../api/client";
import { groupLoops, lapSummary, loopHypothesis, parseEvalveLoop, parseSettings, skillLoopOutcome, type EvalveSetup, type LoopSettings } from "../../../lib/loops";
import { useLoopResults, type LoopResults } from "./useLoopResults";

// A Skill Loop: its results, and what the loop skill wrote on the control experiment.
export type SkillLoopData = LoopResults & {
  slug: string;
  settings: LoopSettings | null;
  isEvalveLoop: boolean;
  evalveSetup: EvalveSetup | null; // the setup in the loop settings line of the runner; null for a loop that the old skill made
  hypothesis: string;
};

// Everything the Skill Loop pages need for one Skill Loop. A Skill Loop is the experiments named
// `<slug>-round-N` (or `<slug>-iteration-N`, counted from 1). `lapLimit` caps how many of the newest laps are loaded,
// since every run costs two requests. A Skill Loop does not poll: no runner moves it while the page is open.
export function useSkillLoop(agentId: string, slug: string, opts: { lapLimit: number }): SkillLoopData {
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });

  const ordered = useMemo(
    () => (groupLoops(experiments.data ?? []).get(slug) ?? []).map(({ lap, experiment }) => ({ lap, experiment, summary: lapSummary(experiment.description, lap) })),
    [experiments.data, slug],
  );
  const control = ordered.find((l) => l.lap === 0)?.experiment;
  const evalve = useMemo(() => parseEvalveLoop(control?.description), [control?.description]);
  const settings = useMemo(() => parseSettings(control?.description), [control?.description]);
  const outcome = useMemo(() => skillLoopOutcome(evalve), [evalve]);

  const results = useLoopResults({
    experiments: ordered,
    experimentsPending: experiments.isPending,
    experimentsError: experiments.error,
    lapLimit: opts.lapLimit,
    criteria: settings?.criteria ?? null,
    gatingEvaluators: settings?.gate_evaluators,
    outcome,
  });

  return {
    ...results,
    slug,
    settings,
    isEvalveLoop: !!evalve,
    evalveSetup: evalve?.setup ?? null,
    cohortVersionId: evalve?.setup.cohortVersionId ?? results.cohortVersionId,
    hypothesis: loopHypothesis(control?.description),
  };
}
