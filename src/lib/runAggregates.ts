// The results of one run, with the values of each replay.
//
// Kitaru's aggregates call lists the evaluation values of only the 50 most
// recent replays of a run. For a run with more replays, the values of the
// other replays come from the evaluations of their sessions. The functions
// here are pure. The calls are in runAggregatesQuery.ts.
import type { EvalAggregate, Replay, SessionEvaluation } from "../api/client";

type ReplayValues = EvalAggregate["replays"][number];
type Value = NonNullable<ReplayValues["result"]>;

// True when an aggregate lists fewer replays than the run has values for.
export function aggregatesCut(aggregates: EvalAggregate[]): boolean {
  return aggregates.some((a) => (a.replays?.length ?? 0) < Math.max(a.result?.count ?? 0, a.baseline?.count ?? 0));
}

// The number of replays that the aggregates list: the cases that a page has
// results for, with or without a pass/fail result.
export function casesListed(aggregates: EvalAggregate[]): number {
  return new Set(aggregates.flatMap((a) => (a.replays ?? []).map((r) => r.replay_id))).size;
}

// True when the run has scores for the recorded sessions. A Run that a Loop
// starts has none: the Evalve backend does not ask Kitaru to score them.
const scoresRecorded = (a: EvalAggregate) => (a.baseline?.count ?? 0) > 0;

// The replays that one or more aggregates do not list.
function unlisted(aggregates: EvalAggregate[], replays: Replay[]): Replay[] {
  const lists = aggregates.map((a) => new Set((a.replays ?? []).map((r) => r.replay_id)));
  return replays.filter((r) => lists.some((ids) => !ids.has(r.id)));
}

// The ids of the sessions whose evaluations completeAggregates needs: the
// result session of each replay that an aggregate does not list, and its
// recorded session when the run has scores for the recorded sessions.
export function sessionsToLoad(aggregates: EvalAggregate[], replays: Replay[]): string[] {
  const withRecorded = aggregates.some(scoresRecorded);
  const ids = new Set<string>();
  for (const r of unlisted(aggregates, replays)) {
    if (r.result_session_id) ids.add(r.result_session_id);
    if (withRecorded && r.baseline_session_id) ids.add(r.baseline_session_id);
  }
  return [...ids];
}

const valueOf = (e: SessionEvaluation | undefined): Value | null =>
  e ? { score: e.score ?? null, value: e.value ?? null, passed: e.passed ?? null, min_score: e.min_score ?? null, max_score: e.max_score ?? null, target_score: e.target_score ?? null } : null;

// Each aggregate with one entry for each replay of the run, oldest first, as
// the server orders its list. An entry that the server gave stays as it is.
// A replay that the server left out gets the values of the newest evaluation
// of the aggregate's evaluator version and name: for its result session, and
// for its recorded session when the run has scores for the recorded sessions.
// A replay with no evaluation gets an entry with no values, so that its case
// has no score and is not a pass.
export function completeAggregates(aggregates: EvalAggregate[], replays: Replay[], evaluations: SessionEvaluation[]): EvalAggregate[] {
  const key = (sessionId: string, of: { evaluator_version_id?: string | null; name: string }) => `${sessionId}|${of.evaluator_version_id ?? ""}|${of.name}`;
  const newest = new Map<string, SessionEvaluation>();
  for (const e of evaluations) {
    const k = key(e.session_id, e);
    const current = newest.get(k);
    if (!current || e.created > current.created) newest.set(k, e);
  }
  const find = (sessionId: string | null | undefined, agg: EvalAggregate) => (sessionId ? newest.get(key(sessionId, agg)) : undefined);
  const ordered = [...replays].sort((a, b) => (a.created ?? "").localeCompare(b.created ?? ""));
  const inRun = new Set(replays.map((r) => r.id));
  return aggregates.map((agg) => {
    const given = new Map((agg.replays ?? []).map((r) => [r.replay_id, r]));
    const list = ordered.map(
      (r): ReplayValues => given.get(r.id) ?? { replay_id: r.id, baseline: scoresRecorded(agg) ? valueOf(find(r.baseline_session_id, agg)) : null, result: valueOf(find(r.result_session_id, agg)) },
    );
    // An entry for a replay that the replay list does not have stays, in front.
    return { ...agg, replays: [...(agg.replays ?? []).filter((r) => !inRun.has(r.replay_id)), ...list] };
  });
}
