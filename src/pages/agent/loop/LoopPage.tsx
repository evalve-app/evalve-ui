import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Alert, Button } from "../../../design-system/components";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { formatPercent } from "../../../lib/format";
import { LoopModeToggle, useLoopMode } from "../../../lib/loopMode";
import { CHANGE_FIELD_LABELS, type Criteria } from "../../../lib/loops";
import { AgentDiffSection } from "./AgentDiffSection";
import { FinalResultsSection } from "./FinalResultsSection";
import { LAP_PAGE, LapPanel, LoopStats } from "./LapViews";
import { LoopStatus } from "./LoopListTab";
import { ResultsSection } from "./ResultsSection";
import { useLoop } from "./useLoop";

// One loop. Post-MVP reads it the way the kitaru-loop skill scores it: mean
// pass^k per lap, the gate on each lap's selection trials, and confirmation on
// fresh trials. MVP shows the same laps in three sections: Results, Final
// results, and Agent diff.
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
            {loop.hypothesis ? <p className="detail-description">{loop.hypothesis}</p> : null}
          </div>
          <div className="toolbar-right">
            <LoopModeToggle />
            <Button variant="outline" icon={RefreshCw} onClick={() => queryClient.invalidateQueries()}>
              Refresh
            </Button>
          </div>
        </div>
        {c ? <CriteriaLine c={c} mvp={mvp} changes={loop.settings!.allowed_changes.map((f) => CHANGE_FIELD_LABELS[f] ?? f)} /> : null}
        {mvp && fullRules && c ? (
          <p className="field-hint">
            This loop ran with the Post-MVP rules ({c.trials_per_round} trials per lap, pass^{c.k}). The MVP view shows its plain pass rate across those runs.
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
          The dashboard needs the baseline lap's "Loop settings" line to calculate pass^k and apply the stop rules. The project's kitaru-loop.json has the rules.
        </Alert>
      ) : null}

      {!loop.isLoading && loop.totalLaps === 0 ? (
        <div className="empty-state">
          <p className="empty-title">No laps yet</p>
          <p className="empty-text">
            Laps appear here once the kitaru-loop skill creates <span className="mono">{slug}-round-0</span>.
          </p>
        </div>
      ) : null}

      {loop.laps.length > 0 && mvp ? (
        <>
          <ResultsSection {...lapPanel} />
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

function CriteriaLine({ c, changes, mvp }: { c: Criteria; changes: string[]; mvp: boolean }) {
  const simple = [
    `${c.trials_per_round} ${c.trials_per_round === 1 ? "run" : "runs"} per lap`,
    c.k === 1 ? `target ${formatPercent(c.cohort_target_mean_pass_k)} pass rate` : null,
    c.no_regression ? "no case may get worse" : null,
    `max ${c.max_rounds} laps`,
    c.plateau_patience != null ? `stops after ${c.plateau_patience} laps without improvement` : null,
    c.budget_usd != null ? `budget $${c.budget_usd}` : null,
    `may change: ${changes.join(", ").toLowerCase()}`,
  ];
  const full = [
    `${c.trials_per_round} trials per lap`,
    `pass^${c.k}`,
    c.per_case_floor === "strict" ? "floor: no misses" : "floor: one miss allowed",
    `cohort target ${c.cohort_target_mean_pass_k}`,
    c.no_regression ? "no regression vs lap 0" : null,
    c.confirmation_round ? "confirmed on fresh trials" : null,
    `max ${c.max_rounds} laps`,
    c.plateau_patience != null ? `plateau patience ${c.plateau_patience}` : null,
    c.budget_usd != null ? `budget $${c.budget_usd}` : null,
    `may change: ${changes.join(", ").toLowerCase()}`,
  ];
  const items = (mvp ? simple : full).filter(Boolean);
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
