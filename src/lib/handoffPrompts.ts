// Handoff prompts: text that the app writes for a person to paste into a
// coding agent. The app creates nothing; the coding agent does the work.
// The texts are the same as in Kitaru's own dialogs.

export type HandoffPrompt = { title: string; description: string; prompt: string };

type AgentRef = { id: string; name: string };

const agentRef = (agent: AgentRef) => `agent "${agent.name}" (id ${agent.id})`;

export function newCohortPrompt(agent: AgentRef): HandoffPrompt {
  return {
    title: "Create a cohort from reviewed sessions",
    description: "Kitaru writes the prompt. Your coding agent runs the interview in the terminal.",
    prompt:
      `Use the \`kitaru-investigation\` skill to review four varied sessions from ${agentRef(agent)}. ` +
      "Begin the read-only analysis immediately. Lead with the most consequential observable behavior you find, whether problematic or unexpectedly effective. " +
      "Explain why it matters and cite the supporting sessions and trace evidence. Include a relevant counterexample or the main uncertainty. " +
      "Then give me two options: investigate this behavior across more sessions, or turn it into a versioned cohort. " +
      "If I choose the cohort, propose its exact behavior definition and session membership, then ask once before creating it.",
  };
}

export function newInvestigationPrompt(agent: AgentRef): HandoffPrompt {
  return {
    title: "Start a new investigation",
    description: "Kitaru writes the prompt. Your coding agent prepares the review worklist in the terminal.",
    prompt:
      `Use the \`kitaru-investigation\` skill to start a new investigation of ${agentRef(agent)}. ` +
      "Review its existing investigations and recorded sessions first. If I name a session I want to understand, start there; otherwise select a small, varied sample. " +
      "Create the smallest useful ordered worklist. Give each session an issue-focused observation question that asks which agent behaviors may have harmed the outcome and requests supporting trace evidence. " +
      "If I named a suspected behavior, add one focused question that tests it without assuming it occurred. " +
      "If an existing investigation already covers the same work, direct me to it instead. Otherwise create the investigation, then hand me back to Kitaru to review it.",
  };
}
