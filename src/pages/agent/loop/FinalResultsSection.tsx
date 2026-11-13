import { Alert, Badge } from "../../../design-system/components";
import { finalResults } from "../../../lib/loopResults";
import type { LoopData } from "./useLoop";

// The Final results section of the loop page (MVP view): if the loop passed.
// It shows only for a completed loop. The loop results view model makes all
// the text and the numbers, and this component lays them out.
export function FinalResultsSection({ loop }: { loop: LoopData }) {
  const r = finalResults(loop);
  if (!r) return null;
  return (
    <section className="final-results" aria-labelledby="final-results-title">
      <div className="final-results-head">
        <div className="final-results-title-row">
          <h3 id="final-results-title" className="final-results-title">
            Final results
          </h3>
          <Badge variant={r.badge.tone} dot>
            {r.badge.label}
          </Badge>
        </div>
        <p className="final-results-line">{r.line}</p>
      </div>

      <div className="final-results-cards">
        {r.cards.map((card) => (
          <div key={card.label} className="final-results-card">
            <span className="final-results-card-label">{card.label}</span>
            <span className="final-results-card-value">{card.value}</span>
            <span className="final-results-card-sub">{card.sub}</span>
          </div>
        ))}
      </div>

      <Alert variant="neutral" title={r.note.title}>
        {r.note.text}
      </Alert>
    </section>
  );
}
