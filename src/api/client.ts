// One typed client for every Kitaru API call.
//
// How auth works (same as Kitaru's own dashboard):
// 1. POST /api/v1/login with username and password. The server sets an
//    httpOnly auth cookie (JavaScript can't read it, so a script injected into
//    the page can't steal it) and returns a csrf_token in the response body.
// 2. Every later request carries the cookie automatically AND must send the
//    csrf_token in the X-CSRF-Token header. A malicious site can make your
//    browser send the cookie, but it can't read the token, so the server knows
//    the request came from this app.
import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

export type Agent = components["schemas"]["AgentResponse"];
export type AgentVersion = components["schemas"]["AgentVersionResponse"];
export type Account = components["schemas"]["AccountResponse"];
export type SessionRow = components["schemas"]["SessionWithEvaluationsResponse"];
export type Session = SessionRow["session"];
export type Evaluation = SessionRow["evaluations"][number];

// Kitaru's list filters, sent JSON-encoded in ?filter= (see docs/kitaru-ui-route-map.md).
export type Filter =
  | { field: string; op: "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "in" | "is_null" | "startswith" | "endswith" | "contains"; value?: unknown }
  | { and: Filter[] }
  | { or: Filter[] };

const CSRF_KEY = "evalve.csrf-token";

function readCsrf(): string | null {
  try {
    return localStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

function writeCsrf(token: string | null) {
  try {
    if (token) localStorage.setItem(CSRF_KEY, token);
    else localStorage.removeItem(CSRF_KEY);
  } catch {
    // Storage can be blocked (private windows). Login still works for this page load.
  }
}

const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    const token = readCsrf();
    if (token) request.headers.set("X-CSRF-Token", token);
    return request;
  },
};

// baseUrl "" = same origin. In dev, Vite forwards /api to Kitaru; in
// production, Caddy does.
// Kitaru expects ?filter= as a JSON string, so objects in the query are
// JSON-encoded; everything else is sent as plain query values.
function querySerializer(query: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}

export const api = createClient<paths>({ baseUrl: "", credentials: "same-origin", querySerializer });
api.use(csrfMiddleware);

export class UnauthorizedError extends Error {}

// Kitaru errors look like {"detail": "Field 'number' is not filterable"}.
function errorDetail(error: unknown): string | null {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  return typeof detail === "string" ? detail : null;
}

export async function login(username: string, password: string) {
  const body = new URLSearchParams({ username, password });
  const res = await fetch("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    credentials: "same-origin",
  });
  if (res.status === 401) throw new UnauthorizedError("Wrong username or password.");
  if (!res.ok) throw new Error(`Login failed (${res.status}).`);
  const data = (await res.json()) as { csrf_token?: string | null };
  writeCsrf(data.csrf_token ?? null);
}

export async function logout() {
  await api.POST("/api/v1/logout");
  writeCsrf(null);
}

export async function getCurrentAccount(): Promise<Account> {
  const { data, response } = await api.GET("/api/v1/accounts/me");
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (!data) throw new Error(`Could not load your account (${response.status}).`);
  return data;
}

export async function listAgents(): Promise<Agent[]> {
  const { data, response } = await api.GET("/api/v1/agents", { params: { query: { size: 50 } } });
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (!data) throw new Error(`Could not load agents (${response.status}).`);
  return data.items;
}

export async function getAgent(agentId: string): Promise<Agent> {
  const { data, response } = await api.GET("/api/v1/agents/{agent_id}", { params: { path: { agent_id: agentId } } });
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (!data) throw new Error(response.status === 404 ? "This agent does not exist." : `Could not load the agent (${response.status}).`);
  return data;
}

export async function listAgentVersions(agentId: string): Promise<AgentVersion[]> {
  const { data, response } = await api.GET("/api/v1/agents/{agent_id}/versions", {
    params: { path: { agent_id: agentId }, query: { size: 50 } },
  });
  if (!data) throw new Error(`Could not load versions (${response.status}).`);
  return data.items;
}

// One page of sessions with their evaluator verdicts (the UI-only endpoint).
export async function listSessionsPage(filter: Filter, cursor?: string | null) {
  const { data, error, response } = await api.GET("/api/v1/ui/sessions", {
    // The generated type describes one filter shape; ours is the full grammar.
    params: { query: { filter: filter as never, size: 50, cursor: cursor ?? undefined } },
  });
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (!data) throw new Error(errorDetail(error) ?? `Could not load sessions (${response.status}).`);
  return data;
}

// ---- Experiments ----------------------------------------------------------

export type Experiment = components["schemas"]["ExperimentResponse"];
export type ExperimentRun = components["schemas"]["ExperimentRunResponse"];
export type EvalAggregate = components["schemas"]["EvaluationAggregateResponse"];
export type Replay = components["schemas"]["ReplayResponse"];
export type Cohort = components["schemas"]["CohortResponse"];

async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>, what: string): Promise<T> {
  const { data, error, response } = await p;
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (data === undefined) throw new Error(errorDetail(error) ?? `Could not load ${what} (${response.status}).`);
  return data;
}

