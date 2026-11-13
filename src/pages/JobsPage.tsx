import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, CircleAlert, ChevronRight, CircleX, Copy, Inbox, RefreshCw } from "lucide-react";
import { listExperimentRunJobs, listFailingTasks, listJobs, type Job, type JobStatus, type Task } from "../api/client";
import { Alert, Button, StatusLabel } from "../design-system/components";
import { createCopyFeedback, type CopyState } from "../lib/copyFeedback";
import { useEmptyPreview } from "../lib/emptyPreview";
import { formatDateTime, formatDuration, formatRelative, shortId } from "../lib/format";
import { errorSummary, failingTaskLabel, isJobOpen, JOB_STATUSES, kindLabel, noErrorsText, sentenceCase, tracebackLines } from "../lib/jobs";
import { agentsQuery, workersQuery } from "../lib/queries";
import { useDebounced } from "../lib/useDebounced";

// How often the list reloads on its own, so running jobs move on by themselves.
const REFRESH_MS = 15_000;
// The traceback shows this many lines until the person asks for all of them.
const PREVIEW_LINES = 3;
const COLUMNS = 7;

// The 50 newest jobs: the units of work behind replays, imports and
// evaluations. Open a row to see why a job failed. Read-only: nothing here
// cancels or changes a job. Follows Kitaru's Jobs page (capstone-prototypes/Kitaru-UI).
// API: GET /api/v1/jobs, or GET /api/v1/experiment-runs/{id}/jobs when a run id
// is given, and GET /api/v1/tasks for a failed job's failing task.
export function JobsPage() {
  const [status, setStatus] = useState<JobStatus | "">("");
  const [runIdInput, setRunIdInput] = useState("");
  const runId = useDebounced(runIdInput.trim(), 400);
  // Rows the person opened or closed. Until they do, the first row is open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const preview = useEmptyPreview().on;

  const jobs = useQuery({
    queryKey: ["jobs", status, runId],
    queryFn: () => (runId ? listExperimentRunJobs(runId, status || null) : listJobs(status || null)),
    refetchInterval: REFRESH_MS,
  });
  // Only for names in a failing task's line. The table does not wait for them.
  const agents = useQuery(agentsQuery());
  const workers = useQuery(workersQuery());
  const agentName = (id: string) => agents.data?.find((a) => a.id === id)?.name;
  const workerName = (id: string) => workers.data?.find((w) => w.id === id)?.name;

  const noSuchRun = jobs.isSuccess && jobs.data === null;
  const rows = preview ? [] : (jobs.data ?? []);
  const filtered = status !== "" || runId !== "";
  const toggle = (job: Job, index: number) => setToggled((t) => ({ ...t, [job.id]: !isJobOpen(t, job.id, index) }));

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="page-heading">
            <h1 className="page-title">Jobs</h1>
            {jobs.isSuccess && !noSuchRun ? <span className="count-chip">{rows.length}</span> : null}
          </div>
          <p className="page-subtitle">The units of work behind replays, imports and evaluations</p>
        </div>
        <div className="page-actions">
          <Button variant="outline" icon={RefreshCw} onClick={() => jobs.refetch()} disabled={jobs.isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <select className="ev-select native-select" value={status} onChange={(e) => setStatus(e.target.value as JobStatus | "")} aria-label="Status">
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {sentenceCase(s)}
              </option>
            ))}
          </select>
          <input
            className="ev-input run-id-input"
            placeholder="Experiment run id"
            aria-label="Experiment run id"
            spellCheck={false}
            value={runIdInput}
            onChange={(e) => setRunIdInput(e.target.value)}
          />
        </div>
      </div>

      {jobs.isError ? (
        <Alert variant="destructive" title="Could not load jobs">
          {jobs.error.message}
        </Alert>
      ) : null}

      {noSuchRun ? (
        <div className="empty-state">
          <p className="empty-title">No experiment run has this id</p>
          <p className="empty-text">Check the id, or clear the box to see every job.</p>
        </div>
      ) : null}

      {jobs.isSuccess && !noSuchRun && rows.length === 0 ? (
        <div className="empty-state">
          <Inbox size={24} aria-hidden />
          <p className="empty-title">{filtered ? "No jobs match these filters" : "No jobs yet"}</p>
          <p className="empty-text">Jobs appear when you run replays, imports or evaluations.</p>
        </div>
      ) : null}

      {jobs.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th aria-label="Open" />
                <th>Job</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Created</th>
                <th>Duration</th>
                <th className="fill">Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} className="row-skeleton">
                      <td colSpan={COLUMNS}>
                        <span className="skeleton-bar" />
                      </td>
                    </tr>
                  ))
                : rows.map((job, i) => {
                    const open = isJobOpen(toggled, job.id, i);
                    return (
                      <Fragment key={job.id}>
                        <tr>
                          <td>
                            <button type="button" className="icon-button" aria-expanded={open} aria-label={open ? "Close job" : "Open job"} onClick={() => toggle(job, i)}>
                              {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                            </button>
                          </td>
                          <td className="mono" title={job.id}>
                            {shortId(job.id)}
                          </td>
                          <td>
                            <span className="job-kind">{kindLabel(job.kind)}</span>
                          </td>
                          <td>
                            <StatusLabel status={job.status}>{sentenceCase(job.status)}</StatusLabel>
                          </td>
                          <td className="muted" title={formatDateTime(job.created)}>
                            {formatRelative(job.created)}
                          </td>
                          <td className="mono muted">{formatDuration(job.started_at, job.ended_at)}</td>
                          <td className="shrink">
                            <span className="job-error" title={errorSummary(job.error) ?? undefined}>
                              {errorSummary(job.error)}
                            </span>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="job-detail-row">
                            <td colSpan={COLUMNS}>
                              <JobDetail job={job} agentName={agentName} workerName={workerName} />
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
    </section>
  );
}

function JobDetail({ job, agentName, workerName }: { job: Job; agentName: (id: string) => string | undefined; workerName: (id: string) => string | undefined }) {
  const failed = job.status === "failed";
  const tasks = useQuery({ queryKey: ["failing-tasks", job.id], queryFn: () => listFailingTasks(job.id), enabled: failed });

  if (!failed) return <p className="muted">{noErrorsText(job.status)}</p>;

  const task = tasks.data?.[0];
  const lines = tracebackLines(job.error, task?.error);
  return (
    <div className="job-failure">
      <p className="job-failure-label">
        <CircleX size={16} aria-hidden />
        Failed
      </p>
      <p className="job-failure-summary">{errorSummary(job.error) ?? "The job failed without an error message."}</p>
      {lines.length > 0 ? <Traceback lines={lines} /> : null}
      {task ? <FailingTask task={task} agentName={agentName} workerName={workerName} /> : null}
      {tasks.isError ? (
        <div className="job-section job-task-error" role="alert">
          <span>Could not load the failing task: {tasks.error.message}</span>
          <button type="button" className="text-button" onClick={() => tasks.refetch()} disabled={tasks.isFetching}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Traceback({ lines }: { lines: string[] }) {
  const [all, setAll] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [feedback] = useState(() => createCopyFeedback({ write: (text) => navigator.clipboard.writeText(text), onChange: setCopyState }));
  const shown = all ? lines : lines.slice(0, PREVIEW_LINES);

  return (
    <div className="job-section">
      <p className="job-section-label">Traceback</p>
      <div className="traceback">
        <div className="traceback-bar">
          <span className="traceback-copy-failed" aria-live="polite">
            {copyState === "failed" ? "Could not copy" : ""}
          </span>
          <button type="button" className="icon-button" aria-label={copyState === "done" ? "Copied" : "Copy traceback"} onClick={() => feedback.copy(lines.join("\n"))}>
            {copyState === "done" ? <Check size={14} aria-hidden /> : copyState === "failed" ? <CircleAlert size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          </button>
        </div>
        <pre className="traceback-text">{shown.join("\n")}</pre>
        {lines.length > PREVIEW_LINES ? (
          <button type="button" className="text-button traceback-more" onClick={() => setAll(!all)}>
            {all ? "Show less" : `Show all ${lines.length} lines`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FailingTask({ task, agentName, workerName }: { task: Task; agentName: (id: string) => string | undefined; workerName: (id: string) => string | undefined }) {
  return (
    <div className="job-section">
      <p className="job-section-label">Failing task</p>
      <div className="failing-task">
        <StatusLabel status={task.status} tone="destructive">
          {sentenceCase(task.status)}
        </StatusLabel>
        <span className="muted">{failingTaskLabel(task, agentName, workerName)}</span>
      </div>
    </div>
  );
}
