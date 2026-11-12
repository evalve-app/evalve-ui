import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { SearchCheck } from "lucide-react";
import { listInvestigations } from "../../api/client";
import { Alert, StatusLabel } from "../../design-system/components";
import { useEmptyPreview } from "../../lib/emptyPreview";
import { formatDateTime, formatRelative } from "../../lib/format";
import { investigationRows } from "../../lib/investigations";

// Investigations for one agent, the one that changed last first. Read-only: a
// row opens nothing.
export function InvestigationsTab() {
  const { agentId = "" } = useParams();
  const investigations = useQuery({ queryKey: ["investigations", agentId], queryFn: () => listInvestigations(agentId) });
  const preview = useEmptyPreview().on;

  const rows = investigationRows(preview ? [] : (investigations.data ?? []));

  return (
    <div className="tab-page">
      {investigations.isError ? (
        <Alert variant="destructive" title="Could not load investigations">
          {investigations.error.message}
        </Alert>
      ) : null}

      {investigations.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <SearchCheck size={24} aria-hidden />
          <p className="empty-title">No investigations yet</p>
          <p className="empty-text">An investigation is a named set of sessions that a person reviews one at a time. Create one with the Kitaru CLI or the kitaru-investigation skill.</p>
        </div>
      ) : null}

      {investigations.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="fill">Description</th>
                <th>Status</th>
                <th>Reviewed</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {investigations.isPending
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
                      <td className="shrink">
                        <span className="cohort-desc muted" title={r.description ?? undefined}>
                          {r.description || "—"}
                        </span>
                      </td>
                      <td>
                        <StatusLabel status={r.status} tone={r.statusTone}>
                          {r.statusLabel}
                        </StatusLabel>
                      </td>
                      <td className="mono">{r.reviewed}</td>
                      <td className="muted" title={formatDateTime(r.updated)}>
                        {formatRelative(r.updated)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
