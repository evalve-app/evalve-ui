import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat2 } from "lucide-react";
import { listExperiments } from "../../../api/client";
import { Alert, Badge, Button } from "../../../design-system/components";
import { formatRelative } from "../../../lib/format";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { skillLoopRows, type SkillLoopRow } from "../../../lib/loops";
import { LoopStatus } from "./LoopStatus";

// Every Loop of this agent. A Skill Loop is the experiments that a loop skill
// named `<prefix>-round-N`, or `<prefix>-iteration-N` from 1 (docs/loop-contract.md).
// The list reads the experiments of the agent once, and a row makes no request of its own.
export function LoopListTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  const preview = useEmptyPreview().on;
  const rows = useMemo(() => (preview ? [] : skillLoopRows(experiments.data ?? [])), [experiments.data, preview]);

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="toolbar-intro">Change one thing per experiment and replay the cohort until every case passes the required number of times in a row.</p>
        </div>
        <div className="toolbar-right">
          <Button variant="outline" icon={RefreshCw} onClick={() => experiments.refetch()} disabled={experiments.isFetching}>
            Refresh
          </Button>
          <Button icon={Plus} onClick={() => navigate("new")}>
            New loop
          </Button>
        </div>
      </div>

      {experiments.isError ? (
        <Alert variant="destructive" title="Could not load loops">
          {experiments.error.message}
        </Alert>
      ) : null}

      {experiments.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <Repeat2 size={24} aria-hidden />
          <p className="empty-title">No loops yet</p>
          <p className="empty-text">Set the cohort, what may change and when to stop. Your coding agent runs the experiments and the results show up here.</p>
          <Button variant="outline" icon={Plus} onClick={() => navigate("new")}>
            New loop
          </Button>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th className="fill">Loop</th>
                <th>Loop owner</th>
                <th>Status</th>
                <th className="num">Experiments tried</th>
                <th>Spend</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <SkillLoopListRow key={row.slug} row={row} onOpen={() => navigate(`/agents/${agentId}/skill-loop/${row.slug}`)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// A Skill Loop has no Loop owner and no spend on the Evalve backend, so those cells stay empty.
function SkillLoopListRow({ row, onOpen }: { row: SkillLoopRow; onOpen: () => void }) {
  return (
    <tr className="clickable-row" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <td className="fill shrink">
        <div className="exp-cell">
          <span className="loop-name-row">
            <span className="exp-name" title={row.slug}>{row.slug}</span>
            <Badge variant="neutral">Skill Loop</Badge>
          </span>
          {row.hypothesis ? <span className="exp-desc">{row.hypothesis}</span> : null}
        </div>
      </td>
      <td />
      <td>
        <LoopStatus outcome={row.outcome} withText />
      </td>
      <td className="num mono">{row.experimentsTried}</td>
      <td />
      <td className="muted">{formatRelative(row.updatedAt)}</td>
    </tr>
  );
}
