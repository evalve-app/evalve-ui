import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { LoopDetail } from "../../../api/evalve";
import { Alert, Button } from "../../../design-system/components";
import { loopEndedAt } from "../../../lib/backendLoops";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { formatDateTime } from "../../../lib/format";
import { canCancelLoop, cancelAlertText, cancelFailure } from "../../../lib/loopCancel";
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
import { useCancelLoop } from "./useCancelLoop";
import { useOwnerLabel, useViewerAccountId } from "./useOwnerLabel";

// One backend Loop, at loop/:loopId. The Evalve backend gives its status, its
// outcome and its winning Experiment; the results of each run come from Kitaru.
// A backend Loop has the MVP view only: the setup card, Results, Final
// results and Agent diff. Each viewer sees the same page; only the Loop owner's
// session moves the Loop, and only the Loop owner gets "Cancel Loop".
export function LoopPage() {
  const { agentId = "", loopId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lapLimit, setLapLimit] = useState(LAP_PAGE);
  const preview = useEmptyPreview().on;
  const viewer = useViewerAccountId();
  const cancel = useCancelLoop(loopId);
  // True while the page asks "Cancel this Loop?".
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The poll of the Loop owner takes the Loop lock, which the cancel needs. No poll while the cancel is in progress.
  const real = useBackendLoop(loopId, { lapLimit, pollPaused: cancel.isPending });
  const loop = preview ? { ...real, laps: [], totalLaps: 0, winnerLap: null, isLoading: false, backendExperiments: [] } : real;
  const detail = loop.loop;
  const completed = detail?.status === "completed";
  // False when the Loop ends, so the button, the question and the alert go away together.
  const canCancel = detail ? canCancelLoop(detail, viewer) : false;

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop`)}>
          <ArrowLeft size={14} aria-hidden />
          Loops
        </button>
        {detail ? (
          <LoopHeader
            loop={loop}
            detail={detail}
            viewer={viewer}
            // A read of the Loop takes the Loop lock, so "Refresh" waits for the cancel.
            refreshDisabled={cancel.isPending}
            onRefresh={() => queryClient.invalidateQueries()}
            cancelControl={
              canCancel ? (
                <CancelLoop
                  confirming={confirmingCancel}
                  busy={cancel.isPending}
                  onAsk={() => setConfirmingCancel(true)}
                  onKeep={() => setConfirmingCancel(false)}
                  // After a failure, the first button comes back.
                  onConfirm={() => cancel.mutate(undefined, { onSettled: () => setConfirmingCancel(false) })}
                />
              ) : null
            }
          />
        ) : null}
      </div>

      {canCancel && cancel.isError ? (
        <Alert variant="destructive" title="Could not cancel this Loop">
          {cancelAlertText(cancelFailure(cancel.error))}
        </Alert>
      ) : null}

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

      {loop.backendExperiments.length > 0 ? (
        <>
          <ResultsSection loop={loop} backend={loop.backendExperiments} onShowOlder={() => setLapLimit(lapLimit + LAP_PAGE)} />
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

function LoopHeader({
  loop,
  detail,
  viewer,
  cancelControl,
  refreshDisabled,
  onRefresh,
}: {
  loop: BackendLoopData;
  detail: LoopDetail;
  viewer: string | null;
  cancelControl: ReactNode; // "Cancel Loop", or null for a viewer who cannot cancel this Loop
  refreshDisabled: boolean;
  onRefresh: () => void;
}) {
  const owner = useOwnerLabel(detail.owner_account_id);
  const outcome = loop.outcome;
  const endedAt = loopEndedAt(detail);
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
          {endedAt ? <p className="field-hint">Ended {formatDateTime(endedAt)}</p> : null}
          <p className="field-hint">Loop owner: {owner}</p>
          {viewer && viewer !== detail.owner_account_id ? <p className="field-hint">Only the Loop owner's session updates this Loop.</p> : null}
        </div>
        <div className="toolbar-right">
          {cancelControl}
          <Button variant="outline" icon={RefreshCw} onClick={onRefresh} disabled={refreshDisabled}>
            Refresh
          </Button>
        </div>
      </div>
    </>
  );
}

// "Cancel Loop", which first asks one time, the same as "Revoke" in Settings.
// A canceled Loop cannot continue.
function CancelLoop({ confirming, busy, onAsk, onKeep, onConfirm }: { confirming: boolean; busy: boolean; onAsk: () => void; onKeep: () => void; onConfirm: () => void }) {
  // True after the question showed one time. The focus then goes back to the first button.
  const [asked, setAsked] = useState(false);
  if (!confirming) {
    return (
      <Button
        variant="outline"
        autoFocus={asked}
        onClick={() => {
          setAsked(true);
          onAsk();
        }}
      >
        Cancel Loop
      </Button>
    );
  }
  return (
    <span className="loop-cancel-confirm" role="group" aria-label="Cancel Loop">
      <span>Cancel this Loop? A run in flight stops, and the Loop cannot continue.</span>
      <Button variant="destructive" onClick={onConfirm} disabled={busy}>
        {busy ? "Canceling" : "Cancel Loop"}
      </Button>
      {/* "Cancel Loop" is gone from the header, so the focus moves to the safe answer. */}
      <Button variant="ghost" onClick={onKeep} disabled={busy} autoFocus>
        Keep running
      </Button>
    </span>
  );
}

// The read-only setup card of the Loop. It gets the name and the version of
// the cohort from the cohorts of the agent.
function LoopSetupCard({ agentId, loop, detail }: { agentId: string; loop: BackendLoopData; detail: LoopDetail }) {
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const cohort = findSetupCohort(cohorts.data ?? [], versionsByCohort, loop.cohortVersionId);
  return <SetupCard fields={setupFields({ slug: detail.slug, hypothesis: detail.setup.hypothesis ?? "", evalve: loop.setup, settings: null, cohort })} />;
}
