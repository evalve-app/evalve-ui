// The states of the New loop page (MVP view): edit → approved → prompt → copied.
// Approve is browser state only. It saves nothing, and a reload returns the
// page to the edit state.
// - edit: the person fills the setup card.
// - approved: the setup card is locked.
// - prompt: the handoff prompt panel shows below the locked card.
// - copied: the person copied the handoff prompt, and the page waits for the
//   coding agent to create the control experiment.
export type ApproveState = "edit" | "approved" | "prompt" | "copied";

export type ApproveAction = "approve" | "cancel" | "getPrompt" | "copyPrompt";

// Which buttons are active. An inactive button does nothing.
export function approveButtons(state: ApproveState, { hasProblem }: { hasProblem: boolean }): Record<ApproveAction, boolean> {
  return {
    approve: state === "edit" && !hasProblem,
    // Cancel unlocks the card until the copy. After the copy, the coding agent can have the setup.
    cancel: state === "approved" || state === "prompt",
    getPrompt: state === "approved",
    copyPrompt: state === "prompt",
  };
}

const NEXT: Record<ApproveAction, ApproveState> = { approve: "approved", cancel: "edit", getPrompt: "prompt", copyPrompt: "copied" };

// The state after the person uses a button. An inactive button keeps the state.
export function nextApproveState(state: ApproveState, action: ApproveAction, form: { hasProblem: boolean }): ApproveState {
  return approveButtons(state, form)[action] ? NEXT[action] : state;
}
