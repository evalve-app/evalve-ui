# Kitaru UI: route map

Captured Nov 10, 2026 from the bundled dashboard (kitaru-ui-v0.5.2) on a Kitaru server v0.27.6, by watching the network calls each page makes. Use this as context for a coding agent building a replacement dashboard.

Full API spec: `GET /openapi.json` on the server (99 paths, no login needed).

## Auth and request conventions

- **Login:** `POST /api/v1/login` with username and password. The response holds `access_token`, `token_type: bearer`, `expires_in` (3600 s) and `csrf_token`. The server also sets an auth cookie.
- **Two ways to authenticate.** (1) Cookie: the browser sends the auth cookie, and every call, GETs included, must also send `X-CSRF-Token: <csrf_token>` or the server answers 401 "Missing or invalid CSRF token". This is what the bundled UI does. (2) Header: send `Authorization: Bearer <access_token>`, and no CSRF token is needed, because a header can't ride along on a cross-site request (server: `adapters/auth/auth_service.py`, `resolve`). The bundled UI also sends `X-Kitaru-Client: kitaru-ui`.
- **On app load:** `GET /api/v1/info`, then `GET /api/v1/accounts/me`. If `/accounts/me` fails, send the user to `/login?next=<path>`.
- **Lists are paginated:** `?size=N`, and the response looks like `{ items: [...], next_cursor }`.
- **Filtering:** `?filter=` followed by URL-encoded JSON:
  - one condition: `{"field":"agent_id","op":"eq","value":"<id>"}`
  - a list: `{"field":"experiment_id","op":"in","value":["<id>","<id>"]}`
  - combined: `{"and":[{...},{"field":"investigation_session_id","op":"is_null"}]}`
- **Sorting:** `?sort=created:desc`.
- **CLI login handoff:** the server sends the browser to `{DASHBOARD_URL}/devices/verify?device_id=<id>&user_code=<code>`. That page calls `GET /api/v1/devices/{device_id}?user_code=<code>` and `POST /api/v1/devices/{device_id}/verify`.
- **Facts that `openapi.json` does not hold:** error detail texts and link formats are only in the Kitaru source (the `kitaru` Python package, checked at version 0.27.6). Look in `kitaru/server/domain/` for the error classes and their texts (for example `device.py`: "Device authorization has expired", "Device is locked"), and in `kitaru/server/adapters/rest/routers/` for the status of each error.

## Pages and the calls they make

Every page under an agent first calls `GET /agents/{agent_id}` and `GET /agents/{agent_id}/versions?size=50`. All paths below start with `/api/v1`.

| Page (UI route) | API calls |
| --- | --- |
| Agents list `/agents` | `GET /agents?size=50` |
| Sessions `/agents/{id}/sessions` | `GET /ui/sessions?filter={agent_id eq}&size=50` (a UI-only endpoint that includes evaluator verdict columns) |
| Session detail `/sessions/{session_id}` | `GET /sessions/{id}`, `GET /sessions/{id}/nodes?size=1000&include_payloads=true` (the timeline), `GET /evaluations?filter={session_id eq}`, `GET /replays?filter={result_session_id eq}`, `GET /annotations?filter={and: session_id eq, investigation_session_id is_null}` |
| Cohorts `/agents/{id}/cohorts` | `GET /cohorts?filter={agent_id eq}&size=50` |
| Experiments `/agents/{id}/experiments` | `GET /experiments?filter={agent_id eq}&size=200`, `GET /experiment-runs?filter={experiment_id in [...]}&size=200`, `GET /cohorts?filter={agent_id eq}`, `GET /cohorts/{cohort_id}/versions` |
| Experiment detail `/experiments/{experiment_id}?run=N` | `GET /experiments/{id}`, `GET /experiment-runs?filter={experiment_id eq}`, `GET /ui/sessions?filter={experiment_run_id eq}&size=1000` (the run's result sessions), `GET /ui/sessions?filter={cohort_version_id eq}&size=1000` (baseline sessions), `GET /replays?filter={experiment_run_id eq}&size=1000`, `GET /ui/experiment-runs/{run_id}/evaluation-aggregates`, `GET /evaluators?size=50` |
| New experiment `/agents/{id}/experiments/new` | Submitting calls `POST /experiments` (exact body not captured; check `/openapi.json`) |
| Run an experiment | `POST /experiments/{id}/runs` |
| Investigations `/agents/{id}/investigations` | `GET /investigations?filter={agent_id eq}&size=50`, `GET /investigations/{id}/sessions?size=1000` |
| Insights `/agents/{id}/insights` | `GET /insights?filter={agent_id eq}&sort=created:asc`, `GET /imports?filter={agent_id eq}&sort=created:desc`, `GET /sessions?filter={agent_id eq}&size=1` (has-sessions check), `GET /connections?size=100` |
| Evaluators `/evaluators` | `GET /evaluators?size=50` |

Not yet captured: Workers, Jobs, Compare runs, the New cohort and New investigation forms.

## Shapes that matter for the Loop tab

**An experiment** (`GET /experiments/{id}`). A loop lap would create one of these:

```json
{
  "id": "...", "name": "day-30-refunds-round-1", "description": "...",
  "agent_id": "...",
  "override": { "model": null, "system_prompt": "...", "prompt": null, "model_params": null },
  "tool_policy": {
    "default": { "type": "passthrough" },
    "tools": {
      "issue_refund": { "type": "static", "cases": [{ "match": null, "match_mode": "exact", "result": "Refund issued." }], "on_miss": "fail" },
      "lookup_order": { "type": "history", "scope": "baseline", "on_miss": "passthrough" }
    }
  },
  "evaluators": [{ "evaluator": "support-desk-action-correct", "version": 1, "params": { "expected": { "refund-01": "issue_refund" } }, "connection_id": null }]
}
```

`override` maps to the Loop form's "what the AI may change" checkboxes: system prompt, input prompt, model, model params.

**Evaluation aggregates** (`GET /ui/experiment-runs/{run_id}/evaluation-aggregates`). This drives the results page. It returns one entry per evaluator:

```json
{
  "name": "action_correct", "evaluator_name": "support-desk-action-correct", "data_type": "bool",
  "baseline": { "count": 20, "mean": 0.9,  "pass_rate": 0.9 },
  "result":   { "count": 20, "mean": 0.95, "pass_rate": 0.95 },
  "replays": [ { "replay_id": "...", "baseline": { "passed": false }, "result": { "passed": true } } ]
}
```

Baseline vs result per replay is already here, so the stoplight row (red to green per case) needs no extra calls.
