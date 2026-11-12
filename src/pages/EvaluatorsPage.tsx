import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { Alert } from "../design-system/components";
import { useEmptyPreview } from "../lib/emptyPreview";
import { evaluatorRows } from "../lib/evaluators";
import { formatDateTime, formatRelative, shortId } from "../lib/format";
import { agentsQuery, evaluatorsQuery } from "../lib/queries";

// Every evaluator on the server, by name. Read-only: a row opens nothing.
export function EvaluatorsPage() {
  const evaluators = useQuery(evaluatorsQuery());
  // Only for the agent names in the Scope column. The table does not wait for it.
  const agents = useQuery(agentsQuery());
  const preview = useEmptyPreview().on;

  const agentNames = Object.fromEntries((agents.data ?? []).map((a) => [a.id, a.name]));
  const rows = evaluatorRows(preview ? [] : (evaluators.data ?? []), agentNames);

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title">Evaluators</h1>
        </div>
      </div>

      {evaluators.isError ? (
        <Alert variant="destructive" title="Could not load evaluators">
          {evaluators.error.message}
        </Alert>
      ) : null}

      {evaluators.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <ClipboardCheck size={24} aria-hidden />
          <p className="empty-title">No evaluators yet</p>
          <p className="empty-text">An evaluator is a named check that scores one session. Experiments use evaluators to score replays. Create one with the Kitaru CLI or the kitaru-investigation skill.</p>
        </div>
      ) : null}

      {evaluators.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="fill">Description</th>
                <th>Scope</th>
                <th>Provider</th>
                <th>Version</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {evaluators.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} className="row-skeleton">
                      <td colSpan={6}>
                        <span className="skeleton-bar" />
                      </td>
                    </tr>
                  ))
                : rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.name}</td>
                      <td className="shrink">
                        <span className="cohort-desc muted" title={r.description ?? undefined}>
                          {r.description || "—"}
                        </span>
                      </td>
                      <td>
                        {r.agentId ? (
                          <Link to={`/agents/${r.agentId}`} className="inline-link">
                            {r.agentName ?? shortId(r.agentId)}
                          </Link>
                        ) : (
                          <span className="muted">All agents</span>
                        )}
                      </td>
                      <td>{r.provider ?? "—"}</td>
                      <td className="mono">{r.versionLabel}</td>
                      <td className="muted" title={formatDateTime(r.updated)}>
                        {formatRelative(r.updated)}
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
