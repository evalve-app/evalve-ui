import { describe, expect, it } from "vitest";
import { controlExperiments, experimentLabels, labelMatches } from "./experimentLabels";

const LOOP = "6a217f9e-96b0-47e6-9946-a3d9b017594c";
const settings = (name: string) => `Evalve loop: ${JSON.stringify({ schema_version: 1, lap: 0, loop_id: LOOP, required_consecutive_greens: 2, name })}`;
const experiment = (id: string, name: string, description: string | null = null) => ({ id, name, description });

describe("experimentLabels", () => {
  it("keeps the name and description of an experiment that is not of a Loop", () => {
    const labels = experimentLabels([experiment("e1", "try-gpt-4-1-mini", "Same prompt on a newer model.")]);
    expect(labels.get("e1")).toEqual({ name: "try-gpt-4-1-mini", description: "Same prompt on a newer model.", kitaruName: "try-gpt-4-1-mini", loop: null, lap: null });
  });

  it("names an experiment of a backend Loop by the Loop and its number, with the change as description", () => {
    const labels = experimentLabels([
      experiment("e0", `evalve-${LOOP}-exp-0`, `Round 0: Unchanged control Hypothesis: StudyBot fails one in five.\n${settings("all-sessions-loop")}`),
      experiment("e9", `evalve-${LOOP}-exp-9`, "Round 9: Add a task for checking a student's work Hypothesis: StudyBot fails one in five.\nEvalve loop: {}"),
    ]);
    expect(labels.get("e0")).toEqual({ name: "all-sessions-loop · Control experiment", description: "Replay with no changes", kitaruName: `evalve-${LOOP}-exp-0`, loop: LOOP, lap: 0 });
    expect(labels.get("e9")).toEqual({ name: "all-sessions-loop · Experiment 9", description: "Add a task for checking a student's work", kitaruName: `evalve-${LOOP}-exp-9`, loop: LOOP, lap: 9 });
    expect([...controlExperiments(labels)]).toEqual([[LOOP, "e0"]]);
  });

  it("uses the start of the Loop id when the control experiment gives no name", () => {
    const labels = experimentLabels([experiment("e2", `evalve-${LOOP}-exp-2`, "Round 2: Shorter answers Hypothesis: Too long.")]);
    expect(labels.get("e2")?.name).toBe("Loop 6a217f9e · Experiment 2");
  });

  it("names an experiment of a Skill Loop by its slug", () => {
    const labels = experimentLabels([experiment("r1", "day-30-refunds-round-1", "Round 1: Cite the refund rule Hypothesis: Refunds fail on day 30.")]);
    expect(labels.get("r1")).toEqual({ name: "day-30-refunds · Experiment 1", description: "Cite the refund rule", kitaruName: "day-30-refunds-round-1", loop: "day-30-refunds", lap: 1 });
    expect(controlExperiments(labels).size).toBe(0);
  });

  it("has no description when the description of a Loop experiment has no change", () => {
    expect(experimentLabels([experiment("e3", `evalve-${LOOP}-exp-3`, null)]).get("e3")?.description).toBeNull();
  });
});

describe("labelMatches", () => {
  const e = experiment("e9", `evalve-${LOOP}-exp-9`, "Round 9: Add a task Hypothesis: StudyBot fails one in five.");
  const label = { name: "all-sessions-loop · Experiment 9", description: "Add a task", kitaruName: e.name, loop: LOOP, lap: 9 };

  it("matches each text, in any case", () => {
    expect(labelMatches(label, e, "ALL-SESSIONS")).toBe(true);
    expect(labelMatches(label, e, "add a task")).toBe(true);
    expect(labelMatches(label, e, "6a217f9e")).toBe(true);
    expect(labelMatches(label, e, "one in five")).toBe(true);
  });

  it("matches everything for an empty search", () => {
    expect(labelMatches(label, e, "  ")).toBe(true);
  });

  it("does not match a text that is in none of them", () => {
    expect(labelMatches(label, e, "refund")).toBe(false);
  });
});