export async function listExperiments(agentId: string) {
  const page = await unwrap(
    api.GET("/api/v1/experiments", { params: { query: { filter: { field: "agent_id", op: "eq", value: agentId } as never, size: 200 } } }),
    "experiments",
  );
  return page.items;
}

export async function getExperiment(experimentId: string) {
  return unwrap(api.GET("/api/v1/experiments/{experiment_id}", { params: { path: { experiment_id: experimentId } } }), "the experiment");
}

// Runs for one or many experiments, newest first.
export async function listExperimentRuns(experimentIds: string[]) {
  if (experimentIds.length === 0) return [];
  const filter: Filter = { field: "experiment_id", op: "in", value: experimentIds };
  const runs: ExperimentRun[] = [];
  let cursor: string | undefined;
  do {
    const page = await unwrap(api.GET("/api/v1/experiment-runs", { params: { query: { filter: filter as never, size: 200, cursor } } }), "runs");
    runs.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return runs.sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""));
}

export async function getRunAggregates(runId: string) {
  return unwrap(
    api.GET("/api/v1/ui/experiment-runs/{experiment_run_id}/evaluation-aggregates", { params: { path: { experiment_run_id: runId } } }),
    "results",
  );
}

export async function listRunReplays(runId: string) {
  const filter: Filter = { field: "experiment_run_id", op: "eq", value: runId };
  const page = await unwrap(api.GET("/api/v1/replays", { params: { query: { filter: filter as never, size: 1000 } } }), "replays");
  return page.items;
}

export async function listCohorts(agentId: string) {
  const filter: Filter = { field: "agent_id", op: "eq", value: agentId };
  const page = await unwrap(api.GET("/api/v1/cohorts", { params: { query: { filter: filter as never, size: 50 } } }), "cohorts");
  return page.items;
}

export async function listCohortVersions(cohortId: string) {
  const page = await unwrap(
    api.GET("/api/v1/cohorts/{cohort_id}/versions", { params: { path: { cohort_id: cohortId }, query: { size: 50 } } }),
    "cohort versions",
  );
  return page.items;
}

// Sessions in a cohort version (the baseline sessions an experiment replays).
export async function listCohortSessions(cohortVersionId: string) {
  const filter: Filter = { field: "cohort_version_id", op: "eq", value: cohortVersionId };
  const page = await unwrap(api.GET("/api/v1/ui/sessions", { params: { query: { filter: filter as never, size: 1000 } } }), "cohort sessions");
  return page.items;
}

// Starts a new run of an experiment. This replays every session in the cohort
// and calls the model, so it costs money.
export async function startExperimentRun(experimentId: string, cohortVersionId: string, agentVersionId: string) {
  return unwrap(
    api.POST("/api/v1/experiments/{experiment_id}/runs", {
      params: { path: { experiment_id: experimentId } },
      body: { cohort_version_id: cohortVersionId, agent_version_id: agentVersionId, evaluate_baselines: true, baseline_evaluation_mode: "if_missing" },
    }),
    "a new run",
  );
}

// ---- Evaluators -----------------------------------------------------------

export type Evaluator = components["schemas"]["EvaluatorResponse"];

export async function listEvaluators() {
  const page = await unwrap(api.GET("/api/v1/evaluators", { params: { query: { size: 100 } } }), "evaluators");
  return page.items;
}

// ---- Session detail -------------------------------------------------------

export type SessionDetail = components["schemas"]["SessionDetailResponse"];
export type SessionNode = components["schemas"]["SessionNodeResponse"];
export type SessionEvaluation = components["schemas"]["EvaluationResponse"];

export async function getSession(sessionId: string) {
  return unwrap(api.GET("/api/v1/sessions/{session_id}", { params: { path: { session_id: sessionId } } }), "the session");
}

// Every step of a session (model calls, tool calls, spans) in start order,
// with what went in and what came out.
export async function listSessionNodes(sessionId: string) {
  const page = await unwrap(
    api.GET("/api/v1/sessions/{session_id}/nodes", { params: { path: { session_id: sessionId }, query: { size: 1000, include_payloads: true } } }),
    "the session's steps",
  );
  return page.items;
}

export async function listSessionEvaluations(sessionId: string) {
  const filter: Filter = { field: "session_id", op: "eq", value: sessionId };
  const page = await unwrap(api.GET("/api/v1/evaluations", { params: { query: { filter: filter as never, size: 200 } } }), "verdicts");
  return page.items;
}

// The replay that produced this session, or null for a recorded or imported one.
export async function getReplayForSession(sessionId: string): Promise<Replay | null> {
  const filter: Filter = { field: "result_session_id", op: "eq", value: sessionId };
  const page = await unwrap(api.GET("/api/v1/replays", { params: { query: { filter: filter as never, size: 1 } } }), "the replay");
  return page.items[0] ?? null;
}

export async function getExperimentRun(runId: string) {
  return unwrap(api.GET("/api/v1/experiment-runs/{experiment_run_id}", { params: { path: { experiment_run_id: runId } } }), "the run");
}
