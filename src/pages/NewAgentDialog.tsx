import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { HandoffPromptDialog } from "./HandoffPromptDialog";

// Agents are registered from the repo they live in, not from this page
// (same as Kitaru's "From your repo" tab). This dialog hands the person a
// prompt for their coding agent.
export function NewAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const info = useQuery({
    queryKey: ["info"],
    queryFn: async () => (await api.GET("/api/v1/info")).data,
    enabled: open,
  });

  const server = info.data?.server_url ?? "your Kitaru server";
  const prompt =
    "Use the `kitaru-investigation` skill to connect the agent in this repository to Kitaru and get it ready for investigation. " +
    "Inspect the repository and the configured Kitaru environment first. Reuse any existing agent registration or sessions, " +
    "and choose the smallest supported path to bring in relevant traces. If an export, provider access, or another prerequisite " +
    `is missing, ask me for the single smallest thing you need. Kitaru server: ${server}.`;

  return (
    <HandoffPromptDialog
      open={open}
      onClose={onClose}
      title="New agent"
      description="Agents are connected from the repo they live in. Give this prompt to your coding agent and it does the rest."
      prompt={prompt}
      hint="Works in any coding agent: Claude Code, Codex, Gemini CLI, or your own."
    />
  );
}
