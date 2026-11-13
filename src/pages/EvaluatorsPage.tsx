import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Plus, RefreshCw, Ruler } from "lucide-react";
import { Alert, Button } from "../design-system/components";
import { useEmptyPreview } from "../lib/emptyPreview";
import { DEFAULT_EVALUATOR_SORT, evaluatorRows, firstEvaluatorSortDir, sortEvaluatorRows, type EvaluatorColumn } from "../lib/evaluators";
import { formatDateTime, formatRelative, shortId } from "../lib/format";
import { newEvaluatorPrompt } from "../lib/handoffPrompts";
import { agentsQuery, evaluatorsQuery } from "../lib/queries";
import { nextSort } from "../lib/sortRows";
import { HandoffPromptDialog } from "./HandoffPromptDialog";
import { SortHeader } from "./SortHeader";

// Every evaluator on the server. A click on a column header sorts the list.
// Read-only: a row opens nothing, and "New evaluator" gives a handoff prompt.
export function EvaluatorsPage() {
  const evaluators = useQuery(evaluatorsQuery());
  // Only for the agent names in the Scope column. The table does not wait for it.
  const agents = useQuery(agentsQuery());
  const preview = useEmptyPreview().on;
  const [sort, setSort] = useState(DEFAULT_EVALUATOR_SORT);
  const [newOpen, setNewOpen] = useState(false);

  const agentNames = Object.fromEntries((agents.data ?? []).map((a) => [a.id, a.name]));
  const rows = sortEvaluatorRows(evaluatorRows(preview ? [] : (evaluators.data ?? []), agentNames), sort);
  const onSort = (column: EvaluatorColumn) => setSort((s) => nextSort(s, column, firstEvaluatorSortDir(column)));
  const head = { sort, onSort };
  const refresh = () => {
    evaluators.refetch();
    agents.refetch();
  };

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <div className="page-heading">
            <h1 className="page-title">Evaluators</h1>
          </div>
          <p className="page-subtitle">Named checks that score one session each. They are written in your repo; this shows which ones are registered and what version each is on.</p>
        </div>
        <div className="page-actions">
          <Button variant="outline" icon={RefreshCw} onClick={refresh} disabled={evaluators.isFetching}>
            Refresh
          </Button>
          <Button icon={Plus} onClick={() => setNewOpen(true)}>
            New evaluator
          </Button>
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
          <Button variant="outline" icon={Plus} onClick={() => setNewOpen(true)}>
            New evaluator
          </Button>
        </div>
      ) : null}

      {evaluators.isPending || rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader column="name" {...head}>Name</SortHeader>
                <SortHeader column="description" className="fill" {...head}>Description</SortHeader>
                <SortHeader column="scope" {...head}>Scope</SortHeader>
                <SortHeader column="version" {...head}>Version</SortHeader>
                <SortHeader column="updated" {...head}>Updated</SortHeader>
              </tr>
            </thead>
            <tbody>
              {evaluators.isPending
                ? Array.from({ length: 4 }, (_, i) => (
                    <tr key={i} className="row-skeleton">
                      <td colSpan={5}>
                        <span className="skeleton-bar" />
                      </td>
                    </tr>
                  ))
                : rows.map((r) => (
                    <tr key={r.id}>
                      <td className="evaluator-wrap">
                        <div className="evaluator-name">
                          <Ruler size={16} aria-hidden className="evaluator-icon" />
                          <span className="mono">{r.name}</span>
                        </div>
                      </td>
                      {/* Wraps to 2 lines, so the table fits a narrow window. */}
                      <td className="fill wrap">
                        {r.description ? (
                          <p className="evaluator-desc" title={r.description}>
                            {r.description}
                          </p>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="evaluator-wrap">
                        {r.agentId ? (
                          <Link to={`/agents/${r.agentId}`} className="inline-link">
                            {r.agentName ?? shortId(r.agentId)}
                          </Link>
                        ) : (
                          <span className="muted">All agents</span>
                        )}
                      </td>
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

      <HandoffPromptDialog open={newOpen} onClose={() => setNewOpen(false)} {...newEvaluatorPrompt()} />
    </section>
  );
}
