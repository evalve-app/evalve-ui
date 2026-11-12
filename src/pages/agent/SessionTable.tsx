import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleDot, Repeat } from "lucide-react";
import { listAgentVersions, type Session, type SessionRow } from "../../api/client";
import { StatusLabel } from "../../design-system/components";
import { formatCost, formatDateTime, formatDuration, formatRelative, shortId } from "../../lib/format";

// A table of sessions with one column per evaluator. A row opens the session.
// The Sessions tab and the cohort page share it. The caller sets the row order.
export function SessionTable({ agentId, rows, pending, emptyText }: { agentId: string; rows: SessionRow[]; pending: boolean; emptyText?: string }) {
  const navigate = useNavigate();
  const versions = useQuery({ queryKey: ["versions", agentId], queryFn: () => listAgentVersions(agentId) });

  // One column per evaluation name seen on the rows, in first-seen order.
  const evalColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) for (const e of r.evaluations) if (!seen.has(e.name)) seen.set(e.name, e.evaluator_name ?? "");
    return [...seen.entries()].map(([name, evaluator]) => ({ name, evaluator }));
  }, [rows]);

  const agentVersionLabel = (id: string | null | undefined) => {
    const v = versions.data?.find((x) => x.id === id);
    return v ? `v${v.display_version ?? v.version}` : "—";
  };

  return (
    <div className="table-card">
      <table className="data-table sessions-table">
        <thead>
          <tr>
            <th>Session</th>
            <th>Status</th>
            <th>Origin</th>
            <th>Agent version</th>
            <th className="num">Duration</th>
            <th className="num">Cost</th>
            <th>Started</th>
            {/* Evaluator results last, like Kitaru: details first, outcome at the end of the row. */}
            {evalColumns.map((c, i) => (
              <th key={c.name} title={`Evaluator: ${c.evaluator}`} className={cxCol(i, evalColumns.length)}>
                <span className="eval-head">{c.name}</span>
              </th>
            ))}
            {evalColumns.length === 0 ? <th className="fill" /> : null}
          </tr>
        </thead>
        <tbody>
          {pending
            ? Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="row-skeleton">
                  <td colSpan={7 + evalColumns.length}>
                    <span className="skeleton-bar" />
                  </td>
                </tr>
              ))
            : rows.map((r) => (
                <SessionTableRow
                  key={r.session.id}
                  row={r}
                  evalColumns={evalColumns}
                  agentVersionLabel={agentVersionLabel(r.session.agent_version_id)}
                  onOpen={() => navigate(`/sessions/${r.session.id}`)}
                />
              ))}
        </tbody>
      </table>
      {emptyText && !pending && rows.length === 0 ? <div className="table-empty">{emptyText}</div> : null}
    </div>
  );
}

function SessionTableRow({
  row,
  evalColumns,
  agentVersionLabel,
  onOpen,
}: {
  row: SessionRow;
  evalColumns: { name: string }[];
  agentVersionLabel: string;
  onOpen: () => void;
}) {
  const s = row.session;
  return (
    <tr
      className="clickable-row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
    >
      <td>
        <div className="session-cell">
          <span className="session-number">#{String(s.number).padStart(4, "0")}</span>
          <span className="session-sub">{s.name ?? s.external_id ?? shortId(s.id)}</span>
        </div>
      </td>
      <td>
        <StatusLabel status={statusWord(s.status)} />
      </td>
      <td>
        <OriginTag origin={s.origin} />
      </td>
      <td className="mono">{agentVersionLabel}</td>
      <td className="num mono">{formatDuration(s.started_at, s.ended_at)}</td>
      <td className="num mono">{formatCost(s.cost)}</td>
      <td className="muted" title={formatDateTime(s.started_at)}>
        {formatRelative(s.started_at)}
      </td>
      {evalColumns.map((c, i) => {
        const e = row.evaluations.find((x) => x.name === c.name);
        return (
          <td key={c.name} className={cxCol(i, evalColumns.length)}>
            {e ? <Verdict passed={e.passed} score={e.score} /> : <span className="muted">—</span>}
          </td>
        );
      })}
      {evalColumns.length === 0 ? <td className="fill" /> : null}
    </tr>
  );
}

// The last evaluator column takes the leftover width so the row ends cleanly.
function cxCol(i: number, count: number) {
  return i === count - 1 ? "eval-col fill" : "eval-col";
}

function statusWord(status: Session["status"]) {
  if (status === "in_progress") return "Running";
  if (status === "failed") return "Failed";
  return "Completed";
}

function OriginTag({ origin }: { origin: Session["origin"] }) {
  const Icon = origin === "replay" ? Repeat : CircleDot;
  const label = origin === "replay" ? "Replay" : origin === "recorded" ? "Recorded" : "Imported";
  return (
    <span className="origin-tag">
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}

function Verdict({ passed, score }: { passed: boolean | null | undefined; score: unknown }) {
  if (passed == null) return <span className="mono">{typeof score === "number" ? score.toFixed(2) : "—"}</span>;
  return <span className={passed ? "verdict verdict-pass" : "verdict verdict-fail"}>{passed ? "Pass" : "Fail"}</span>;
}
