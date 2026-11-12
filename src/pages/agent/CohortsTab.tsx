import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { Layers, Plus } from "lucide-react";
import type { Agent } from "../../api/client";
import { Alert, Button } from "../../design-system/components";
import { cohortRows } from "../../lib/cohorts";
import { useEmptyPreview } from "../../lib/emptyPreview";
import { formatDateTime, formatRelative } from "../../lib/format";
import { newCohortPrompt } from "../../lib/handoffPrompts";
import { useCohorts } from "../../lib/useCohorts";
import { HandoffPromptDialog } from "../HandoffPromptDialog";

// Cohorts for one agent, the one that changed last first. A row opens the
// cohort page at the newest cohort version.
export function CohortsTab() {
  const { agentId = "" } = useParams();
  const agent = useOutletContext<Agent | undefined>();
  const [newOpen, setNewOpen] = useState(false);
  const navigate = useNavigate();
  const open = (cohortId: string) => navigate(`/agents/${agentId}/cohorts/${cohortId}`);
  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const preview = useEmptyPreview().on;

  const rows = cohortRows(preview ? [] : (cohorts.data ?? []), versionsByCohort);

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="toolbar-intro">Group sessions with similar failure modes, behaviors, or outcomes to evaluate them together.</p>
        </div>
        <div className="toolbar-right">
          <Button icon={Plus} onClick={() => setNewOpen(true)} disabled={!agent}>
            New cohort
          </Button>
        </div>
      </div>
      {agent ? <HandoffPromptDialog open={newOpen} onClose={() => setNewOpen(false)} {...newCohortPrompt(agent)} /> : null}

      {cohorts.isError ? (
        <Alert variant="destructive" title="Could not load cohorts">
          {cohorts.error.message}
        </Alert>
      ) : null}

      {cohorts.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <Layers size={24} aria-hidden />
          <p className="empty-title">No cohorts yet</p>
          <p className="empty-text">A cohort is a named set of recorded sessions. Experiments replay one version of it. Select New cohort to get a prompt for your coding agent.</p>
        </div>
      ) : null}

      {cohorts.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
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
                    <tr
                      key={r.id}
                      className="clickable-row"
                      onClick={() => open(r.id)}
                    >
                      <td className="mono">
                        {/* A real link, so it opens in a new tab and a screen reader names it. The row click is an extra. */}
                        <Link to={`/agents/${agentId}/cohorts/${r.id}`} className="inline-link" onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                      </td>
                      <td className="shrink">
                        <span className="cohort-desc muted" title={r.description ?? undefined}>
                          {r.description || "—"}
                        </span>
                      </td>
                      <td className="mono">{r.versionLabel ?? "—"}</td>
                      <td className="num">{r.sessionCount ?? "—"}</td>
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
