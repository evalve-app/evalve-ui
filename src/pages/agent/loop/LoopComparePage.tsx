import { useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Alert } from "../../../design-system/components";
import { useLoopMode } from "../../../lib/loopMode";
import { experimentName } from "../../../lib/loops";
import { CompareCard, LapGrid, Legend } from "./LapViews";
import { useBackendLoop } from "./useBackendLoop";
import type { LoopResults } from "./useLoopResults";
import { useSkillLoop } from "./useSkillLoop";

// The compare page of a Skill Loop, at skill-loop/:slug/compare.
export function SkillLoopComparePage() {
  const { agentId = "", slug = "" } = useParams();
  const loop = useSkillLoop(agentId, slug, { lapLimit: 200 });
  const mvp = useLoopMode() === "mvp";
  return <LoopCompare agentId={agentId} loop={loop} mvp={mvp} back={{ to: `/agents/${agentId}/skill-loop/${slug}`, label: slug }} />;
}

// The compare page of a backend Loop, at loop/:loopId/compare. A backend Loop has the MVP view only.
export function LoopComparePage() {
  const { agentId = "", loopId = "" } = useParams();
  const loop = useBackendLoop(loopId, { lapLimit: 200 });
  return <LoopCompare agentId={agentId} loop={loop} mvp back={{ to: `/agents/${agentId}/loop/${loopId}`, label: loop.loop?.name ?? loopId }} />;
}

// The laps picked on the loop page, side by side: their rows from the grid,
// then what changed between each lap and the next one picked.
function LoopCompare({ agentId, loop, mvp, back }: { agentId: string; loop: LoopResults; mvp: boolean; back: { to: string; label: string } }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wanted = (params.get("laps") ?? "").split(",").map(Number).filter(Number.isFinite);
  const laps = loop.laps.filter((l) => wanted.includes(l.lap));
  const pairs = laps.slice(1).map((b, i) => [laps[i], b] as const);
  const single = mvp && laps.every((l) => l.runs.length <= 1);

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(back.to)}>
          <ArrowLeft size={14} aria-hidden />
          {back.label}
        </button>
        <h2 className="detail-title sans">Compare experiments: {laps.map((l) => experimentName(l.lap, "short")).join(", ")}</h2>
      </div>

      {loop.error ? (
        <Alert variant="destructive" title="Could not load this loop">
          {loop.error.message}
        </Alert>
      ) : null}

      {!loop.isLoading && laps.length < 2 ? (
        <div className="empty-state">
          <p className="empty-title">Pick at least two experiments</p>
          <p className="empty-text">Go back to the loop, tick the experiments you want, and choose Compare.</p>
        </div>
      ) : null}

      {laps.length >= 2 ? (
        <>
          <div className="panel lap-panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Selected experiments</div>
                <div className="panel-sub">{single ? "Each cell is one case in that experiment's run." : "Each cell is one case across all of that experiment's runs."}</div>
              </div>
              <Legend single={single} />
            </div>
            <LapGrid laps={laps} cases={loop.cases} c={loop.criteria} winnerLap={loop.winnerLap} view={mvp ? "mvp" : "post"} />
          </div>
          {pairs.map(([a, b]) => (
            <CompareCard key={`${a.lap}-${b.lap}`} a={a} b={b} cases={loop.cases} agentId={agentId} view={mvp ? "mvp" : "post"} />
          ))}
        </>
      ) : null}
    </div>
  );
}
