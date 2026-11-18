import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Repeat2 } from "lucide-react";
import { listExperiments } from "../../../api/client";
import { listLoops } from "../../../api/evalve";
import { Alert, Badge, Button, Switch } from "../../../design-system/components";
import { loopListRows, loopPollInterval, type LoopRow } from "../../../lib/backendLoops";
import { formatRelative } from "../../../lib/format";
import { useEmptyPreview } from "../../../lib/emptyPreview";
import { skillLoopRows } from "../../../lib/loops";
import { LOOP_LISTS_KEY } from "../../../lib/queries";
import { LoopStatus } from "./LoopStatus";
import { useOwnerLabel, useViewerAccountId } from "./useOwnerLabel";

// Every Loop of this agent, of each account, newest first. The backend Loops
// come from the Evalve backend, one call for each page. The Skill Loops come
// from the experiments of the agent, one call for all of them
// (docs/loop-contract.md). A row makes no request of its own, apart from the
// name of its Loop owner.
export function LoopListTab() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const preview = useEmptyPreview().on;
  const viewer = useViewerAccountId();
  const [onlyMine, setOnlyMine] = useState(false);
  const ownerAccountId = onlyMine && viewer ? viewer : undefined;

  const loops = useInfiniteQuery({
    queryKey: [...LOOP_LISTS_KEY, agentId, ownerAccountId ?? null],
    queryFn: ({ pageParam }) => listLoops(agentId, { ownerAccountId, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    refetchInterval: (q) => loopPollInterval(q.state.data?.pages.flatMap((p) => p.items.map((item) => item.status)) ?? []),
  });
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });

  const rows = useMemo(() => {
    if (preview) return [];
    const backend = loops.data?.pages.flatMap((p) => p.items) ?? [];
    return loopListRows(backend, skillLoopRows(experiments.data ?? []), onlyMine);
  }, [loops.data, experiments.data, onlyMine, preview]);
  // Both sources answered, so an empty list is really empty. A failed source counts as answered.
  const settled = !loops.isPending && !experiments.isPending;

  return (
    <div className="tab-page">
      <div className="toolbar">
        <div className="toolbar-left">
          <p className="toolbar-intro">Change one thing per experiment and replay the cohort until every case passes the required number of times in a row.</p>
        </div>
        <div className="toolbar-right">
          <label className="toolbar-switch" htmlFor="only-my-loops">
            <Switch id="only-my-loops" checked={onlyMine} onCheckedChange={setOnlyMine} />
            Only my Loops
          </label>
          <Button
            variant="outline"
            icon={RefreshCw}
            onClick={() => {
              void loops.refetch();
              void experiments.refetch();
            }}
            disabled={loops.isFetching || experiments.isFetching}
          >
            Refresh
          </Button>
          <Button icon={Plus} onClick={() => navigate("new")}>
            New loop
          </Button>
        </div>
      </div>

      {loops.isError ? (
        <Alert variant="destructive" title="Could not load Loops from the Evalve backend">
          {loops.error.message} Skill Loops still show below.
        </Alert>
      ) : null}

      {experiments.isError ? (
        <Alert variant="destructive" title="Could not load Skill Loops">
          {experiments.error.message}
        </Alert>
      ) : null}

      {settled && rows.length === 0 ? (
        <div className="empty-state">
          <Repeat2 size={24} aria-hidden />
          <p className="empty-title">{onlyMine ? "You have no Loops on this agent" : "No loops yet"}</p>
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
                <LoopListRow key={row.key} row={row} onOpen={() => navigate(row.kind === "backend" ? `/agents/${agentId}/loop/${row.loopId}` : `/agents/${agentId}/skill-loop/${row.slug}`)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {loops.hasNextPage && !preview ? (
        <div className="table-footer">
          <span className="muted">Backend Loops load in pages, newest first.</span>
          <Button variant="outline" size="sm" onClick={() => loops.fetchNextPage()} disabled={loops.isFetchingNextPage}>
            {loops.isFetchingNextPage ? "Loading" : "Show more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// A Skill Loop has no Loop owner and no spend on the Evalve backend, so those cells stay empty.
function LoopListRow({ row, onOpen }: { row: LoopRow; onOpen: () => void }) {
  const name = row.kind === "backend" ? row.name : row.slug;
  return (
    <tr className="clickable-row" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <td className="fill shrink">
        <div className="exp-cell">
          <span className="loop-name-row">
            <span className="exp-name" title={name}>{name}</span>
            {row.kind === "skill" ? <Badge variant="neutral">Skill Loop</Badge> : null}
          </span>
          {row.hypothesis ? <span className="exp-desc">{row.hypothesis}</span> : null}
        </div>
      </td>
      <td>{row.kind === "backend" ? <OwnerName ownerAccountId={row.ownerAccountId} /> : null}</td>
      <td>
        <LoopStatus outcome={row.outcome} withText />
      </td>
      <td className="num mono">{row.experimentsTried}</td>
      <td className="mono">{row.kind === "backend" ? row.spend : null}</td>
      <td className="muted">{formatRelative(row.updatedAt)}</td>
    </tr>
  );
}

function OwnerName({ ownerAccountId }: { ownerAccountId: string }) {
  return <>{useOwnerLabel(ownerAccountId)}</>;
}
