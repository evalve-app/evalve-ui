import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Play, RefreshCw } from "lucide-react";
import {
  getExperiment,
  getRunAggregates,
  listAgentVersions,
  listCohortSessions,
  listExperimentRuns,
  listRunReplays,
  startExperimentRun,
  type EvalAggregate,
  type Experiment,
  type ExperimentRun,
} from "../../api/client";
import { Alert, Button, StatusLabel } from "../../design-system/components";
import { versionLabel } from "../../lib/cohorts";
import { useCohorts } from "../../lib/useCohorts";
import { formatDateTime, formatDuration, formatRelative, formatTime } from "../../lib/format";
import { caseName, changedFields, passCounts, toolPolicyLabel } from "../../lib/experiments";
import { Delta } from "./PassRate";

// One experiment: its runs on the left, the selected run's results on the right.
// This page is what the Loop's results view builds on: one lap = one run.
export function ExperimentPage() {
  const { agentId = "", experimentId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const experiment = useQuery({ queryKey: ["experiment", experimentId], queryFn: () => getExperiment(experimentId) });
  const runs = useQuery({
    queryKey: ["experiment-runs", [experimentId]],
    queryFn: () => listExperimentRuns([experimentId]),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });

  const runNumber = Number(params.get("run")) || runs.data?.[0]?.number;
  const run = runs.data?.find((r) => r.number === runNumber) ?? runs.data?.[0];

  // Pass counts for every run in the list (one small request per run).
  const runAggs = useQueries({
    queries: (runs.data ?? []).map((r) => ({
      queryKey: ["aggregates", r.id, r.status],
      queryFn: () => getRunAggregates(r.id),
      enabled: r.status !== "running",
    })),
  });

  const rerun = useMutation({
    mutationFn: () => startExperimentRun(experimentId, run!.cohort_version_id, run!.agent_version_id),
    onSuccess: async (newRun) => {
      await queryClient.invalidateQueries({ queryKey: ["experiment-runs"] });
      setParams({ run: String(newRun.number) });
    },
  });

  if (experiment.isError) {
    return (
      <Alert variant="destructive" title="Could not load this experiment">
        {experiment.error.message}
      </Alert>
    );
  }

  const exp = experiment.data;

  return (
    <div className="tab-page">
      <div className="detail-header">
        <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/experiments`)}>
          <ArrowLeft size={14} aria-hidden />
          Experiments
        </button>
        <div className="detail-title-row">
          <div className="detail-title-block">
            <h2 className="detail-title">{exp?.name ?? " "}</h2>
            {exp?.description ? <Description text={exp.description} /> : null}
          </div>
          <div className="toolbar-right">
            <Button
              variant="outline"
              icon={RefreshCw}
              onClick={() => {
                experiment.refetch();
                runs.refetch();
              }}
            >
              Refresh
            </Button>
            <Button icon={Play} onClick={() => rerun.mutate()} disabled={!run || rerun.isPending} title="Replays every session in the cohort again with this experiment's changes">
              {rerun.isPending ? "Starting" : "Run again"}
            </Button>
          </div>
        </div>
        {rerun.isError ? (
          <Alert variant="destructive" title="Could not start a run">
            {rerun.error.message}
          </Alert>
        ) : null}
      </div>

      <div className="experiment-layout">
        <aside className="run-list" aria-label="Runs">
          <div className="run-list-head">
            Runs <span className="count-chip">{runs.data?.length ?? 0}</span>
          </div>
          {runs.data?.map((r, i) => {
            const agg = runAggs[i]?.data?.[0];
            const c = agg ? passCounts(agg) : null;
            const active = r.id === run?.id;
            return (
              <button
                key={r.id}
                type="button"
                className={active ? "run-item active" : "run-item"}
                aria-current={active ? "true" : undefined}
                onClick={() => setParams({ run: String(r.number) })}
              >
                <span className="run-item-top">
                  <span className="run-item-name">Run #{r.number}</span>
                  {c ? (
                    <span className={c.resultPassed === c.total ? "mono run-item-score perfect" : "mono run-item-score"}>
                      {c.resultPassed}/{c.total}
                    </span>
                  ) : r.status === "running" ? (
                    <span className="muted small">Running</span>
                  ) : null}
                </span>
                <span className="run-item-meta" title={formatRelative(r.created)}>{formatTime(r.created)}</span>
              </button>
            );
          })}
        </aside>

        <section className="run-detail">
          {run && exp ? <RunDetail agentId={agentId} experiment={exp} run={run} /> : <div className="skeleton-block" />}
        </section>
      </div>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 180;
  return (
    <p className="detail-description">
      {open || !long ? text : `${text.slice(0, 180).trimEnd()}… `}
      {long ? (
        <button type="button" className="text-button" onClick={() => setOpen(!open)}>
          {open ? " Show less" : "Show more"}
        </button>
      ) : null}
    </p>
  );
}

function RunDetail({ agentId, experiment, run }: { agentId: string; experiment: Experiment; run: ExperimentRun }) {
  const running = run.status === "running";
  const aggregates = useQuery({
    queryKey: ["aggregates", run.id, run.status],
    queryFn: () => getRunAggregates(run.id),
    refetchInterval: running ? 3000 : false,
  });
  const replays = useQuery({ queryKey: ["replays", run.id, run.status], queryFn: () => listRunReplays(run.id) });
  const baseline = useQuery({ queryKey: ["cohort-sessions", run.cohort_version_id], queryFn: () => listCohortSessions(run.cohort_version_id) });
  const cohortLabel = useCohortVersionLabel(agentId, run.cohort_version_id);
  const versions = useQuery({ queryKey: ["versions", agentId], queryFn: () => listAgentVersions(agentId) });
  const agentVersion = versions.data?.find((v) => v.id === run.agent_version_id);

  // replay id → case name and session numbers, so the grid can label cases.
  const cases = useMemo(() => {
    const byBaseline = new Map((baseline.data ?? []).map((s) => [s.session.id, s.session]));
    const m = new Map<string, CaseRef>();
    for (const r of replays.data ?? []) {
      const b = byBaseline.get(r.baseline_session_id ?? "");
      m.set(r.id, { name: caseName(b?.name) || `#${b?.number ?? "?"}`, order: b?.number ?? 0, recordedSessionId: r.baseline_session_id ?? null, resultSessionId: r.result_session_id ?? null });
    }
    return m;
  }, [replays.data, baseline.data]);

  const p = run.progress;

  return (
    <div className="run-detail-stack">
      <div className="run-head">
        <div className="run-head-title">
          <h3>Run #{run.number}</h3>
          <StatusLabel status={runStatusWord(run.status)} />
        </div>
        <dl className="run-meta">
          <div>
            <dt>Cohort</dt>
            <dd>{cohortLabel}</dd>
          </div>
          <div>
            <dt>Agent</dt>
            <dd className="mono">{agentVersion ? `v${agentVersion.display_version ?? agentVersion.version}` : "—"}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd className="mono">{formatDuration(run.started_at, run.ended_at)}</dd>
          </div>
          <div>
            <dt>{running ? "Started" : "Finished"}</dt>
            <dd>{formatDateTime(running ? run.started_at : run.ended_at)}</dd>
          </div>
        </dl>
      </div>

      {running && p ? (
        <div className="progress-card">
          <div className="progress-text">
            Replaying sessions: {p.completed + p.failed} of {p.total} done
          </div>
          <div className="progress-bar" aria-hidden>
            <span style={{ width: `${p.total ? ((p.completed + p.failed) / p.total) * 100 : 0}%` }} />
          </div>
        </div>
      ) : null}

      {aggregates.data?.map((agg) => <ResultCard key={agg.name} aggregate={agg} cases={cases} />)}
      {aggregates.isError ? (
        <Alert variant="destructive" title="Could not load results">
          {aggregates.error.message}
        </Alert>
      ) : null}

      <ConfigCard experiment={experiment} />
    </div>
  );
}

