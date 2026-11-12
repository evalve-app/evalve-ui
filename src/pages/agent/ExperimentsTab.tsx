import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { FlaskConical, RefreshCw, Search } from "lucide-react";
import { getRunAggregates, listExperimentRuns, listExperiments, type EvalAggregate, type Experiment, type ExperimentRun } from "../../api/client";
import { Alert, Button } from "../../design-system/components";
import { formatDateTime, formatRelative } from "../../lib/format";
import { changedFields } from "../../lib/experiments";
import { PassRate } from "./PassRate";
import { useEmptyPreview } from "../../lib/emptyPreview";

// Experiments for one agent: what each one changes and how its latest run did.
// API: GET /experiments?filter=agent_id, GET /experiment-runs?filter=experiment_id in [...],
// and the latest run's /ui/experiment-runs/{id}/evaluation-aggregates.
export function ExperimentsTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  const ids = useMemo(() => experiments.data?.map((e) => e.id) ?? [], [experiments.data]);
  const runs = useQuery({
    queryKey: ["experiment-runs", ids],
    queryFn: () => listExperimentRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });

  // Newest run per experiment.
  const latest = useMemo(() => {
    const m = new Map<string, { run: ExperimentRun; count: number }>();
    for (const r of runs.data ?? []) {
      const cur = m.get(r.experiment_id);
      if (!cur) m.set(r.experiment_id, { run: r, count: 1 });
      else cur.count += 1;
    }
    return m;
  }, [runs.data]);

  const latestRunIds = [...latest.values()].map((v) => v.run.id);
  const aggs = useQueries({
    queries: latestRunIds.map((id) => ({ queryKey: ["aggregates", id], queryFn: () => getRunAggregates(id) })),
  });
  const aggByRun = new Map<string, EvalAggregate[]>();
  latestRunIds.forEach((id, i) => {
    const d = aggs[i]?.data;
    if (d) aggByRun.set(id, d);
  });

  const term = search.trim().toLowerCase();
  const preview = useEmptyPreview().on;
  const list = (preview ? [] : (experiments.data ?? []))
    .filter((e) => !term || e.name.toLowerCase().includes(term) || (e.description ?? "").toLowerCase().includes(term))
    .sort((a, b) => (latest.get(b.id)?.run.created ?? b.created).localeCompare(latest.get(a.id)?.run.created ?? a.created));

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <label className="search-field">
            <Search size={16} aria-hidden className="search-icon" />
            <input
              className="ev-input search-input"
              type="search"
              placeholder="Search experiments"
              aria-label="Search experiments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="toolbar-right">
          <Button
            variant="outline"
            icon={RefreshCw}
            onClick={() => {
              experiments.refetch();
              runs.refetch();
            }}
            disabled={experiments.isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>

      {experiments.isError ? (
        <Alert variant="destructive" title="Could not load experiments">
          {experiments.error.message}
        </Alert>
      ) : null}

      {experiments.isSuccess && (preview || experiments.data.length === 0) ? (
        <div className="empty-state">
          <FlaskConical size={24} aria-hidden />
          <p className="empty-title">No experiments yet</p>
          <p className="empty-text">An experiment replays a cohort of sessions with one change, then scores the results.</p>
        </div>
      ) : null}

      {list.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="fill">Experiment</th>
                <th>Changes</th>
                <th className="num">Runs</th>
                <th>Latest result</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const l = latest.get(e.id);
                const agg = l ? aggByRun.get(l.run.id)?.[0] : undefined;
                const more = l ? (aggByRun.get(l.run.id)?.length ?? 0) - 1 : 0;
                return (
                  <tr
                    key={e.id}
                    className="clickable-row"
                    tabIndex={0}
                    onClick={() => navigate(e.id)}
                    onKeyDown={(ev) => ev.key === "Enter" && navigate(e.id)}
                  >
                    <td className="fill shrink">
                      <div className="exp-cell">
                        <span className="exp-name" title={e.name}>{e.name}</span>
                        {e.description ? <span className="exp-desc">{e.description}</span> : null}
                      </div>
                    </td>
                    <td>
                      <ChangeChips experiment={e} />
                    </td>
                    <td className="num mono">{l?.count ?? 0}</td>
                    <td>
                      {l && l.run.status === "running" ? (
                        <span className="muted">Running…</span>
                      ) : agg ? (
                        <div className="latest-result">
                          <PassRate aggregate={agg} compact />
                          {more > 0 ? <span className="muted small">+{more} more</span> : null}
                        </div>
                      ) : (
                        <span className="muted">{l ? "…" : "Never run"}</span>
                      )}
                    </td>
                    <td className="muted" title={formatDateTime(l?.run.created)}>
                      {l ? formatRelative(l.run.created) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ChangeChips({ experiment }: { experiment: Experiment }) {
  const fields = changedFields(experiment.override);
  if (fields.length === 0) return <span className="muted">Baseline, no changes</span>;
  return (
    <span className="chip-row">
      {fields.map((f) => (
        <span key={f.key} className="change-chip">
          {f.label}
        </span>
      ))}
    </span>
  );
}
