import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";
import { api } from "../api/client";
import { Button } from "../design-system/components";

// Agents are registered from the repo they live in, not from this page
// (same as Kitaru's "From your repo" tab). This dialog hands the person a
// prompt for their coding agent.
export function NewAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const info = useQuery({
    queryKey: ["info"],
    queryFn: async () => (await api.GET("/api/v1/info")).data,
    enabled: open,
  });

  // A native <dialog> gives focus trapping and Escape-to-close for free.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const server = info.data?.server_url ?? "your Kitaru server";
  const prompt =
    "Use the `kitaru-investigation` skill to connect the agent in this repository to Kitaru and get it ready for investigation. " +
    "Inspect the repository and the configured Kitaru environment first. Reuse any existing agent registration or sessions, " +
    "and choose the smallest supported path to bring in relevant traces. If an export, provider access, or another prerequisite " +
    `is missing, ask me for the single smallest thing you need. Kitaru server: ${server}.`;

  async function copy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="new-agent-title">
      <div className="dialog-header">
        <div>
          <h2 id="new-agent-title" className="dialog-title">
            New agent
          </h2>
          <p className="dialog-description">Agents are connected from the repo they live in. Give this prompt to your coding agent and it does the rest.</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="prompt-box">
        <p className="prompt-text">{prompt}</p>
      </div>
      <p className="dialog-hint">Works in any coding agent: Claude Code, Codex, Gemini CLI, or your own.</p>
      <div className="dialog-footer">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button icon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copied" : "Copy prompt"}
        </Button>
      </div>
    </dialog>
  );
}
