import { Check, X } from "lucide-react";
import { Badge } from "../../../design-system/components";
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
          <h3 id="final-results-title" className="section-title">
            Final results
          </h3>
          <Badge variant={r.badge.tone}>{r.badge.label}</Badge>
        </div>
        <p className="final-results-line">{r.line}</p>
        <p className="final-results-detail">{r.detail}</p>
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

      {r.bars.length > 0 ? (
        <div className="final-results-panel">
          <h4 className="final-results-panel-title">Pass rate by lap</h4>
          <div className="final-results-bars" role="img" aria-label={r.chartLabel}>
            {r.bars.map((bar) => (
              <div key={bar.lap} className="final-results-bar-col" aria-hidden>
                <span className="final-results-bar-value">{bar.text}</span>
                <div className="final-results-bar-track">
                  <div className={bar.inUse ? "final-results-bar in-use" : "final-results-bar"} style={{ height: `${bar.rate * 100}%` }} />
                </div>
                <span className="final-results-bar-label">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {r.criteria ? (
        <div className="final-results-panel">
          <h4 className="final-results-panel-title">Criteria</h4>
          <ul className="final-results-criteria">
            {r.criteria.map((row) => (
              <li key={row.label} className="final-results-criterion">
                {row.met ? <Check size={14} className="final-results-mark met" aria-label="Met" /> : <X size={14} className="final-results-mark not-met" aria-label="Not met" />}
                <span className="final-results-criterion-label">{row.label}</span>
                <span className="final-results-criterion-value">{row.value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="final-results-note">{r.note}</p>
    </section>
  );
}
