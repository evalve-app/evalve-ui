# To do

Open work, in the order we planned it. The order follows what the Friday demo clicks on. See `HANDOFF.md` for the current state.

## Next

1. **Clickable cells in the loop grid and the experiment grid.** Clicking a case cell should open that session (`/sessions/:id`). A cell in a multi-run lap covers several sessions, so the plan is a small menu listing each run as passed or failed. With one run per lap, go straight to the session. The replays already loaded in `useLoop.ts` carry `baseline_session_id` and `result_session_id`.
2. **CLI login page** (`/devices/verify`). Needed before this app can replace the Kitaru UI. It calls `GET /api/v1/devices/{device_id}` and `POST /api/v1/devices/{device_id}/verify`.
3. **Evaluators, Workers, Jobs, Investigations.** Placeholders today. Build simple read-only lists, or hide them from the nav for the demo.

## Session page extras (Kitaru has these, we don't)

- Evaluations tab, Replays tab, Notes, Timeline view, Compare.
- "Add to cohort" and "Replay" buttons. These change data on the server.

## Cohort page

- Mark the sessions that a cohort version added or removed from the version before. The server gives no list of differences, so the page must load two versions and compare them.

## Loop

- Remove the `day-30-refunds` entry from `KNOWN_LOOPS` in `src/pages/agent/loop/useLoop.ts` once round 0 of a loop carries the `Loop settings:` line (needs the `loop.py` change in loop-skills to be committed and used).
- Port the budget stop and metric gates from the skill's `loop.py` to `src/lib/loopRules.ts`. Until then a loop the skill stopped on budget shows "Stopped early".
- Mockup ideas the skill has no setting for: a threshold per evaluator, a time limit, replaying passing sessions each lap.

## Deploy (Alyssa is handling this)

- Add the dashboard to `infra/bootstrap.sh.tftpl` in evalve-deploy. Today it is a patch on the running server and is lost if the EC2 instance is replaced. Changing the bootstrap replaces the instance, so do it when a short outage is fine.

## Not tested yet

- A real one-run-per-lap (MVP) loop on the Loop pages.
- "Run again" on the experiment page. It replays the cohort and calls the model, so it costs money.
- Session page: a failed session, a running session, and agents on a framework other than openai-agents.
