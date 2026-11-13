import { describe, expect, it } from "vitest";
import { newCohortPrompt, newEvaluatorPrompt, newInvestigationPrompt } from "./handoffPrompts";

// The expected texts are what Kitaru's own dialogs show for this agent.
const agent = { id: "01a1c6ab-3988-7679-8226-a2875d668231", name: "support-desk-demo" };

describe("newCohortPrompt", () => {
  it("gives the dialog text and a handoff prompt that names the agent", () => {
    expect(newCohortPrompt(agent)).toEqual({
      title: "Create a cohort from reviewed sessions",
      description: "Kitaru writes the prompt. Your coding agent runs the interview in the terminal.",
      prompt:
        'Use the `kitaru-investigation` skill to review four varied sessions from agent "support-desk-demo" (id 01a1c6ab-3988-7679-8226-a2875d668231). Begin the read-only analysis immediately. Lead with the most consequential observable behavior you find, whether problematic or unexpectedly effective. Explain why it matters and cite the supporting sessions and trace evidence. Include a relevant counterexample or the main uncertainty. Then give me two options: investigate this behavior across more sessions, or turn it into a versioned cohort. If I choose the cohort, propose its exact behavior definition and session membership, then ask once before creating it.',
    });
  });
});

describe("newInvestigationPrompt", () => {
  it("gives the dialog text and a handoff prompt that names the agent", () => {
    expect(newInvestigationPrompt(agent)).toEqual({
      title: "Start a new investigation",
      description: "Kitaru writes the prompt. Your coding agent prepares the review worklist in the terminal.",
      prompt:
        'Use the `kitaru-investigation` skill to start a new investigation of agent "support-desk-demo" (id 01a1c6ab-3988-7679-8226-a2875d668231). Review its existing investigations and recorded sessions first. If I name a session I want to understand, start there; otherwise select a small, varied sample. Create the smallest useful ordered worklist. Give each session an issue-focused observation question that asks which agent behaviors may have harmed the outcome and requests supporting trace evidence. If I named a suspected behavior, add one focused question that tests it without assuming it occurred. If an existing investigation already covers the same work, direct me to it instead. Otherwise create the investigation, then hand me back to Kitaru to review it.',
    });
  });
});

describe("newEvaluatorPrompt", () => {
  it("asks the coding agent to confirm once before it registers an evaluator", () => {
    const p = newEvaluatorPrompt();
    expect(p.title).toBe("Draft an evaluator from your recorded sessions");
    expect(p.prompt).toMatch(/^Use the `kitaru-investigation` skill/);
    expect(p.prompt).toMatch(/Confirm with me once before registering anything\.$/);
  });
});
