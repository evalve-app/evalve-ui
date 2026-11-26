import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Server } from "lucide-react";
import { Alert, Button, StatusLabel } from "../design-system/components";
import { useEmptyPreview } from "../lib/emptyPreview";
import { formatDateTime, formatRelative } from "../lib/format";
import { workersQuery } from "../lib/queries";
import { nextSort } from "../lib/sortRows";
import { DEFAULT_WORKER_SORT, firstWorkerSortDir, sortWorkerRows, workerRows, type WorkerColumn } from "../lib/workers";
import { SortHeader } from "./SortHeader";

// How often the list reloads on its own, so Live and Offline stay current.
const REFRESH_MS = 15_000;

// The live workers on the server. A worker that stops sending heartbeats drops
// off the list, as on Kitaru's Workers page (capstone-prototypes/Kitaru-UI).
// Read-only: a row opens nothing.
// A worker with only these claims cannot take the work of a Loop (sc-386).
const START_COMMAND = "kitaru worker start --claim importer --claim analyzer";
// API: GET /api/v1/workers
export function WorkersPage() {
  const workers = useQuery({ ...workersQuery(), refetchInterval: REFRESH_MS });
  const [sort, setSort] = useState(DEFAULT_WORKER_SORT);
  const preview = useEmptyPreview().on;

  const rows = sortWorkerRows(workerRows(preview ? [] : (workers.data ?? [])), sort);
  const onSort = (column: WorkerColumn) => setSort((s) => nextSort(s, column, firstWorkerSortDir(column)));
  const head = { sort, onSort };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="page-heading">
            <h1 className="page-title">Workers</h1>
            {workers.isSuccess ? <span className="count-chip">{rows.length}</span> : null}
          </div>
          <p className="page-subtitle">Processes that poll for tasks and run them, reporting a heartbeat while they stay alive</p>
        </div>
        <div className="page-actions">
          <Button variant="outline" icon={RefreshCw} onClick={() => workers.refetch()} disabled={workers.isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      {workers.isError ? (
        <Alert variant="destructive" title="Could not load workers">
          {workers.error.message}
        </Alert>
      ) : null}

      {workers.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <Server size={24} aria-hidden />
          <p className="empty-title">No workers registered yet</p>
          <p className="empty-text">A worker is a process that picks up tasks and runs them. Start one for imports and analysis with the Kitaru CLI:</p>
          <code className="command-chip">{START_COMMAND}</code>
          <ClaimsNote className="empty-text" />
        </div>
      ) : null}

      {workers.isSuccess && rows.length > 0 ? (
        <div className="workers-claims">
          <code className="command-chip">{START_COMMAND}</code>
          <ClaimsNote className="field-hint" />
        </div>
      ) : null}

      {workers.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader column="name" {...head}>Worker</SortHeader>
                <SortHeader column="status" {...head}>Status</SortHeader>
                <SortHeader column="claims" {...head}>Claims</SortHeader>
                <SortHeader column="platform" {...head}>Platform</SortHeader>
                <SortHeader column="lastSeen" className="fill" {...head}>Last seen</SortHeader>
              </tr>
            </thead>
            <tbody>
              {workers.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} className="row-skeleton">
                      <td colSpan={5}>
                        <span className="skeleton-bar" />
                      </td>
                    </tr>
                  ))
                : rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.name}</td>
                      <td>
                        <StatusLabel status={r.status} tone={r.live ? "success" : "muted"} />
                      </td>
                      <td>{r.claims ?? <span className="muted">—</span>}</td>
                      <td>{r.platform ?? <span className="muted">—</span>}</td>
                      <td className="fill muted" title={formatDateTime(r.lastSeen)}>
                        {formatRelative(r.lastSeen)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

// A worker with another claim can take the work of a Loop, and that Run then gets no score.
function ClaimsNote({ className }: { className: string }) {
  return (
    <p className={className}>
      While a Loop runs, start a worker only with these two claims. A worker with an <code>agent</code> claim, an <code>evaluator</code> claim or no <code>--claim</code> can
      take the work of the Loop, and that Run then gets no score.
    </p>
  );
}
