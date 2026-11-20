import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ChevronDown, FlaskConical, RefreshCw, Search } from "lucide-react";
import { listExperimentRuns, listExperiments, type Experiment, type ExperimentRun } from "../../api/client";
import { Alert, Button, StatusLabel } from "../../design-system/components";
import { formatCost, formatDateTime, formatPercent, formatRelative } from "../../lib/format";
import { changedFields } from "../../lib/experiments";
import { controlExperiments, experimentLabels, labelMatches } from "../../lib/experimentLabels";
import { CONTROL_DELTA_TITLE, controlDeltaPoints, COST_NOT_LOADED, REPLAY_COST_TITLE, REPLAY_LIMIT_TITLE, replayLimitNote, runOverview, runsByExperiment, runsSpread, totalCost, type RunOverview } from "../../lib/experimentRuns";
import { runStatus } from "../../lib/loopResults";
import { runAggregatesQuery } from "../../lib/runAggregatesQuery";
import { runCostQuery } from "../../lib/runCostQuery";
import { Delta, PassRate } from "./PassRate";
import { useEmptyPreview } from "../../lib/emptyPreview";

const COLUMNS = 7;

// Experiments for one agent: what each one changes and how its runs did.
// - An experiment of a Loop shows the Loop and its number as the name (see experimentLabels.ts).
// - "Latest result" is the pass rate of the latest run: the cases that passed
//   every evaluator, with the evaluators that failed a case under it. The
//   change next to it is from the recorded sessions, or for an experiment of a
//   Loop from the control experiment of the Loop. An experiment with several
//   runs also shows the range of its runs.
// - "Replay cost" is the cost of each run of the experiment together.
// - "Show runs" opens an experiment in the list: one line for each of its runs.
// API: GET /experiments?filter=agent_id, GET /experiment-runs?filter=experiment_id in [...],
// and for each run that is not running, its results (see runAggregatesQuery.ts)
// and its cost (see runCostQuery.ts).
export function ExperimentsTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  // The ids of the experiments whose runs show.
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => setOpen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  const ids = useMemo(() => experiments.data?.map((e) => e.id) ?? [], [experiments.data]);
  const runs = useQuery({
    queryKey: ["experiment-runs", ids],
    queryFn: () => listExperimentRuns(ids),
    enabled: ids.length > 0,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });

  const labels = useMemo(() => experimentLabels(experiments.data ?? []), [experiments.data]);
  const controls = useMemo(() => controlExperiments(labels), [labels]);
  // The runs of each experiment, oldest first. The last one is the latest run.
  const runsOf = useMemo(() => runsByExperiment(runs.data ?? []), [runs.data]);
  const finishedRuns = useMemo(() => (runs.data ?? []).filter((r) => r.status !== "running"), [runs.data]);

  const aggs = useQueries({ queries: finishedRuns.map((run) => runAggregatesQuery(run)) });
  const overviews = new Map<string, RunOverview>();
  finishedRuns.forEach((run, i) => {
    const d = aggs[i]?.data;
    if (d) overviews.set(run.id, runOverview(d));
  });

  const costQueries = useQueries({ queries: finishedRuns.map((run) => runCostQuery(run)) });
  // Per run: its cost, or null when it has none. No entry while the cost
  // loads, and none when the request failed: `costFailed` has that run.
  const costs = new Map<string, string | null>();
  const costFailed = new Set<string>();
  finishedRuns.forEach((run, i) => {
    const q = costQueries[i];
    if (q?.isSuccess) costs.set(run.id, q.data ?? null);
    else if (q?.isError) costFailed.add(run.id);
  });

  const preview = useEmptyPreview().on;
  const latestCreated = (e: Experiment) => runsOf.get(e.id)?.at(-1)?.created ?? e.created;
  const list = (preview ? [] : (experiments.data ?? []))
    .filter((e) => labelMatches(labels.get(e.id)!, e, search))
    .sort((a, b) => latestCreated(b).localeCompare(latestCreated(a)));

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
                <th title="The cases that passed every evaluator in the latest run">Latest result</th>
                <th className="num" title={REPLAY_COST_TITLE}>
                  Replay cost
                </th>
                <th>Last run</th>
                <th aria-label="Runs of the experiment" />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const label = labels.get(e.id)!;
                const experimentRuns = runsOf.get(e.id) ?? [];
                const latest = experimentRuns.at(-1);
                const latestOverview = latest ? overviews.get(latest.id) : undefined;
                // An experiment of a Loop compares with the latest run of the control experiment of its Loop.
                const controlId = label.loop != null && label.lap !== 0 ? controls.get(label.loop) : undefined;
                const controlRun = controlId ? runsOf.get(controlId)?.filter((r) => r.status !== "running").at(-1) : undefined;
                const controlPoints = latestOverview && controlRun ? controlDeltaPoints(latestOverview, overviews.get(controlRun.id)) : null;
                const finished = experimentRuns.filter((r) => r.status !== "running");
                const loaded = finished.flatMap((r) => overviews.get(r.id) ?? []);
                // The range needs each finished run. With one still loading, it would be wrong.
                const spread = loaded.length === finished.length ? runsSpread(loaded) : null;
                const costsLoaded = finished.every((r) => costs.has(r.id));
                // A total without one of the runs would be too low, so one failed request means no total.
                const costMissing = finished.some((r) => costFailed.has(r.id));
                const isOpen = experimentRuns.length > 0 && open.includes(e.id);
                const runsId = `experiment-${e.id}-runs`;
                return (
                  <Fragment key={e.id}>
                    <tr className="clickable-row" tabIndex={0} onClick={() => navigate(e.id)} onKeyDown={(ev) => ev.key === "Enter" && navigate(e.id)}>
                      <td className="fill shrink">
                        <div className="exp-cell">
                          <span className="exp-name" title={label.kitaruName}>
                            {label.name}
                          </span>
                          {label.description ? <span className="exp-desc">{label.description}</span> : null}
                        </div>
                      </td>
                      <td>
                        <ChangeChips experiment={e} />
                      </td>
                      <td className="num mono">{experimentRuns.length}</td>
                      <td>
                        {latest && latest.status === "running" ? (
                          <span className="muted">Running…</span>
                        ) : latestOverview ? (
                          <LatestResult overview={latestOverview} spread={spread} controlPoints={controlPoints} limitNote={replayLimitNote(latestOverview.cases, latest?.progress.total)} />
                        ) : (
                          <span className="muted">{latest ? "…" : "Never run"}</span>
                        )}
                      </td>
                      <td className="num mono">
                        {finished.length === 0 ? (
                          "—"
                        ) : costMissing ? (
                          <span className="muted" title="The cost of a run could not be loaded, so there is no total">
                            {COST_NOT_LOADED}
                          </span>
                        ) : costsLoaded ? (
                          formatCost(totalCost(finished.map((r) => costs.get(r.id))))
                        ) : (
                          <span className="muted">…</span>
                        )}
                      </td>
                      <td className="muted" title={formatDateTime(latest?.created)}>
                        {latest ? formatRelative(latest.created) : "—"}
                      </td>
                      <td>
                        {experimentRuns.length > 0 ? (
                          <button
                            type="button"
                            className="text-button rs-toggle"
                            aria-expanded={isOpen}
                            aria-controls={runsId}
                            aria-label={`${isOpen ? "Hide" : "Show"} runs of ${label.name}`}
                            onClick={(ev) => {
                              // The row opens the experiment page. The button only opens the runs.
                              ev.stopPropagation();
                              toggle(e.id);
                            }}
                            onKeyDown={(ev) => ev.stopPropagation()}
                          >
                            {isOpen ? "Hide runs" : "Show runs"}
                            <ChevronDown size={14} aria-hidden className={isOpen ? "chev open" : "chev"} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr id={runsId} className="exp-runs-row">
                        <td colSpan={COLUMNS}>
                          <div className="exp-runs">
                            {experimentRuns.map((run) => (
                              <RunLine key={run.id} experimentId={e.id} run={run} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// The result of the latest run in one cell: the pass rate of the run and the
// change from the recorded sessions, then the evaluators that failed a case,
// then the range of the runs when the experiment has several. A run with no
// scores for the recorded sessions shows `controlPoints` when it has them:
// the change from the control experiment of its Loop. `limitNote` is for a
// run with more replays than the dashboard loads.
function LatestResult({ overview, spread, controlPoints, limitNote }: { overview: RunOverview; spread: string | null; controlPoints: number | null; limitNote: string | null }) {
  if (overview.rate == null) return <span className="muted">No results</span>;
  return (
    <div className="latest-result stacked" title={overview.summary ?? undefined}>
      <span className="pass-rate compact">
        <span className="pass-rate-bar" aria-hidden>
          <span style={{ width: `${overview.rate * 100}%` }} />
        </span>
        <span className="latest-rate">{formatPercent(overview.rate)}</span>
        <span className="pass-rate-count mono muted">
          {overview.passed}/{overview.cases}
        </span>
        {overview.deltaPoints != null ? <Delta points={overview.deltaPoints} /> : controlPoints != null ? <Delta points={controlPoints} versus="vs control" title={CONTROL_DELTA_TITLE} /> : null}
      </span>
      <span className="muted small">{overview.failures}</span>
      {spread ? <span className="muted small">{spread}</span> : null}
      {limitNote ? (
        <span className="muted small" title={REPLAY_LIMIT_TITLE}>
          {limitNote}
        </span>
      ) : null}
    </div>
  );
}

// One run of an open experiment: a link to the run, its status, its cost, and
// its results: the cases that passed every evaluator, then each evaluator.
function RunLine({ experimentId, run }: { experimentId: string; run: ExperimentRun }) {
  const running = run.status === "running";
  const aggregates = useQuery({ ...runAggregatesQuery(run), enabled: !running });
  const cost = useQuery({ ...runCostQuery(run), enabled: !running });
  const overview = aggregates.data ? runOverview(aggregates.data) : null;
  const limitNote = overview ? replayLimitNote(overview.cases, run.progress.total) : null;
  const when = run.ended_at ?? run.created;
  return (
    <div className="exp-run">
      <Link to={`${experimentId}?run=${run.number}`} className="inline-link exp-run-name">
        Run #{run.number}
      </Link>
      <StatusLabel status={runStatus(run.status)} />
      <span className="muted" title={formatDateTime(when)}>
        {formatRelative(when)}
      </span>
      <span className="mono muted" title={REPLAY_COST_TITLE}>
        {running || cost.isPending ? "…" : cost.isError ? COST_NOT_LOADED : formatCost(cost.data)}
      </span>
      <div className="exp-run-results">
        {running ? (
          <span className="muted">Running…</span>
        ) : aggregates.isError ? (
          <span className="muted">Could not load the results of this run</span>
        ) : !overview ? (
          <span className="muted">…</span>
        ) : overview.evaluators.length === 0 ? (
          <span className="muted">No results</span>
        ) : (
          <>
            {overview.summary ? <span className="exp-run-overall">{overview.summary}</span> : null}
            {limitNote ? (
              <span className="muted" title={REPLAY_LIMIT_TITLE}>
                {limitNote}
              </span>
            ) : null}
            <span className="exp-run-evaluators">
              {overview.evaluators.map((ev) => (
                <span key={ev.aggregate.name} className="exp-run-evaluator">
                  <span className="mono">{ev.name}</span>
                  <PassRate aggregate={ev.aggregate} compact />
                </span>
              ))}
            </span>
          </>
        )}
      </div>
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
