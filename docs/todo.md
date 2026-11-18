# To do

Open work, in the order we planned it. The order follows what the Friday demo clicks on. See `HANDOFF.md` for the current state.

## Next

1. ~~**Clickable cells in the loop grid and the experiment grid.** Clicking a case cell should open that session (`/sessions/:id`). A cell in a multi-run lap covers several sessions, so the plan is a small menu listing each run as passed or failed. With one run per lap, go straight to the session. The replays already loaded in `useLoop.ts` carry `baseline_session_id` and `result_session_id`.~~ Built (issue #2).
2. ~~**CLI login page** (`/devices/verify`). Needed before this app can replace the Kitaru UI. It calls `GET /api/v1/devices/{device_id}` and `POST /api/v1/devices/{device_id}/verify`.~~ Built. Not tested yet with a real `kitaru login`.
3. ~~**Evaluators, Workers, Jobs, Investigations.** Placeholders today. Build simple read-only lists, or hide them from the nav for the demo.~~ Done in #12: Evaluators and Investigations are read-only lists, and Workers and Jobs are hidden from the nav.

## Session page extras (Kitaru has these, we don't)

- Evaluations tab, Replays tab, Notes, Timeline view, Compare.
- "Add to cohort" and "Replay" buttons. These change data on the server.

## Evaluators, Investigations, Workers, Jobs

- Evaluator detail page with its versions. A row in the Evaluators list opens nothing today.
- Investigation page with its sessions and their verdicts.
- A count for each verdict (acceptable, problematic, uncertain) in the Investigations list. The list already shows how many sessions have a verdict ("Reviewed"), from `completed_sessions` and `total_sessions`. The split by verdict is not in the list response. It needs `GET /investigations/{id}/sessions` for each investigation.
- ~~Workers list.~~ Done in #31.
- ~~Jobs list.~~ Done in #33.
- Paging. The Evaluators page and the Investigations tab each load 100 items at most.

## Cohort page

- Mark the sessions that a cohort version added or removed from the version before. The server gives no list of differences, so the page must load two versions and compare them.

## Loop

- Mockup ideas the skill has no setting for: a threshold per evaluator, a time limit, replaying passing sessions each experiment.

### Loop page: later work (out of scope of #16)

- Start a loop from the dashboard: submit the New loop form, and the Approve, Run, and Cancel buttons from the hi-fi. Today the dashboard only reads a loop. The Approve and Cancel buttons are built as browser state (issue #42). The submit and the Run button are not built: the coding agent starts the Loop with the Evalve MCP, because only the agent project has the tool policy, the evaluator parameters and the allowed models (sc-266).
- ~~The setup card above the results.~~ Built, read-only (issue #40). The editable state on the New loop page is built (issue #41). The Approve flow is built (issue #42).
- Give the Post-MVP view and the compare page the glossary words. They still show "regression" and "trials".
- Cost in Final results. The server gives no cost for an experiment run.
- Cohorts with more than 50 cases. The server gives results for only the 50 most recent replays of a run, so this needs a server change. Today the count says "first 50 of N".
- Always load the control experiment together with the newest experiments. The loop page loads only the newest 20 experiments, so on a longer loop "was N of M" and the "Got worse" card do not show until the person shows the older experiments. The fix changes the gates of the Post-MVP view and the compare page, because they then compare with the baseline lap.
- A link from each added prompt line to the experiment that added it.
- "Export report" and "Other end states" from the hi-fi.
- Dark mode.

## Deploy (Alyssa is handling this)

- Add the dashboard to `infra/bootstrap.sh.tftpl` in evalve-deploy. Today it is a patch on the running server and is lost if the EC2 instance is replaced. Changing the bootstrap replaces the instance, so do it when a short outage is fine.

## Not tested yet

- The Settings page with the real server: the list of API keys, "Create key", "Copy key" and "Revoke". sc-240 checked them in a browser only with a mock API, because the Kitaru server did not answer. "Create key" and "Revoke" change data, so a person must check them by hand.
- The Approve, Get prompt and Copy prompt states of the New loop page, and the change to the Loop page when the Loop of the viewer shows in the Evalve backend (sc-266). The screenshot script does not click, so a person must check them by hand (issue #42).
- The setup card of the loop page with a real loop, and the `Evalve loop:` line of a real control experiment. Issue #40 checked the card only with a mock API, because the sign-in of the test account failed.
- A real one-run-per-experiment (MVP) loop on the Loop pages.
- The loop page in the MVP view (Results, Final results, Agent diff) with the real `day-30-refunds` loop. Issue #21 checked it only with a mock API, because the sign-in of the test account failed.
- The "Sign in again" dialog after a real sign-in ends (1 hour). Story sc-239 checked it only with a mock API, because the Kitaru server did not answer.
- "Run again" on the experiment page. It replays the cohort and calls the model, so it costs money.
- Session page: a failed session, a running session, and agents on a framework other than openai-agents.
