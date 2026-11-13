import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, Button } from "../../../design-system/components";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { LoopModeToggle, useLoopMode } from "../../../lib/loopMode";
import { findSetupCohort, setupFields } from "../../../lib/loopSetup";
import { CHANGE_FIELD_LABELS, type Criteria } from "../../../lib/loops";
import { useCohorts } from "../../../lib/useCohorts";
import { AgentDiffSection } from "./AgentDiffSection";
import { FinalResultsSection } from "./FinalResultsSection";
import { LAP_PAGE, LapPanel, LoopStats } from "./LapViews";
import { LoopStatus } from "./LoopListTab";
import { ResultsSection } from "./ResultsSection";
import { SetupCard } from "./SetupCard";
import { useLoop, type LoopData } from "./useLoop";

// One loop. Post-MVP reads it the way the kitaru-loop skill scores it: mean
// pass^k per lap, the gate on each lap's selection trials, and confirmation on
// fresh trials. MVP shows the setup card of the loop, then the same laps in
// three sections: Results, Final results, and Agent diff.
export function LoopPage() {
  const { agentId = "", slug = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lapLimit, setLapLimit] = useState(LAP_PAGE);
  const preview = useEmptyPreview().on;
  const real = useLoop(agentId, slug, { lapLimit });
  const loop = preview ? { ...real, laps: [], totalLaps: 0, running: false, winnerLap: null, isLoading: false } : real;
  const [selected, setSelected] = useState<number[]>([]);

  const c = loop.settings?.criteria ?? null;
  const mvp = useLoopMode() === "mvp";
  // A loop that ran with the full rules, looked at in the MVP view.
  const fullRules = !!c && (c.trials_per_round > 1 || c.k > 1);
  const completed = loop.totalLaps > 0 && loop.outcome.kind === "completed" ? loop.outcome : null;

  function toggle(lap: number) {
    setSelected((cur) => (cur.includes(lap) ? cur.filter((x) => x !== lap) : [...cur, lap]).sort((a, b) => a - b));
  }
  const lapPanel = { loop, selected, onToggle: toggle, onCompare: () => navigate(`compare?laps=${selected.join(",")}`), onShowOlder: () => setLapLimit(lapLimit + LAP_PAGE) };

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop`)}>
          <ArrowLeft size={14} aria-hidden />
          Loops
        </button>
        <div className="detail-title-row">
          <div className="detail-title-block">
            <div className="title-with-status">
              <h2 className="detail-title">{slug}</h2>
              {loop.totalLaps > 0 && (!loop.isLoading || loop.outcome.kind !== "running") ? <LoopStatus outcome={loop.outcome} /> : null}
            </div>
            {/* In the MVP view, the setup card shows the hypothesis. */}
            {loop.hypothesis && !mvp ? <p className="detail-description">{loop.hypothesis}</p> : null}
          </div>
          <div className="toolbar-right">
            <LoopModeToggle />
            <Button variant="outline" icon={RefreshCw} onClick={() => queryClient.invalidateQueries()}>
              Refresh
            </Button>
          </div>
        </div>
        {c && !mvp ? <CriteriaLine c={c} changes={loop.settings!.allowed_changes.map((f) => CHANGE_FIELD_LABELS[f] ?? f)} /> : null}
        {mvp && fullRules && c ? (
          <p className="field-hint">
            This loop ran with the Post-MVP rules ({c.trials_per_round} runs per experiment, pass^{c.k}). The Results table shows each completed run. Final results uses the first completed run of each experiment.
          </p>
        ) : null}
      </div>

      {!mvp && completed ? (
        <Alert variant={completed.passed ? "success" : "neutral"} title={completed.title}>
          {completed.detail}
        </Alert>
      ) : null}

      {loop.error ? (
        <Alert variant="destructive" title="Could not load this loop">
          {loop.error.message}
        </Alert>
      ) : null}

      {!loop.isLoading && loop.totalLaps > 0 && !c && !loop.isEvalveLoop && loop.outcome.kind !== "completed" ? (
        <Alert variant="warning" title="This loop's rules aren't on the server">
          The dashboard needs the "Loop settings" line of the control experiment to calculate pass^k and apply the stop rules. The project's kitaru-loop.json has the rules.
        </Alert>
      ) : null}

      {!loop.isLoading && loop.totalLaps === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No experiments yet</p>
          <p className="empty-text">
            Experiments appear here once the kitaru-loop skill creates <span className="mono">{slug}-round-0</span>.
          </p>
        </div>
      ) : null}

      {mvp && loop.totalLaps > 0 ? <LoopSetupCard agentId={agentId} loop={loop} /> : null}

      {loop.laps.length > 0 && mvp ? (
        <>
          <ResultsSection loop={loop} onShowOlder={lapPanel.onShowOlder} />
          <FinalResultsSection loop={loop} />
          <AgentDiffSection loop={loop} />
        </>
      ) : null}

      {loop.laps.length > 0 && !mvp ? (
        <>
          <LapPanel {...lapPanel} />
          <LoopStats loop={loop} />
        </>
      ) : null}
    </div>
  );
}

// The read-only setup card of the loop. It gets the name and the version of
// the cohort from the cohorts of the agent.
function LoopSetupCard({ agentId, loop }: { agentId: string; loop: LoopData }) {
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const cohort = findSetupCohort(cohorts.data ?? [], versionsByCohort, loop.cohortVersionId);
  return <SetupCard fields={setupFields({ slug: loop.slug, hypothesis: loop.hypothesis, evalve: loop.evalveSetup, settings: loop.settings, cohort })} />;
}

// The rules of the loop as a row of chips, in the Post-MVP view.
function CriteriaLine({ c, changes }: { c: Criteria; changes: string[] }) {
  const items = [
    `${c.trials_per_round} trials per experiment`,
    `pass^${c.k}`,
    c.per_case_floor === "strict" ? "floor: no misses" : "floor: one miss allowed",
    `cohort target ${c.cohort_target_mean_pass_k}`,
    c.no_regression ? "no regression vs the control" : null,
    c.confirmation_round ? "confirmed on fresh trials" : null,
    `max ${c.max_rounds} experiments after the control`,
    c.plateau_patience != null ? `plateau patience ${c.plateau_patience}` : null,
    c.budget_usd != null ? `budget $${c.budget_usd}` : null,
    `may change: ${changes.join(", ").toLowerCase()}`,
  ].filter(Boolean);
  return (
    <div className="criteria-line" aria-label="Loop rules">
      {items.map((t) => (
        <span key={t} className="criteria-chip">
          {t}
        </span>
      ))}
    </div>
  );
}
