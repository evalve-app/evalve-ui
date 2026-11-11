import type { EvalAggregate } from "../../api/client";
import { passCounts } from "../../lib/experiments";

// "19/20" with a thin bar and the change from baseline in percentage points.
export function PassRate({ aggregate, compact }: { aggregate: EvalAggregate; compact?: boolean }) {
  const { total, resultPassed, baselinePassed } = passCounts(aggregate);
  if (total === 0) return <span className="muted">No sessions</span>;
  const pct = Math.round((resultPassed / total) * 100);
  const delta = Math.round(((resultPassed - baselinePassed) / total) * 100);
  return (
    <span className={compact ? "pass-rate compact" : "pass-rate"}>
      <span className="pass-rate-bar" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="pass-rate-count mono">
        {resultPassed}/{total}
      </span>
      <Delta points={delta} />
    </span>
  );
}

export function Delta({ points }: { points: number }) {
  const cls = points > 0 ? "delta up" : points < 0 ? "delta down" : "delta flat";
  const text = points > 0 ? `+${points} pts` : points < 0 ? `${points} pts` : "±0";
  return (
    <span className={cls} title="Change in pass rate from the baseline sessions">
      {text}
    </span>
  );
}
