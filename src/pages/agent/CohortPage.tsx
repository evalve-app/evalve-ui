import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ListChecks } from "lucide-react";
import { getCohort, listCohortSessions } from "../../api/client";
import { Alert } from "../../design-system/components";
import { pickCohortVersion, versionLabel } from "../../lib/cohorts";
import { formatDateTime } from "../../lib/format";
import { cohortVersionsQuery } from "../../lib/useCohorts";
import { SessionTable } from "./SessionTable";

// One cohort: the sessions in one cohort version at a time, lowest session
// number first. `?version=N` picks the cohort version, and the newest one
// shows when the URL names none.
// API: GET /api/v1/ui/sessions?filter={cohort_version_id eq}&size=1000.
export function CohortPage() {
  const { agentId = "", cohortId = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Loaded by id, not from the list of the Cohorts tab, which stops at 50
  // cohorts. A cohort of a different agent counts as not found.
  const cohortQuery = useQuery({ queryKey: ["cohort", cohortId], queryFn: () => getCohort(cohortId) });
  const cohort = cohortQuery.data?.agent_id === agentId ? cohortQuery.data : undefined;
  const versions = useQuery({ ...cohortVersionsQuery(cohortId), enabled: !!cohort });

  const sorted = useMemo(() => [...(versions.data ?? [])].sort((a, b) => b.version - a.version), [versions.data]);
  const newest = sorted[0] ?? null;
  const version = pickCohortVersion(sorted, params.get("version"));

  const sessions = useQuery({ queryKey: ["cohort-sessions", version?.id], queryFn: () => listCohortSessions(version!.id), enabled: !!version });
  const rows = useMemo(() => [...(sessions.data ?? [])].sort((a, b) => a.session.number - b.session.number), [sessions.data]);

  const back = (
    <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/cohorts`)}>
      <ArrowLeft size={14} aria-hidden />
      Cohorts
    </button>
  );

  if (!cohort && (cohortQuery.isError || cohortQuery.isSuccess)) {
    return (
      <div className="tab-page">
        <div className="detail-header">{back}</div>
        <Alert variant="destructive" title={cohortQuery.isError ? "Could not load this cohort" : "Cohort not found"}>
          {cohortQuery.isError ? cohortQuery.error.message : "This agent has no cohort with this id."}
        </Alert>
      </div>
    );
  }

  // The newest version shows with no parameter. Replace the history entry so
  // the Back button leaves the page.
  const selectVersion = (number: string) => setParams(number === String(newest?.version) ? {} : { version: number }, { replace: true });

  return (
    <div className="tab-page">
      <div className="detail-header">
        {back}
        <div className="detail-title-block">
          <h2 className="detail-title">{cohort?.name ?? " "}</h2>
          {cohort?.description ? <p className="detail-description">{cohort.description}</p> : null}
        </div>
      </div>

      {versions.isError ? (
        <Alert variant="destructive" title="Could not load the versions of this cohort">
          {versions.error.message}
        </Alert>
      ) : null}

      {version ? (
        <div className="toolbar">
          <div className="toolbar-left cohort-version-bar">
            {sorted.length > 1 ? (
              <label className="inline-field">
                <span className="field-label">Cohort version</span>
                <select className="ev-select native-select" value={String(version.version)} onChange={(e) => selectVersion(e.target.value)}>
                  {sorted.map((v) => (
                    <option key={v.id} value={String(v.version)}>
                      {versionLabel(v)}
                      {v.id === newest?.id ? " (latest)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="inline-field">
                <span className="field-label">Cohort version</span>
                <span className="mono">{versionLabel(version)}</span>
              </span>
            )}
            <span className="muted">
              {version.session_count} {version.session_count === 1 ? "session" : "sessions"} · created {formatDateTime(version.created)}
            </span>
          </div>
        </div>
      ) : null}

      {sessions.isError ? (
        <Alert variant="destructive" title="Could not load sessions">
          {sessions.error.message}
        </Alert>
      ) : null}

      {versions.isSuccess && !version ? (
        <div className="empty-state">
          <ListChecks size={24} aria-hidden />
          <p className="empty-text">This cohort has no versions.</p>
        </div>
      ) : sessions.isSuccess && rows.length === 0 ? (
        <div className="empty-state">
          <ListChecks size={24} aria-hidden />
          <p className="empty-text">This cohort version has no sessions.</p>
        </div>
      ) : sessions.isError || versions.isError ? null : (
        <SessionTable agentId={agentId} rows={rows} pending={!sessions.isSuccess} />
      )}

      {version && rows.length > 0 && version.session_count > rows.length ? (
        <div className="table-footer">
          <span className="muted">
            Showing the first {rows.length} of {version.session_count} sessions.
          </span>
        </div>
      ) : null}
    </div>
  );
}
