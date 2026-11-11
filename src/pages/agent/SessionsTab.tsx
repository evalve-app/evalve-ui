import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CircleDot, ListChecks, RefreshCw, Repeat, Search } from "lucide-react";
import { listAgentVersions, listSessionsPage, type Filter, type Session, type SessionRow } from "../../api/client";
import { Alert, Button, StatusLabel } from "../../design-system/components";
import { formatCost, formatDateTime, formatDuration, formatRelative, shortId } from "../../lib/format";
import { useDebounced } from "../../lib/useDebounced";
import { useEmptyPreview } from "../../lib/emptyPreview";

// Sessions for one agent, newest first, with one column per evaluator.
// API: GET /api/v1/ui/sessions?filter=...&size=50, paged with next_cursor.
export function SessionsTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const [versionId, setVersionId] = useState("");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 250);
  const numberTerm = /^#?\d+$/.test(term) ? term.replace(/^#/, "") : "";

  const versions = useQuery({ queryKey: ["versions", agentId], queryFn: () => listAgentVersions(agentId) });

  const filter = useMemo<Filter>(() => {
    const parts: Filter[] = [{ field: "agent_id", op: "eq", value: agentId }];
    if (versionId) parts.push({ field: "agent_version_id", op: "eq", value: versionId });
    // Kitaru can't filter on the session number, so "#371" or "371" is
    // matched against the loaded rows below instead of sent to the server.
    if (term && !numberTerm) {
      parts.push({
        or: [
          { field: "name", op: "contains", value: term },
          { field: "external_id", op: "contains", value: term },
        ],
      });
    }
    return parts.length === 1 ? parts[0] : { and: parts };
  }, [agentId, versionId, term, numberTerm]);

  const sessions = useInfiniteQuery({
    queryKey: ["sessions", filter],
    queryFn: ({ pageParam }) => listSessionsPage(filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

  const preview = useEmptyPreview().on;
  const loaded = useMemo(() => (preview ? [] : (sessions.data?.pages.flatMap((p) => p.items) ?? [])), [sessions.data, preview]);
  const rows = useMemo(
    () => (numberTerm ? loaded.filter((r) => String(r.session.number).includes(String(Number(numberTerm)))) : loaded),
    [loaded, numberTerm],
  );

  // One column per evaluation name seen on the loaded rows, in first-seen order.
  const evalColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) for (const e of r.evaluations) if (!seen.has(e.name)) seen.set(e.name, e.evaluator_name ?? "");
    return [...seen.entries()].map(([name, evaluator]) => ({ name, evaluator }));
  }, [rows]);

  const versionLabel = (id: string | null | undefined) => {
    const v = versions.data?.find((x) => x.id === id);
    return v ? `v${v.display_version ?? v.version}` : "—";
  };

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <label className="search-field">
            <Search size={16} aria-hidden className="search-icon" />
            <input
              className="ev-input search-input"
              type="search"
              placeholder="Search sessions"
              aria-label="Search sessions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select className="ev-select native-select" value={versionId} onChange={(e) => setVersionId(e.target.value)} aria-label="Version">
            <option value="">All versions</option>
            {versions.data?.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.display_version ?? v.version}
                {v.version === Math.max(...versions.data.map((x) => x.version)) ? " (latest)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-right">
          <Button variant="outline" icon={RefreshCw} onClick={() => sessions.refetch()} disabled={sessions.isFetching}>
            Refresh
          </Button>
        </div>
      </div>

      {sessions.isError ? (
        <Alert variant="destructive" title="Could not load sessions">
          {sessions.error.message}
        </Alert>
      ) : null}

      {sessions.isSuccess && loaded.length === 0 && !term && !versionId ? (
        <div className="empty-state">
          <ListChecks size={24} aria-hidden />
          <p className="empty-title">No sessions yet</p>
          <p className="empty-text">Sessions appear here once your agent runs with the Kitaru SDK, or when you import traces from your provider.</p>
        </div>
      ) : (
        <div className="table-card">
          <table className="data-table sessions-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Status</th>
                <th>Origin</th>
                <th>Version</th>
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
              {sessions.isPending
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
                      versionLabel={versionLabel(r.session.agent_version_id)}
                      onOpen={() => navigate(`/sessions/${r.session.id}`)}
                    />
                  ))}
            </tbody>
          </table>
          {sessions.isSuccess && rows.length === 0 ? (
            <div className="table-empty">No sessions match these filters.</div>
          ) : null}
        </div>
      )}

      <div className="table-footer">
        <span className="muted">
          {numberTerm
            ? `${rows.length} of the ${loaded.length} loaded sessions match #${numberTerm}`
            : rows.length > 0
              ? `Showing ${rows.length} ${rows.length === 1 ? "session" : "sessions"}${sessions.hasNextPage ? ", newest first" : ""}`
              : ""}
        </span>
        {sessions.hasNextPage && !preview ? (
          <Button variant="outline" size="sm" onClick={() => sessions.fetchNextPage()} disabled={sessions.isFetchingNextPage}>
            {sessions.isFetchingNextPage ? "Loading" : "Load more"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SessionTableRow({
  row,
  evalColumns,
  versionLabel,
  onOpen,
}: {
  row: SessionRow;
  evalColumns: { name: string }[];
  versionLabel: string;
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
      <td className="mono">{versionLabel}</td>
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
