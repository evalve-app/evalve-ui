# What the Kitaru MCP 0.27.6 offers

Research for [#56](https://github.com/evalve-app/evalve-ui/issues/56), part of the map [#55 Evalve MCP v1](https://github.com/evalve-app/evalve-ui/issues/55).

## Answer

`kitaru-mcp` 0.27.6 has 17 tools. They give typed, one-call access to Kitaru objects: Experiments, runs, Cohorts, Evaluators, sessions, jobs, workers and investigations. It has no idea of a Loop. It does not group Experiments, read the Loop settings line, compute a Loop status or a pass rate, wait for a run, or change agent code. So the Evalve MCP should add Loop-level tools only, and leave every per-object read and write to the Kitaru MCP.

## Sources

All paths are in the Kitaru repo at tag `python/kitaru/v0.27.6` (`pyproject.toml:3` says `version = "0.27.6"`; `pyproject.toml:96` maps the `kitaru-mcp` script). Read with `git show python/kitaru/v0.27.6:<path>`.

- Tool list, modes and descriptions: `src/kitaru/mcp/registry.py`.
- Inputs: `src/kitaru/mcp/models/*.py`.
- Outputs: `src/kitaru/mcp/models/common.py`.
- Handlers: `src/kitaru/mcp/tools/*.py`.
- HTTP calls: `src/kitaru/client/resources/*.py`.
- User docs: `docs/book/agent-native/setup.md`.

## How the server runs

- **Local stdio only.** `main` parses flags and runs `run_stdio` (`server.py:69-78`, `server.py:98-116`). There is no HTTP transport.
- **One fixed server and one key.** The target is `--server`, then `KITARU_MCP_SERVER`, then `KITARU_API_URL` (`settings.py:60-74`). Startup fails without one (`connection.py:41-46`). The key is `KITARU_API_KEY`, else the stored CLI credential for that URL (`connection.py:48-53`). A task token `KITARU_API_TOKEN` is ignored (`setup.md:51`). The server does not follow the CLI's current selection (`setup.md:47`).
- **Capability modes.** `read-only` (default), `standard`, `destructive` (`settings.py:14-32`). A tool above the mode is not registered, so the agent does not see it (`registry.py:466-468`; `setup.md:55`). `kitaru setup` registers it in `standard` (`setup.md:16`).
- **Bounds.** Each call has a 120 s handler timeout and at most 10 calls run at once (`settings.py:35-37`, `lifecycle.py:20-48`). The HTTP client does no retries (`server.py:92`). Lists return one page of at most 100 items with an opaque cursor (`models/common.py:52-75`).
- **One result shape.** Every tool returns `{schema_version: "1", ok, data, warnings, error}` (`models/common.py:88-95`). Errors carry `code`, `message`, `retryable`, `details`, `recovery` (`models/common.py:78-85`). Some reads add a dashboard `inspect` or `review` link (`models/common.py:162`, `:177`).
- **Starts return at once.** Starting a run or an import does not wait or poll (`tools/workflow_start.py:135`, `tools/workflows.py:22`). The docs say skills use the CLI for "waiting for a job" (`setup.md:154`).

## The tools

Each tool takes one `request` object. Its `operation` field (or `kind`) picks the action. "Mode" is the lowest mode that shows the tool.

### Read tools (mode `read-only`)

| Tool | Operations and inputs | Output | Kitaru API calls |
| --- | --- | --- | --- |
| `kitaru_registry_read` | `list` a `kind` (agent, analyzer, cohort, experiment, importer, evaluator, tag, worker) with `filter`, `cursor`, `size`, `sort`; `get` a parent by UUID or exact name; `list_versions` of agent, cohort, importer, evaluator or analyzer; `get_version` (agent and cohort by `version_id`; plugins by parent and number); `get_worker` by UUID (`models/registry.py:15-77`) | One item or one page of agents, Cohorts, Experiments, Evaluators, analyzers, importers, their versions, tags or workers (`models/common.py:111-131`) | `GET /api/v1/{agents,cohorts,experiments,importers,evaluators,analyzers,tags,workers}`, `GET …/{id}`, `GET …/{id}/versions`, `GET …/{id}/versions/{n}`, `GET /api/v1/{agent,cohort}-versions/{id}`, `GET /api/v1/workers/{id}` (`tools/registry.py:39-137`; e.g. `client/resources/experiments.py:88,109`, `workers.py:117,137`) |
| `kitaru_activity_read` | `list` or `get` a `kind`: session, replay, import, evaluation, experiment_run, job; `list_children` of `session_nodes` (with `include_payloads`), `experiment_run_jobs` or `job_tasks` (`models/activity.py:14-64`) | One item or one page of sessions, replays, imports, evaluations, runs, jobs, session nodes or tasks. Session and run reads add an `inspect` link (`models/common.py:145-162`; `tools/activity.py:39-79`) | `GET /api/v1/{sessions,replays,imports,evaluations,experiment-runs,jobs}[/{id}]`, `GET /api/v1/sessions/{id}/nodes`, `GET /api/v1/experiment-runs/{id}/jobs`, `GET /api/v1/jobs/{id}/tasks`, plus `GET /api/v1/info` for the link (`tools/activity.py:34-129`; `client/resources/experiment_runs.py:58,105,160`; `links.py:37`) |
| `kitaru_review_read` | `list` or `get` an investigation, annotation or insight; `list_sessions` of one investigation (`models/review.py:27-58`) | One item or one page; investigation reads add a `review` link (`models/common.py:165-177`) | `GET /api/v1/{investigations,annotations,insights}[/{id}]`, `GET /api/v1/investigations/{id}/sessions` (`tools/review.py:51-108`; `client/resources/investigations.py:88,110,192`) |
| `kitaru_connection_read` | `list` (optional `provider`) or `get` by UUID or name (`models/connections.py:15-32`) | Connections without secret values (`registry.py:152`) | `GET /api/v1/connections[/{id}]` (`tools/connections.py:27-39`; `client/resources/connections.py:82,104`) |
| `kitaru_docs_search` | `query` (2–240 chars), `limit` 1–8 (`models/docs.py:11-15`) | Matches with title, heading, excerpt, URL, and the docs revision (`models/docs.py:18-37`) | None. It searches a bundled index (`tools/docs.py:104-150`) |
| `kitaru_failure_matrix` | Session `filter` (for example `cohort_version_id` or `experiment_run_id`), optional `compare_filter`, `state_by`, `state_map`, `sources`, `max_sessions` ≤ 500 (`models/failure_matrix.py:29-75`) | A matrix of "last step right → first step wrong" with counts per group, a `snapshot_id`, and an MCP App view (`models/failure_matrix.py:137-182`; `registry.py:376-383`) | Pages of `GET /api/v1/sessions`, session nodes, annotations and evaluations (`tools/failure_matrix.py:174-216`) |
| `kitaru_failure_matrix_cell` | Same as the matrix plus `snapshot_id`, `from_state`, `to_state`, `side`, `limit` (`models/failure_matrix.py:78-90`) | Sessions and repeated notes for one cell (`models/failure_matrix.py:149-176`) | Reuses the snapshot, else the same reads. Only the matrix view calls it; hosts hide it from the agent (`registry.py:384-392`) |

### Write tools (mode `standard`)

| Tool | Operations and inputs | Output | Kitaru API calls |
| --- | --- | --- | --- |
| `kitaru_cohorts_manage` | `create` (agent_id, name, description, metadata); `update`; `create_version` (cohort_id, `baseline_id`, `add_session_ids`, `remove_session_ids`, `display_version`); `update_version` label (`models/management.py:24-114`) | Cohort or Cohort version (`models/common.py:201-204`) | `POST /api/v1/cohorts`, `PATCH /api/v1/cohorts/{id}`, `POST /api/v1/cohorts/{id}/versions`, `PATCH /api/v1/cohort-versions/{id}` (`tools/cohorts.py:20-60`; `client/resources/cohorts.py:69,150,192`; `cohort_versions.py:76`) |
| `kitaru_experiments_manage` | `create` (agent_id, name, description, `override`, `tool_policy`, 1–10 `evaluators` as `{evaluator_id, version, params}`); `update` the same fields (`models/management.py:16-175`) | Experiment (`models/common.py:207-210`) | Resolves each Evaluator version (`GET /api/v1/evaluators/{id}` and `…/versions/{n}`), then `POST /api/v1/experiments` or `PATCH /api/v1/experiments/{id}` (`tools/experiments.py:18-55`; `tools/evaluator_resolution.py:25-47`; `client/resources/experiments.py:68,149`) |
| `kitaru_workflow_start` | `experiment_run`: experiment_id, cohort_version_id, agent_version_id, `baseline_evaluation_mode` (none, if_missing, force). `evaluation`: up to 100 session × Evaluator pairs (`models/workflows.py:37-76`) | A receipt with the new run, or the queued evaluation job (`models/common.py:252-283`) | `POST /api/v1/experiments/{id}/runs` or `POST /api/v1/evaluations` (`tools/workflow_start.py:17-68`; `client/resources/experiments.py:191`; `evaluations.py:63`) |
| `kitaru_evaluators_manage` | `create`, `update`, `create_version` from an uploaded blob script or an exactly pinned package, `update_version` label (`models/evaluators.py:20-134`) | Evaluator or Evaluator version (`models/common.py:213-216`) | `POST/PATCH /api/v1/evaluators[/{id}]`, `POST /api/v1/evaluators/{id}/versions`, `PATCH …/versions/{n}`, and `GET /api/v1/blobs/{id}` to check the blob (`tools/evaluators.py:23-70`) |
| `kitaru_analyzers_manage` | Same shape as Evaluators, for analyzers (`models/analyzers.py:20-134`) | Analyzer or analyzer version (`models/common.py:219-222`) | `/api/v1/analyzers…` (`tools/analyzers.py:23-70`) |
| `kitaru_session_import` | `source` (an uploaded blob or a provider API query), importer_id, importer_version, agent_version_id, params, Evaluators, analyzers, `max_sessions` (`models/workflows.py:20-34`) | A receipt with the import id and its queued job (`models/common.py:225-249`) | `GET` blob, importer version, importer, agent version; `POST /api/v1/imports`; `GET /api/v1/jobs/{id}` (`tools/workflows.py:19-63`) |
| `kitaru_review_manage` | Create or update investigations, set a session verdict, create insights, create or update annotations, answer a question, create, rename or link tags (`models/review.py:61-240`) | The changed item (`models/common.py:180-186`) | `/api/v1/investigations…`, `/api/v1/insights…`, `/api/v1/annotations…`, `/api/v1/tags…` (`tools/review.py:111-214`) |
| `kitaru_connections_manage` | `create`, `update`, `set_default` (`models/connections.py:35-79`) | Connection (`models/common.py:195-198`) | `POST /api/v1/connections`, `PATCH /api/v1/connections/{id}` (`tools/connections.py:42-66`) |

### Destructive tools (mode `destructive`)

| Tool | Inputs | Output | Kitaru API calls |
| --- | --- | --- | --- |
| `kitaru_workflow_cancel` | `job` or `experiment_run` with an `id` (`models/workflows.py:79-96`) | Receipt with `cancellation_requested: true` and the job or run (`models/common.py:286-298`) | `POST /api/v1/jobs/{id}/cancel` or `POST /api/v1/experiment-runs/{id}/cancel` (`tools/destructive.py:15-28`; `client/resources/jobs.py:148`; `experiment_runs.py:202`) |
| `kitaru_delete` | One `kind` and `id`: cohort, cohort_version, connection, experiment, experiment_run, insight, investigation, annotation, evaluator, tag; or one tag link (`models/workflows.py:99-118`; `models/common.py:301-312`) | Delete receipt (`models/common.py:315-336`) | `DELETE` on the matching `/api/v1/…/{id}` (`tools/destructive.py:31-64`) |

Writes take an optional `idempotency_key`, so a retry after a lost response does not act twice (`models/common.py:45-49`). Imports dedupe by domain only (`models/common.py:229`).

## What a Kitaru experiment can change

An Experiment holds an `override` and a `tool_policy` (`api_models/v1/experiment.py:64-79`). The override can change only the model, system prompt, prompt and model parameters (`api_models/v1/replay_config.py:51-61`). A code change needs a new agent version. The Kitaru MCP can read agent versions but cannot create agents or agent versions; no tool calls `agents.create` or `agents.create_version` (`registry.py:340-463`).

## Coverage of Loop needs

One Loop Experiment is one Kitaru experiment, and one run is one Kitaru experiment run (`docs/loop-contract.md:7`; `GLOSSARY.md`).

| Need | Covered? | How, or what is missing |
| --- | --- | --- |
| Create or update an Experiment | Yes | `kitaru_experiments_manage` |
| List or read Experiments | Yes | `kitaru_registry_read` kind `experiment` |
| Start a run | Yes | `kitaru_workflow_start` `experiment_run` |
| Read a run (status, progress counts, error) | Yes | `kitaru_activity_read` kind `experiment_run`. Gives `status` and `progress` (pending, evaluating, completed, failed, canceled, total) (`api_models/v1/experiment_run.py:37-55`, `:96-119`) |
| A run's Evaluator results per case | Partly | List `evaluation` and `replay` records with a filter, one page of ≤ 100 at a time. The `GET /api/v1/experiment-runs/{id}/evaluation-aggregates` endpoint exists in the client (`client/resources/experiment_runs.py:62-86`) but no tool calls it |
| Cancel a run | Yes, `destructive` mode only | `kitaru_workflow_cancel` |
| Cohorts and Cohort versions | Yes | `kitaru_cohorts_manage`, `kitaru_registry_read` |
| Evaluators and versions | Yes, except upload | `kitaru_evaluators_manage` needs a blob that already exists. Blob upload is not a tool (`setup.md:154`) |
| Workers | Read only | `list` and `get_worker` show `live` and `last_seen_at`. Registration, task assignment, credentials and lifecycle stay outside MCP (`setup.md:92`; `api_models/v1/worker.py:183-192`) |
| Jobs | Read and cancel | `kitaru_activity_read` kind `job`, `job_tasks`; cancel needs `destructive` |
| Sessions | Read and import | `kitaru_activity_read` kind `session`, `session_nodes`; `kitaru_session_import` from a blob or provider API |
| Investigations | Yes | `kitaru_review_read`, `kitaru_review_manage` |
| Waiting for a run or job | No | Starts return at once. No progress or wait tool. The agent must poll `kitaru_activity_read` |
| Single-session replay | No | Only through the Python client or CLI (`setup.md:171-172`) |
| Agents and agent versions (write) | No | Read only |
| A Loop: group Experiments, read `Loop settings:` or `Evalve loop:` lines, Loop status | No | Kitaru has no Loop (`docs/loop-contract.md:3`). Today the dashboard does this in `src/lib/loops.ts` |
| Pass rate, Mixed, Got worse, Winning or Best experiment | No | Computed by `src/lib/loopRules.ts` and `loopResults.ts`, not by Kitaru |
| Start, follow, cancel or approve a whole Loop | No | Kitaru has no Loop runner |
| The winning change as a diff or PR | No | An override is not a code diff, and the Kitaru MCP cannot write agent code |

## What this means for the Evalve MCP

- Do not add tools that read or write one Experiment, run, Cohort, Evaluator, session, job or worker. The Kitaru MCP already does this, with typed inputs, idempotency keys and capability modes.
- Add Loop-level tools: list Loops, Loop status, Loop results, Loop setup, start, follow and cancel a Loop. These sit on the Evalve service, not on Kitaru.
- Return Kitaru ids (Experiment, run, Cohort version, session) in Loop results, so the agent can drill down with the Kitaru MCP.
- Name tools with an `evalve_` prefix. The Kitaru tools all use `kitaru_` (`registry.py:340-463`).
- Copy the Kitaru habits that work for agents: one `request` object with an `operation` field, one result envelope, one page of at most 100 items, an idempotency key on writes, and capability modes so read-only is the default.

## Version note

The locally configured `kitaru-mcp` is 0.27.2 (`kitaru-0.27.2.dist-info`). Its `kitaru/mcp` package differs from the 0.27.6 tag only in the bundled docs index and two type annotations (`models/common.py:142`, `server.py:10,41`). The tool set and schemas are the same. In `standard` mode the live server shows 14 tools: the 17 above minus `kitaru_workflow_cancel` and `kitaru_delete` (destructive) and `kitaru_failure_matrix_cell` (hidden, app only).

The tool table in `setup.md:57-74` lists 16 tools. It leaves out `kitaru_analyzers_manage`, which `registry.py:435-441` registers in `standard` mode.
