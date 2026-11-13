import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { Alert, Badge, Button } from "../../../design-system/components";
import { agentDiff, type AgentDiffCopy } from "../../../lib/loopResults";
import { agentOwnSettingsQuery } from "../../../lib/queries";
import type { LoopData } from "./useLoop";

// The Agent diff section of the loop page (MVP view): what change to apply to
// the agent. It shows only for a loop with a winning lap. The "before" prompt
// comes from the recorded session of the first case of the cohort, with its own query, so
// the other sections do not wait for it. All text comes from `agentDiff`.
export function AgentDiffSection({ loop }: { loop: LoopData }) {
  const firstCase = loop.firstCohortCase;
  const hasWinningLap = loop.winnerLap != null;
  const own = useQuery({ ...agentOwnSettingsQuery(firstCase?.id ?? ""), enabled: hasWinningLap && !!firstCase });
  const diff = agentDiff({
    winnerLap: loop.winnerLap,
    laps: loop.laps.map((l) => ({ lap: l.lap, override: l.experiment.override })),
    firstCase,
    // A failed request and a session with no prompt give null values, which is the fallback.
    // Until the cohort loads, the page does not know the first case, so the prompt waits.
    // A failed cohort request gives no first case at all, which is also the fallback.
    before: { loading: hasWinningLap && (firstCase ? own.isPending : loop.cohortCaseCount == null && !loop.cohortFailed), failed: own.isError || loop.cohortFailed, prompt: own.data?.prompt ?? null, model: own.data?.model ?? null, modelParams: own.data?.modelParams ?? null },
  });
  if (!diff) return null;
  const { prompt } = diff;
  const copy = prompt.kind === "diff" || prompt.kind === "after-only" ? prompt.copy : null;

  return (
    <section className="agent-diff" aria-labelledby="agent-diff-title">
      <div className="agent-diff-head">
        <div className="agent-diff-title-row">
          <h3 id="agent-diff-title" className="agent-diff-title">
            {diff.title}
          </h3>
          {diff.badge ? <Badge>{diff.badge}</Badge> : null}
        </div>
        <p className="agent-diff-sub">{diff.sub}</p>
      </div>

      <div className="agent-diff-card">
        <div className="agent-diff-card-head">
          <span className="agent-diff-card-title">System prompt</span>
          {prompt.kind === "diff" ? <span className="agent-diff-counts">{prompt.countLine}</span> : null}
        </div>
        {prompt.kind === "loading" ? (
          <p className="agent-diff-message muted" role="status">
            Loading the agent's own prompt…
          </p>
        ) : null}
        {prompt.kind === "unchanged" ? <p className="agent-diff-message muted">{prompt.text}</p> : null}
        {prompt.kind === "after-only" ? (
          <div className="agent-diff-fallback">
            <p className="field-hint">{prompt.note}</p>
            <pre className="code-block agent-diff-full">{prompt.text}</pre>
          </div>
        ) : null}
        {prompt.kind === "diff" ? (
          <div className="agent-diff-lines" role="group" aria-label="System prompt diff">
            {prompt.lines.map((l, i) => (
              <div key={i} className={`agent-diff-line ${l.kind}`}>
                <span className="agent-diff-num" aria-hidden>
                  {l.oldNumber ?? ""}
                </span>
                <span className="agent-diff-num" aria-hidden>
                  {l.newNumber ?? ""}
                </span>
                <span className="agent-diff-sign" aria-label={l.kind === "add" ? "added" : l.kind === "del" ? "removed" : undefined}>
                  {l.sign}
                </span>
                <span className="agent-diff-text">{l.text}</span>
              </div>
            ))}
          </div>
        ) : null}
        {prompt.kind === "diff" && prompt.source ? (
          <p className="agent-diff-source field-hint">
            The "before" side is the agent's own prompt, from the recorded session{" "}
            <Link to={`/sessions/${prompt.source.sessionId}`} className="inline-link mono">
              {prompt.source.name}
            </Link>
            .
          </p>
        ) : null}
        {diff.chips.length || copy ? (
          <div className="agent-diff-card-foot">
            <span className="agent-diff-chips">
              {diff.chips.map((c) => (
                <span key={c} className="criteria-chip">
                  {c}
                </span>
              ))}
            </span>
            {copy ? <CopyButton copy={copy} /> : null}
          </div>
        ) : null}
      </div>

      {diff.changedFields.length ? (
        <dl className="agent-diff-fields">
          {diff.changedFields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className="mono">
                {f.before} <span className="muted">→</span> {f.after}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <Alert variant="neutral" title={diff.note.title}>
        {diff.note.text}
      </Alert>
    </section>
  );
}

// "Copy diff" is the one primary button of the loop page. The copy of a full
// prompt with no diff is an outline button.
function CopyButton({ copy }: { copy: AgentDiffCopy }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(copy.text);
      setState("done");
    } catch {
      // The browser can refuse the clipboard (no permission, or no HTTPS).
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }
  return (
    <Button variant={copy.primary ? "default" : "outline"} icon={state === "done" ? Check : Copy} onClick={onCopy}>
      <span aria-live="polite">{state === "done" ? "Copied" : state === "failed" ? "Could not copy" : copy.label}</span>
    </Button>
  );
}