// A case in a run: its name, its recorded session, and the replay's result session.
type CaseRef = { name: string; order: number; recordedSessionId: string | null; resultSessionId: string | null };

// One cell of the case grid. It opens its session when there is one.
function GridCell({ passed, sessionId, title }: { passed: boolean; sessionId: string | null; title: string }) {
  const square = <span className={passed ? "cell pass" : "cell fail"} />;
  if (!sessionId) return <span className={passed ? "cell pass" : "cell fail"} title={`${title}. No session to open`} />;
  return (
    <Link to={`/sessions/${sessionId}`} className="cell-hit" title={title} aria-label={`${title}. Open session`}>
      {square}
    </Link>
  );
}

function ResultCard({ aggregate, cases }: { aggregate: EvalAggregate; cases: Map<string, CaseRef> }) {
  const { total, resultPassed, baselinePassed } = passCounts(aggregate);
  const delta = total ? Math.round(((resultPassed - baselinePassed) / total) * 100) : 0;

  const rows = (aggregate.replays ?? [])
    .map((r) => ({
      id: r.replay_id,
      name: cases.get(r.replay_id)?.name ?? "…",
      order: cases.get(r.replay_id)?.order ?? 0,
      recordedSessionId: cases.get(r.replay_id)?.recordedSessionId ?? null,
      resultSessionId: cases.get(r.replay_id)?.resultSessionId ?? null,
      before: !!r.baseline?.passed,
      after: !!r.result?.passed,
    }))
    .sort((a, b) => a.order - b.order);

  const fixed = rows.filter((r) => !r.before && r.after);
  const regressed = rows.filter((r) => r.before && !r.after);
  const stillFailing = rows.filter((r) => !r.before && !r.after);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="panel-title mono">{aggregate.name}</div>
          <div className="panel-sub">{aggregate.evaluator_name ? `${aggregate.evaluator_name} v${aggregate.evaluator_version ?? "?"}` : "Evaluator"}</div>
        </div>
      </div>

      <div className="score-pair">
        <div className="score">
          <span className="score-label">Baseline</span>
          <span className="score-value mono">
            {baselinePassed}/{total}
          </span>
          <span className="score-pct">{total ? Math.round((baselinePassed / total) * 100) : 0}% passed</span>
        </div>
        <span className="score-arrow" aria-hidden>
          →
        </span>
        <div className="score">
          <span className="score-label">This run</span>
          <span className="score-value mono">
            {resultPassed}/{total}
          </span>
          <span className="score-pct">{total ? Math.round((resultPassed / total) * 100) : 0}% passed</span>
        </div>
        <Delta points={delta} />
      </div>

      <div className="case-grid" role="table" aria-label="Pass or fail per case, baseline and this run">
        <div className="case-grid-labels" role="rowgroup">
          <span>Baseline</span>
          <span>This run</span>
        </div>
        <div className="case-grid-cols">
          {rows.map((r) => {
            const change = !r.before && r.after ? "fixed" : r.before && !r.after ? "regressed" : "";
            return (
              <div key={r.id} className={`case-col ${change}`} title={`${r.name}: ${r.before ? "Pass" : "Fail"} → ${r.after ? "Pass" : "Fail"}`}>
                <GridCell passed={r.before} sessionId={r.recordedSessionId} title={`${r.name}, recorded session: ${r.before ? "Pass" : "Fail"}`} />
                <GridCell passed={r.after} sessionId={r.resultSessionId} title={`${r.name}, this run: ${r.after ? "Pass" : "Fail"}`} />
                <span className="case-num">{r.name.replace(/^\D+-?/, "") || r.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="change-summary">
        <ChangeGroup tone="success" label="Fixed" items={fixed.map((r) => r.name)} empty="None" />
        <ChangeGroup tone="destructive" label="Regressed" items={regressed.map((r) => r.name)} empty="None" />
        <ChangeGroup tone="muted" label="Still failing" items={stillFailing.map((r) => r.name)} empty="None" />
      </div>
    </div>
  );
}

function ChangeGroup({ tone, label, items, empty }: { tone: "success" | "destructive" | "muted"; label: string; items: string[]; empty: string }) {
  return (
    <div className={`change-group ${tone}`}>
      <span className="change-group-label">
        <span className={`ev-dot ev-dot-${tone}`} aria-hidden />
        {label} <span className="mono">{items.length}</span>
      </span>
      <span className="change-group-items">
        {items.length ? items.map((n) => <span key={n} className="case-chip mono">{n}</span>) : <span className="muted">{empty}</span>}
      </span>
    </div>
  );
}

function ConfigCard({ experiment }: { experiment: Experiment }) {
  const [open, setOpen] = useState(false);
  const fields = changedFields(experiment.override);
  const tools = Object.entries((experiment.tool_policy?.tools ?? {}) as Record<string, { type?: string }>);
  const defaultPolicy = (experiment.tool_policy?.default as { type?: string } | undefined)?.type;

  return (
    <div className="panel">
      <button type="button" className="panel-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <span className="panel-title">What this experiment changes</span>
          <span className="panel-sub">{fields.length ? fields.map((f) => f.label).join(", ") : "Nothing: replays the agent as recorded"}</span>
        </span>
        <ChevronDown size={16} aria-hidden className={open ? "chev open" : "chev"} />
      </button>
      {open ? (
        <div className="config-body">
          {fields.map((f) => (
            <div key={f.key} className="config-block">
              <div className="config-label">{f.label}</div>
              <pre className="code-block">{typeof f.value === "string" ? f.value : JSON.stringify(f.value, null, 2)}</pre>
            </div>
          ))}
          <div className="config-block">
            <div className="config-label">Tools during replay</div>
            <table className="mini-table">
              <tbody>
                {tools.map(([name, policy]) => (
                  <tr key={name}>
                    <td className="mono">{name}</td>
                    <td>{toolPolicyLabel(policy.type)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="muted">Any other tool</td>
                  <td>{toolPolicyLabel(defaultPolicy)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="config-block">
            <div className="config-label">Evaluators</div>
            <span className="chip-row">
              {experiment.evaluators.map((e) => (
                <span key={e.evaluator} className="change-chip mono">
                  {e.evaluator} v{e.version}
                </span>
              ))}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function runStatusWord(status: ExperimentRun["status"]) {
  if (status === "running") return "Running";
  if (status === "canceling") return "Stopping";
  if (status === "canceled") return "Stopped";
  if (status === "failed") return "Failed";
  return "Completed";
}

// "support-desk-v1-baseline · baseline-2026-11-10" for a cohort version id.
function useCohortVersionLabel(agentId: string, cohortVersionId: string) {
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  for (const c of cohorts.data ?? []) {
    const v = versionsByCohort[c.id]?.find((x) => x.id === cohortVersionId);
    if (v) {
      return (
        <>
          <Link to={`/agents/${agentId}/cohorts/${c.id}?version=${v.version}`} className="inline-link">
            {c.name}
          </Link>{" "}
          <span className="muted mono">{versionLabel(v)}</span>
        </>
      );
    }
  }
  return "—";
}
