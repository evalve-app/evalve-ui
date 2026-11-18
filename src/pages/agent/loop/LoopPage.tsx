import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { LoopDetail } from "../../../api/evalve";
import { Alert, Button } from "../../../design-system/components";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { formatDateTime } from "../../../lib/format";
import { findSetupCohort, setupFields } from "../../../lib/loopSetup";
import { loopOutcomeText } from "../../../lib/loopStatus";
import { useCohorts } from "../../../lib/useCohorts";
import { AgentDiffSection } from "./AgentDiffSection";
import { FinalResultsSection } from "./FinalResultsSection";
import { LAP_PAGE } from "./LapViews";
import { LoopStatus } from "./LoopStatus";
import { ResultsSection } from "./ResultsSection";
import { SetupCard } from "./SetupCard";
import { useBackendLoop, type BackendLoopData } from "./useBackendLoop";
import { useOwnerLabel, useViewerAccountId } from "./useOwnerLabel";

// One backend Loop, at loop/:loopId. The Evalve backend gives its status, its
// outcome and its winning Experiment; the results of each run come from Kitaru.
// A backend Loop has the MVP view only: the setup card, Results, Final
// results and Agent diff. Each viewer sees the same page; only the Loop owner's
// session moves the Loop.
export function LoopPage() {
  const { agentId = "", loopId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lapLimit, setLapLimit] = useState(LAP_PAGE);
  const preview = useEmptyPreview().on;
  const real = useBackendLoop(agentId, loopId, { lapLimit });
  const loop = preview ? { ...real, laps: [], totalLaps: 0, winnerLap: null, isLoading: false } : real;
  const detail = loop.loop;
  const completed = detail?.status === "completed";

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop`)}>
          <ArrowLeft size={14} aria-hidden />
          Loops
        </button>
        {detail ? <LoopHeader loop={loop} detail={detail} onRefresh={() => queryClient.invalidateQueries()} /> : null}
      </div>

      {loop.notFound ? (
        <div className="empty-state">
          <p className="empty-title">No Loop with this id</p>
          <p className="empty-text">
            Looking for a Skill Loop? Open it at{" "}
            <Link to={`/agents/${agentId}/skill-loop/${loopId}`} className="inline-link mono">
              skill-loop/{loopId}
            </Link>
            .
          </p>
        </div>
      ) : null}

      {loop.error ? (
        <Alert variant="destructive" title="Could not load this loop">
          {loop.error.message}
        </Alert>
      ) : null}

      {detail && !loop.isLoading && loop.totalLaps === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No experiments yet</p>
          <p className="empty-text">The control experiment shows here once the Evalve backend starts it.</p>
        </div>
      ) : null}

      {detail ? <LoopSetupCard agentId={agentId} loop={loop} detail={detail} /> : null}

      {loop.laps.length > 0 ? (
        <>
          <ResultsSection loop={loop} onShowOlder={() => setLapLimit(lapLimit + LAP_PAGE)} />
          {/* A Canceled or Failed Loop shows the Results table only. */}
          {completed ? (
            <>
              <FinalResultsSection loop={loop} />
              <AgentDiffSection loop={loop} />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LoopHeader({ loop, detail, onRefresh }: { loop: BackendLoopData; detail: LoopDetail; onRefresh: () => void }) {
  const owner = useOwnerLabel(detail.owner_account_id);
  const viewer = useViewerAccountId();
  const outcome = loop.outcome;
  // The reason of the backend shows below the badge, unless the outcome text already is the reason.
  const reason = detail.reason && detail.reason !== loopOutcomeText(outcome) ? detail.reason : null;
  return (
    <>
      <div className="detail-title-row">
        <div className="detail-title-block">
          <div className="title-with-status">
            <h2 className="detail-title">{detail.name}</h2>
            <LoopStatus outcome={outcome} withText />
          </div>
          {outcome.kind === "running" && outcome.idleDeadline ? <p className="field-hint">The Loop stops if no change comes by {formatDateTime(outcome.idleDeadline)}.</p> : null}
          {reason ? <p className="detail-description">{reason}</p> : null}
          <p className="field-hint">Loop owner: {owner}</p>
          {viewer && viewer !== detail.owner_account_id ? <p className="field-hint">Only the Loop owner's session updates this Loop.</p> : null}
        </div>
        <div className="toolbar-right">
          <Button variant="outline" icon={RefreshCw} onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      </div>
    </>
  );
}

// The read-only setup card of the Loop. It gets the name and the version of
// the cohort from the cohorts of the agent.
function LoopSetupCard({ agentId, loop, detail }: { agentId: string; loop: BackendLoopData; detail: LoopDetail }) {
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const cohort = findSetupCohort(cohorts.data ?? [], versionsByCohort, loop.cohortVersionId);
  return <SetupCard fields={setupFields({ slug: detail.slug, hypothesis: detail.setup.hypothesis ?? "", evalve: loop.setup, settings: null, cohort })} />;
}
