// How the experiment list names an experiment.
//
// An experiment of a Loop has a name that a program made: the Evalve backend
// names it "evalve-<loop id>-exp-9", and a loop skill names it
// "<slug>-round-9". Its description starts with a "Round 9: … Hypothesis: …"
// line and can hold lines of settings. The list shows the Loop and the number
// of the experiment as the name, and the change as the description.
import type { Experiment } from "../api/client";
import { experimentName, lapSummary, parseEvalveLoop, parseRoundName } from "./loops";

export type ExperimentLabel = {
  name: string; // what the list shows
  description: string | null;
  kitaruName: string; // the name that Kitaru has, for a tooltip and the search
  // For an experiment of a Loop: a key that the experiments of the Loop share,
  // and the number of the experiment in the Loop (0 for the control experiment).
  loop: string | null;
  lap: number | null;
};

const BACKEND_NAME = /^evalve-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-exp-(\d+)$/i;

// The Loop of an experiment and its number in the Loop, from its name. Null
// for an experiment that is not of a Loop.
function loopExperiment(name: string): { loopId: string | null; slug: string; lap: number } | null {
  const backend = name.match(BACKEND_NAME);
  if (backend) return { loopId: backend[1], slug: backend[1], lap: Number(backend[2]) };
  const round = parseRoundName(name);
  return round ? { loopId: null, slug: round.slug, lap: round.lap } : null;
}

// The label of each experiment, by experiment id. The name of a backend Loop
// comes from the settings line of its control experiment. Without that line
// the label has the start of the Loop id.
export function experimentLabels(experiments: Pick<Experiment, "id" | "name" | "description">[]): Map<string, ExperimentLabel> {
  const loopNames = new Map<string, string>();
  for (const e of experiments) {
    const found = loopExperiment(e.name);
    if (!found?.loopId || found.lap !== 0) continue;
    const name = parseEvalveLoop(e.description)?.setup.name;
    if (name) loopNames.set(found.loopId, name);
  }
  return new Map(
    experiments.map((e): [string, ExperimentLabel] => {
      const found = loopExperiment(e.name);
      if (!found) return [e.id, { name: e.name, description: e.description ?? null, kitaruName: e.name, loop: null, lap: null }];
      const loop = found.loopId ? (loopNames.get(found.loopId) ?? `Loop ${found.loopId.slice(0, 8)}`) : found.slug;
      return [e.id, { name: `${loop} · ${experimentName(found.lap)}`, description: lapSummary(e.description, found.lap) || null, kitaruName: e.name, loop: found.slug, lap: found.lap }];
    }),
  );
}

// The id of the control experiment of each Loop, by the Loop key of the labels.
export function controlExperiments(labels: Map<string, ExperimentLabel>): Map<string, string> {
  const controls = new Map<string, string>();
  for (const [id, label] of labels) if (label.loop != null && label.lap === 0) controls.set(label.loop, id);
  return controls;
}

// True when the label, or the name or description that Kitaru has, holds the search text.
export function labelMatches(label: ExperimentLabel, experiment: Pick<Experiment, "description">, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [label.name, label.description, label.kitaruName, experiment.description].some((text) => (text ?? "").toLowerCase().includes(t));
}
