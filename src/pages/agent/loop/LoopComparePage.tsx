import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Alert } from "../../../design-system/components";
import { useLoopMode } from "../../../lib/loopMode";
import { CompareCard, LapGrid, Legend } from "./LapViews";
import { useLoop } from "./useLoop";

// The laps picked on the loop page, side by side: their rows from the grid,
// then what changed between each lap and the next one picked.
export function LoopComparePage() {
  const { agentId = "", slug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const loop = useLoop(agentId, slug, { lapLimit: 200 });
  const wanted = (params.get("laps") ?? "").split(",").map(Number).filter(Number.isFinite);
  const laps = loop.laps.filter((l) => wanted.includes(l.lap));
  const pairs = laps.slice(1).map((b, i) => [laps[i], b] as const);
  const single = useLoopMode() === "mvp" && laps.every((l) => l.runs.length <= 1);

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop/${slug}`)}>
          <ArrowLeft size={14} aria-hidden />
          {slug}
        </button>
        <h2 className="detail-title sans">Compare laps {laps.map((l) => l.lap).join(", ")}</h2>
      </div>

      {loop.error ? (
        <Alert variant="destructive" title="Could not load this loop">
          {loop.error.message}
        </Alert>
      ) : null}

      {!loop.isLoading && laps.length < 2 ? (
        <div className="empty-state">
          <p className="empty-title">Pick at least two laps</p>
          <p className="empty-text">Go back to the loop, tick the laps you want, and choose Compare.</p>
        </div>
      ) : null}

      {laps.length >= 2 ? (
        <>
          <div className="panel lap-panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Selected laps</div>
                <div className="panel-sub">{single ? "Each cell is one case in that lap's run." : "Each cell is one case across all of that lap's runs."}</div>
              </div>
              <Legend single={single} />
            </div>
            <LapGrid laps={laps} cases={loop.cases} c={loop.settings?.criteria ?? null} winnerLap={loop.winnerLap} />
          </div>
          {pairs.map(([a, b]) => (
            <CompareCard key={`${a.lap}-${b.lap}`} a={a} b={b} cases={loop.cases} agentId={agentId} />
          ))}
        </>
      ) : null}
    </div>
  );
}
