import { useParams } from "react-router";
import { Layers } from "lucide-react";
import { Alert } from "../../design-system/components";
import { cohortRows } from "../../lib/cohorts";
import { useEmptyPreview } from "../../lib/emptyPreview";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useCohorts } from "../../lib/useCohorts";

// Cohorts for one agent, the one that changed last first. Read-only: a row
// opens nothing until the cohort page exists.
export function CohortsTab() {
  const { agentId = "" } = useParams();
  const { cohorts, versionLists } = useCohorts(agentId);
  const preview = useEmptyPreview().on;

  const list = preview ? [] : (cohorts.data ?? []);
  const versions = Object.fromEntries(list.map((c, i) => [c.id, versionLists[i]?.data]));
  const rows = cohortRows(list, versions);

  return (
    <div className="tab-page">
      {cohorts.isError ? (
        <Alert variant="destructive" title="Could not load cohorts">
          {cohorts.error.message}
        </Alert>
      ) : null}

      {cohorts.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <Layers size={24} aria-hidden />
          <p className="empty-title">No cohorts yet</p>
          <p className="empty-text">A cohort is a fixed set of recorded sessions that experiments replay. Create one with the Kitaru CLI or the kitaru-investigation skill.</p>
        </div>
      ) : null}

      {cohorts.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cohort</th>
                <th className="fill">Description</th>
                <th>Version</th>
                <th className="num">Sessions</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.isPending
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
                      <td className="mono">{r.version ?? "—"}</td>
                      <td className="num">{r.sessions ?? "—"}</td>
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
