import type { EvalAggregate } from "../../api/client";
import { hasBaseline, passCounts } from "../../lib/experiments";

// "19/20" with a thin bar and the change from baseline in percentage points.
// A run with no scores for the recorded sessions shows no change.
export function PassRate({ aggregate, compact }: { aggregate: EvalAggregate; compact?: boolean }) {
  const { total, resultPassed, baselinePassed } = passCounts(aggregate);
  if (total === 0) return <span className="muted">No sessions</span>;
  const pct = Math.round((resultPassed / total) * 100);
  const delta = Math.round(((resultPassed - baselinePassed) / total) * 100);
  const compared = hasBaseline(aggregate);
  return (
    <span className={compact ? "pass-rate compact" : "pass-rate"}>
      <span className="pass-rate-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="pass-rate-count mono">
        {resultPassed}/{total}
      </span>
      {compared ? <Delta points={delta} /> : null}
    </span>
  );
}

// `versus` names what the change is from when it is not the baseline, such
// as "vs control", and `title` then says it in full.
export function Delta({ points, versus, title = "Change in pass rate from the baseline sessions" }: { points: number; versus?: string; title?: string }) {
  const cls = points > 0 ? "delta up" : points < 0 ? "delta down" : "delta flat";
  const text = points > 0 ? `+${points} pts` : points < 0 ? `${points} pts` : "±0";
  return (
    <span className={cls} title={title}>
      {versus ? `${text} ${versus}` : text}
    </span>
  );
}
