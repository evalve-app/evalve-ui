import { useState } from "react";
import { useOutletContext } from "react-router";
import { Plus } from "lucide-react";
import type { Agent } from "../../api/client";
import { Button } from "../../design-system/components";
import type { HandoffPrompt } from "../../lib/handoffPrompts";
import { HandoffPromptDialog } from "../HandoffPromptDialog";

// The "New ..." button of an agent tab. It opens a dialog with a handoff
// prompt for this agent. The agent comes from AgentLayout, and the button is
// disabled until it is loaded.
export function HandoffPromptButton({ label, handoff }: { label: string; handoff: (agent: Agent) => HandoffPrompt }) {
  const agent = useOutletContext<Agent | undefined>();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)} disabled={!agent}>
        {label}
      </Button>
      {agent ? <HandoffPromptDialog open={open} onClose={() => setOpen(false)} {...handoff(agent)} /> : null}
    </>
  );
}
