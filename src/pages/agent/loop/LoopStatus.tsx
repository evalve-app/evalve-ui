import { StatusLabel } from "../../../design-system/components";
import { loopOutcomeText, loopStatusLabel, type LoopOutcome } from "../../../lib/loopStatus";

// The status badge of a Loop and, below it, the outcome text.
export function LoopStatus({ outcome, withText = false }: { outcome: LoopOutcome; withText?: boolean }) {
  const text = withText ? loopOutcomeText(outcome) : null;
  return (
    <span className="loop-status">
      <StatusLabel {...loopStatusLabel(outcome)} />
      {text ? <span className="loop-status-text">{text}</span> : null}
    </span>
  );
}
