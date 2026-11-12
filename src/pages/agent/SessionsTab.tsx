import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ListChecks, RefreshCw, Search } from "lucide-react";
import { listAgentVersions, listSessionsPage, type Filter } from "../../api/client";
import { Alert, Button } from "../../design-system/components";
import { useDebounced } from "../../lib/useDebounced";
import { useEmptyPreview } from "../../lib/emptyPreview";
import { newCohortPrompt } from "../../lib/handoffPrompts";
import { HandoffPromptButton } from "./HandoffPromptButton";
import { SessionTable } from "./SessionTable";

// Sessions for one agent, newest first, with one column per evaluator.
// API: GET /api/v1/ui/sessions?filter=...&size=50, paged with next_cursor.
export function SessionsTab() {
  const { agentId = "" } = useParams();
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
          <HandoffPromptButton label="New cohort" handoff={newCohortPrompt} />
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
        <SessionTable agentId={agentId} rows={rows} pending={sessions.isPending} emptyText={sessions.isSuccess ? "No sessions match these filters." : undefined} />
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
