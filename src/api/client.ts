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
export type Device = components["schemas"]["DeviceResponse"];
export type CohortVersion = components["schemas"]["CohortVersionResponse"];

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

// Every cohort of an agent. The server sends 50 for each call, so this
// follows next_cursor to the end.
export async function listCohorts(agentId: string) {
  const filter: Filter = { field: "agent_id", op: "eq", value: agentId };
  const cohorts: Cohort[] = [];
  let cursor: string | undefined;
  do {
    const page = await unwrap(api.GET("/api/v1/cohorts", { params: { query: { filter: filter as never, size: 50, cursor } } }), "cohorts");
    cohorts.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return cohorts;
}

// One cohort, or null when the server has no cohort with this id.
export async function getCohort(cohortId: string) {
  const { data, error, response } = await api.GET("/api/v1/cohorts/{cohort_id}", { params: { path: { cohort_id: cohortId } } });
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  // 422 is an id that is not a valid id, which no cohort can have.
  if (response.status === 404 || response.status === 422) return null;
  if (!data) throw new Error(errorDetail(error) ?? `Could not load the cohort (${response.status}).`);
  return data;
}

// Every version of a cohort. The server sends 50 for each call, so this
// follows next_cursor to the end.
export async function listCohortVersions(cohortId: string) {
  const versions: CohortVersion[] = [];
  let cursor: string | undefined;
  do {
    const page = await unwrap(
      api.GET("/api/v1/cohorts/{cohort_id}/versions", { params: { path: { cohort_id: cohortId }, query: { size: 50, cursor } } }),
      "cohort versions",
    );
    versions.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return versions;
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

// Every evaluator. The call asks for 100 and no caller has paging, so
// evaluator 101 does not show.
export async function listEvaluators() {
  const page = await unwrap(api.GET("/api/v1/evaluators", { params: { query: { size: 100 } } }), "evaluators");
  return page.items;
}

// ---- Investigations -------------------------------------------------------

export type Investigation = components["schemas"]["InvestigationResponse"];

// The investigations of one agent. The call asks for 100 and the tab has no
// paging, so investigation 101 does not show.
export async function listInvestigations(agentId: string) {
  const filter: Filter = { field: "agent_id", op: "eq", value: agentId };
  const page = await unwrap(api.GET("/api/v1/investigations", { params: { query: { filter: filter as never, size: 100 } } }), "investigations");
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

// A response that was not a success, with the reason the server gave. For a
// page that chooses its text from the status and the detail.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `HTTP ${status}`);
  }
}

async function unwrapOrApiError<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (data === undefined) throw new ApiError(response.status, errorDetail(error));
  return data;
}

// The device that asks to sign in. The server shows a device that no account
// approved yet only to a caller who has its user code.
export async function getDevice(deviceId: string, userCode: string): Promise<Device> {
  return unwrapOrApiError(api.GET("/api/v1/devices/{device_id}", { params: { path: { device_id: deviceId }, query: { user_code: userCode } } }));
}

// Approves the device for the signed-in account. The server calls this "verify".
export async function approveDevice(deviceId: string, userCode: string): Promise<Device> {
  return unwrapOrApiError(
    api.POST("/api/v1/devices/{device_id}/verify", { params: { path: { device_id: deviceId } }, body: { user_code: userCode, trusted: false } }),
  );
}

// ---- Workers --------------------------------------------------------------

export type Worker = components["schemas"]["WorkerResponse"];

// The live workers. The server leaves out workers past its liveness window,
// as Kitaru's own Workers page does. Follows next_cursor to the end.
export async function listWorkers(): Promise<Worker[]> {
  const workers: Worker[] = [];
  let cursor: string | undefined;
  do {
    const page = await unwrap(api.GET("/api/v1/workers", { params: { query: { size: 100, cursor } } }), "workers");
    workers.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return workers;
}

// ---- Jobs -----------------------------------------------------------------

export type Job = components["schemas"]["JobResponse"];
export type JobStatus = components["schemas"]["JobStatus"];
export type Task = components["schemas"]["TaskResponse"];

const JOBS_PAGE = 50;

// The 50 newest jobs, of one status or all. Only one page, as on Kitaru's own
// Jobs page.
export async function listJobs(status: JobStatus | null): Promise<Job[]> {
  const filter: Filter | undefined = status ? { field: "status", op: "eq", value: status } : undefined;
  const page = await unwrap(api.GET("/api/v1/jobs", { params: { query: { size: JOBS_PAGE, sort: "created:desc", filter: filter as never } } }), "jobs");
  return page.items;
}

// The 50 newest jobs behind one experiment run's replays, or null when no run
// has this id. 422 is an id that is not a valid id, which no run can have.
export async function listExperimentRunJobs(runId: string, status: JobStatus | null): Promise<Job[] | null> {
  const filter: Filter | undefined = status ? { field: "status", op: "eq", value: status } : undefined;
  const { data, error, response } = await api.GET("/api/v1/experiment-runs/{experiment_run_id}/jobs", {
    params: { path: { experiment_run_id: runId }, query: { size: JOBS_PAGE, sort: "created:desc", filter: filter as never } },
  });
  if (response.status === 401) throw new UnauthorizedError("Not signed in.");
  if (response.status === 404 || response.status === 422) return null;
  if (!data) throw new Error(errorDetail(error) ?? `Could not load jobs (${response.status}).`);
  return data.items;
}

// A job's tasks that failed, timed out or were abandoned (the first 50).
export async function listFailingTasks(jobId: string): Promise<Task[]> {
  const filter: Filter = {
    and: [
      { field: "job_id", op: "eq", value: jobId },
      { field: "status", op: "in", value: ["failed", "timed_out", "abandoned"] },
    ],
  };
  const page = await unwrap(api.GET("/api/v1/tasks", { params: { query: { size: 50, filter: filter as never } } }), "tasks");
  return page.items;
}

// ---- API keys -------------------------------------------------------------

export type ApiKey = components["schemas"]["ApiKeyResponse"];
// A new key together with its value. No later call gives the value again.
export type IssuedApiKey = components["schemas"]["ApiKeyIssuedResponse"];

// Every API key of the signed-in account, newest first. Follows next_cursor to
// the end.
export async function listApiKeys(): Promise<ApiKey[]> {
  const keys: ApiKey[] = [];
  let cursor: string | undefined;
  do {
    const page = await unwrap(api.GET("/api/v1/api-keys", { params: { query: { size: 100, sort: "created:desc", cursor } } }), "API keys");
    keys.push(...page.items);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  return keys;
}

// Creates an API key for the signed-in account. The answer carries the key
// value one time. Does not use `unwrap`, because the page chooses its text
// from the status (409 is a name that a key has already). A 401 throws an
// ApiError with status 401, and the page tells the person to sign in again.
export async function createApiKey(name: string): Promise<IssuedApiKey> {
  return unwrapOrApiError(api.POST("/api/v1/api-keys", { body: { name } }));
}

// Deletes an API key, so that it cannot sign in again. The page calls this
// "revoke". Does not use `unwrap`, because a success (204) has no body, and
// because the page chooses its text from the status (404 is a key that is
// gone). A 401 throws an ApiError with status 401, and the page tells the
// person to sign in again.
export async function deleteApiKey(apiKeyId: string): Promise<void> {
  const { error, response } = await api.DELETE("/api/v1/api-keys/{api_key_id}", { params: { path: { api_key_id: apiKeyId } } });
  if (!response.ok) throw new ApiError(response.status, errorDetail(error));
}
