import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat2 } from "lucide-react";
import { listExperiments } from "../../../api/client";
import { Alert, Button, StatusLabel } from "../../../design-system/components";
import { formatPercent, formatRelative } from "../../../lib/format";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { LoopModeToggle, useLoopMode } from "../../../lib/loopMode";
import { passRate } from "../../../lib/loopRules";
import { CHANGE_FIELD_LABELS, groupLoops } from "../../../lib/loops";
import { useLoop, type Lap, type LoopOutcome } from "./useLoop";

// Every loop for this agent. A loop is the experiments the kitaru-loop skill
// named `<prefix>-round-N`, or `<prefix>-iteration-N` from 1 (docs/loop-contract.md).
export function LoopListTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  const preview = useEmptyPreview().on;
  const mvp = useLoopMode() === "mvp";
  const slugs = useMemo(() => {
    const loops = groupLoops(experiments.data ?? []);
    const newest = (s: string) => Math.max(...loops.get(s)!.map((l) => Date.parse(l.experiment.created)));
    return preview ? [] : [...loops.keys()].sort((a, b) => newest(b) - newest(a));
  }, [experiments.data, preview]);

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="toolbar-intro">
            {mvp ? "Change one thing per lap, replay the cohort, and stop when the pass rate reaches your target." : "Change one thing per lap, replay the cohort several times, and stop only when the result holds up on fresh trials."}
          </p>
        </div>
        <div className="toolbar-right">
          <LoopModeToggle />
          <Button variant="outline" icon={RefreshCw} onClick={() => experiments.refetch()} disabled={experiments.isFetching}>
            Refresh
          </Button>
          <Button icon={Plus} onClick={() => navigate("new")}>
            New loop
          </Button>
        </div>
      </div>

      {experiments.isError ? (
        <Alert variant="destructive" title="Could not load loops">
          {experiments.error.message}
        </Alert>
      ) : null}

      {experiments.isSuccess && slugs.length === 0 ? (
        <div className="empty-state">
          <Repeat2 size={24} aria-hidden />
          <p className="empty-title">No loops yet</p>
          <p className="empty-text">Set the cohort, what may change and when to stop. Your coding agent runs the laps with the kitaru-loop skill and they show up here.</p>
          <Button variant="outline" icon={Plus} onClick={() => navigate("new")}>
            New loop
          </Button>
        </div>
      ) : null}

      {slugs.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="fill">Loop</th>
                <th>Status</th>
                <th className="num">Laps</th>
                <th>{mvp ? "Pass rate, baseline → best" : "Mean pass^k, baseline → best"}</th>
                <th>May change</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {slugs.map((slug) => (
                <LoopRow key={slug} agentId={agentId} slug={slug} mvp={mvp} onOpen={() => navigate(slug)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function LoopRow({ agentId, slug, mvp, onOpen }: { agentId: string; slug: string; mvp: boolean; onOpen: () => void }) {
  const loop = useLoop(agentId, slug, { lapLimit: 20 });
  const score = (l: Lap) => (mvp ? passRate(l.cases) : l.meanPassK);
  const show = (v: number) => (mvp ? formatPercent(v) : v.toFixed(2));
  const lap0 = loop.laps.find((l) => l.lap === 0);
  const base = lap0 ? score(lap0) : null;
  const best = loop.laps.reduce<number | null>((m, l) => {
    const v = score(l);
    return v != null && (m == null || v > m) ? v : m;
  }, null);
  const last = loop.laps[loop.laps.length - 1];
  const lastRun = last?.runs[last.runs.length - 1];

  return (
    <tr className="clickable-row" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <td className="fill shrink">
        <div className="exp-cell">
          <span className="exp-name">{slug}</span>
          {loop.hypothesis ? <span className="exp-desc">{loop.hypothesis}</span> : null}
        </div>
      </td>
      <td>{loop.isLoading ? <span className="muted">…</span> : <LoopStatus outcome={loop.outcome} />}</td>
      <td className="num mono">{Math.max(loop.totalLaps - 1, 0)}</td>
      <td>
        {base != null && best != null ? (
          <span className="rate-pair">
            <span className="mono">{show(base)}</span>
            <span className="muted">→</span>
            <span className="mono">{show(best)}</span>
          </span>
        ) : (
          <span className="muted">{loop.isLoading ? "…" : "—"}</span>
        )}
      </td>
      <td>
        {loop.settings ? (
          <span className="chip-row">
            {loop.settings.allowed_changes.map((f) => (
              <span key={f} className="change-chip">
                {CHANGE_FIELD_LABELS[f] ?? f}
              </span>
            ))}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="muted">{last ? formatRelative(lastRun?.created ?? last.experiment.created) : "—"}</td>
    </tr>
  );
}

export function LoopStatus({ outcome }: { outcome: LoopOutcome }) {
  if (outcome.kind === "running") return <StatusLabel status="Running" />;
  if (outcome.kind === "completed") return <StatusLabel status="Completed" tone={outcome.passed ? "success" : "muted"} />;
  return (
    <span className="loop-status" title={outcome.why}>
      <StatusLabel status="Stopped">Stopped early</StatusLabel>
    </span>
  );
}
