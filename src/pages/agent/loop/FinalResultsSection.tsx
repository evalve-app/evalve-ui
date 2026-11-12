import { Alert } from "../../../design-system/components";
import { LoopStats } from "./LapViews";
import type { LoopData } from "./useLoop";

// The Final results section of the loop page (MVP view): if the loop passed.
// For now it holds the completed banner, the stat tiles, and the trend line.
export function FinalResultsSection({ loop }: { loop: LoopData }) {
  const outcome = loop.outcome;
  return (
    <>
      {outcome.kind === "completed" ? (
        <Alert variant={outcome.passed ? "success" : "neutral"} title={outcome.title}>
          {outcome.detail}
        </Alert>
      ) : null}
      <LoopStats loop={loop} />
    </>
  );
}
