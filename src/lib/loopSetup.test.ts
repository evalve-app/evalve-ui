import { describe, expect, it } from "vitest";
import { findSetupCohort, setupFields } from "./loopSetup";
import { parseEvalveLoop, parseSettings } from "./loops";

const cohort = { name: "Refund requests", version: "v3", caseCount: 23 };

describe("setupFields", () => {
  it("shows the setup that the runner wrote for a new loop", () => {
    const description =
      'Round 0: Unchanged baseline Hypothesis: The agent reads the window as exclusive.\nEvalve loop: {"schema_version":1,"loop_id":"loop-id","lap":0,"name":"Day-30 refunds","cohort_version_id":"cv","required_consecutive_greens":2,"max_attempts":10,"budget_usd":"5.00","allowed_changes":["system_prompt","model"],"allowed_models":[],"agent_version_id":"av","evaluators":["refund-policy@3","kitaru/tool-error@1"]}';
    const fields = setupFields({
      slug: "day-30-refunds",
      hypothesis: "The agent reads the window as exclusive.",
      evalve: parseEvalveLoop(description)!.setup,
      settings: null,
      cohort,
    });
    expect(fields).toEqual({
      name: "Day-30 refunds",
      hypothesis: "The agent reads the window as exclusive.",
      cohort: "Refund requests · v3 (23 cases)",
      gatingEvaluators: ["refund-policy@3", "kitaru/tool-error@1"],
      changes: ["System prompt", "Model"],
      greenRuns: "2",
      maxRuns: "10",
      budget: "$5.00",
    });
  });

  it("shows the fields that a loop of the old skill carries, and a dash for the others", () => {
    const settings = parseSettings(
      'Round 0: Unchanged baseline\nLoop settings: {"name":"Day-30 refunds","criteria":{"trials_per_round":5,"k":3,"max_rounds":4,"budget_usd":1.5},"allowed_changes":["system_prompt"],"allowed_models":[],"gate_evaluators":["support-desk-action-correct"]}',
    );
    expect(setupFields({ slug: "day-30-refunds", hypothesis: "", evalve: null, settings, cohort: { ...cohort, caseCount: 1 } })).toEqual({
      name: "Day-30 refunds",
      hypothesis: "—",
      cohort: "Refund requests · v3 (1 case)",
      gatingEvaluators: ["support-desk-action-correct"],
      changes: ["System prompt"],
      greenRuns: "—",
      maxRuns: "—",
      budget: "$1.50",
    });
  });

  it("never shows a default value of the old rules", () => {
    // The reader fills the rules that the line does not carry with defaults. None of them is a card field.
    const settings = parseSettings('Loop settings: {"name":"Day-30 refunds","criteria":{}}');
    expect(setupFields({ slug: "day-30-refunds", hypothesis: "", evalve: null, settings, cohort: null })).toMatchObject({
      gatingEvaluators: ["—"],
      changes: ["—"],
      greenRuns: "—",
      maxRuns: "—",
      budget: "—",
    });
  });

  it("shows the name of the experiments and a dash in each other field for a loop with no settings", () => {
    expect(setupFields({ slug: "support-desk-demo", hypothesis: "", evalve: null, settings: null, cohort: null })).toEqual({
      name: "support-desk-demo",
      hypothesis: "—",
      cohort: "—",
      gatingEvaluators: ["—"],
      changes: ["—"],
      greenRuns: "—",
      maxRuns: "—",
      budget: "—",
    });
  });

  it("shows a dash for a field that the line of a new loop does not carry", () => {
    const evalve = parseEvalveLoop('Evalve loop: {"schema_version":1,"loop_id":"loop-id","lap":0,"required_consecutive_greens":1}')!.setup;
    expect(setupFields({ slug: "day-30-refunds", hypothesis: "", evalve, settings: null, cohort: null })).toMatchObject({
      name: "day-30-refunds",
      gatingEvaluators: ["—"],
      changes: ["—"],
      greenRuns: "1",
      maxRuns: "—",
      budget: "—",
    });
  });
});

describe("findSetupCohort", () => {
  const cohorts = [{ id: "c-1", name: "Refund requests" }, { id: "c-2", name: "Late fees" }];
  const versionsByCohort = {
    "c-1": [{ id: "cv-1", version: 1, session_count: 20 }, { id: "cv-3", version: 3, display_version: "2026-11", session_count: 23 }],
    "c-2": undefined, // the versions of this cohort did not load
  };

  it("finds the cohort and the version that the loop replays", () => {
    expect(findSetupCohort(cohorts, versionsByCohort, "cv-1")).toEqual({ name: "Refund requests", version: "v1", caseCount: 20 });
    expect(findSetupCohort(cohorts, versionsByCohort, "cv-3")).toEqual({ name: "Refund requests", version: "2026-11", caseCount: 23 });
  });

  it("finds nothing for a version that no loaded cohort has, and for a loop with no cohort version", () => {
    expect(findSetupCohort(cohorts, versionsByCohort, "cv-9")).toBeNull();
    expect(findSetupCohort(cohorts, versionsByCohort, null)).toBeNull();
  });
});
