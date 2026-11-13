# Handoff: evalve dashboard

Written Nov 11, 2026. This hands off **building the UI**. Alyssa is keeping deployment and how the app is served, so none of that is your job. Ask her about anything here.

## What this is

`evalve-ui` is our own dashboard for the Kitaru server. It replaces Kitaru's bundled UI and adds a **Loop** tab. It is a React app with no backend of its own: every page calls Kitaru's API directly.

Open work is listed in order in [docs/todo.md](docs/todo.md). Start there once you've read this.

## Get the code and run it

The repo is https://github.com/evalve-app/evalve-ui (private, in the team org). `main` is the only branch so far.

```
git clone https://github.com/evalve-app/evalve-ui.git
cd evalve-ui
npm install
npm run dev
```

Open http://localhost:5173 and sign in with your Kitaru account. The dev server forwards `/api` to the team Kitaru server (`https://34-196-198-190.sslip.io`). To point at another server, copy `.env.example` to `.env`.

Useful checks: `npm test` (Vitest unit tests), `npm run typecheck` and `npm run build`.

## Deployment is not part of this handoff

Alyssa owns it. All you need is `npm run dev`.

A deployed copy exists at `https://dashboard.34-196-198-190.sslip.io`, but it only updates when Alyssa redeploys, so it is usually behind the code. Check your work on localhost, not there. Leave `scripts/deploy-dashboard.sh` and `scripts/remote-install.sh` alone.

## What's built

| Page | Route | Notes |
| --- | --- | --- |
| Sign in | `/login` | |
| Approve a device | `/devices/verify` | The page that `kitaru login` opens. A signed-in person approves the device, and then the CLI signs in. Not tested yet with a real `kitaru login` |
| Agents | `/agents` | Card grid and search. "New agent" gives a handoff prompt for a coding agent; it does not create anything |
| Sessions | `/agents/:id/sessions` | Server search, version filter, evaluator columns, load more. "New cohort" gives a handoff prompt; it does not create anything |
| Session detail | `/sessions/:id` | Steps on the left, detail on the right. A replay links back to its recorded session, experiment and loop |
| Investigations | `/agents/:id/investigations` | Read-only list: status, how many sessions have a verdict, last change. A row opens nothing. "New investigation" gives a handoff prompt; it does not create anything |
| Cohorts | `/agents/:id/cohorts` | Read-only list: newest version, session count, last change. A row opens the cohort page at `/cohorts/:cohortId?version=N`, which lists the sessions in one cohort version. "New cohort" gives a handoff prompt; it does not create anything |
| Experiments | `/agents/:id/experiments` | List, plus run results at `/experiments/:experimentId` |
| Loop | `/agents/:id/loop` | List, New loop form, the loop page (Results, Final results, Agent diff), compare experiments. See below |
| Evaluators | `/evaluators` | Read-only list of all evaluators: name, description, scope (one agent or all agents), latest version. Click a column header to sort. A row opens nothing. "New evaluator" gives a handoff prompt; it does not create anything |
| Workers | `/workers` | Read-only list of the live workers (the server leaves out workers that stopped sending heartbeats): status, claims, platform, last seen. Reloads every 15 s. Click a column header to sort. A row opens nothing |

**Placeholders (say "not built yet"):** Jobs. It is hidden from the nav. The route `/jobs` still exists.

**CLI login page:** `/devices/verify` is built. Alyssa needs it before the app can replace the Kitaru UI, so tell her. It is not tested yet with a real `kitaru login`.

The app is almost read-only. The only calls that change anything are sign in, sign out, "Approve device" on the CLI login page, and "Run again" on an experiment.

## The Loop tab

**The dashboard never runs a loop. It only reads one.** Loops are run by a coding agent using the `kitaru-loop` skill (https://github.com/alyssa43/loop-skills). The full contract is in [docs/loop-contract.md](docs/loop-contract.md). The short version:

- **A loop is a set of experiments** named `<prefix>-round-0`, `<prefix>-round-1`, and so on. The UI calls a round an "experiment". Round 0 is the control experiment, with no change. Each later experiment makes one change. The code names an experiment in a loop `lap`.
- **The New loop form does not submit anything.** It produces a prompt and a config. You paste the prompt into Claude Code in the agent's project, and the skill does the rest.
- **Three statuses:** Running, Completed, Stopped early.
- **The rules live in two places:** the skill's `loop.py` and our port in `src/lib/loopRules.ts`. If one changes, change the other.

### MVP and Post-MVP switch

The switch sits at the top right of the Loop pages. It is saved per browser and starts on MVP. It changes what is shown, not the data.

| | MVP | Post-MVP |
| --- | --- | --- |
| Score | Plain pass rate | Mean pass^k |
| Runs per experiment | 1 | Several trials, plus a confirmation round |
| New loop form | One number: the pass rate target | Trials, k, floor, confirmation, screen first |
| Loop page | Three sections: Results, Final results, Agent diff | Grid of experiments with compare checkboxes, four stat tiles, trend line |

MVP uses the same skill with one trial per experiment and k = 1, so no second runner is needed.

### The loop page in the MVP view

The page shows the header, then three sections in one column. Each section is one component in `src/pages/agent/loop/`. The text and the numbers come from `src/lib/loopResults.ts`.

| Section | Shows | When |
| --- | --- | --- |
| Results (`ResultsSection.tsx`) | One row for each experiment, one column for each gating evaluator, and a "Pass rate" column. The head shows the state of the loop, and a legend row is below it. A cell has one square for each case, across the completed runs of the experiment: passed every run, mixed, or failed every run. "Show runs" opens one row for each completed run, in the same columns. A square in a run row opens the result session of its replay. A square in an experiment row opens it only when the experiment has one completed run. A footer says what "Show runs" lists and names the status words | Always, when the loop has experiments |
| Final results (`FinalResultsSection.tsx`) | The title with a "Passed" or "Not passed" badge, one line with the outcome and the duration, one card for each gating evaluator, "Got worse", "Experiments", and the note "Nothing was changed in your agent" | A completed loop. A loop that did not pass shows its best experiment |
| Agent diff (`AgentDiffSection.tsx`) | The full system prompt as a diff from the agent's own prompt to the prompt of the winning experiment, "Copy diff" (the one primary button of the page), and what each experiment changed | A loop with a winning experiment |

- **The "before" prompt** comes from the first LLM step of the recorded session of the first case. If that session gives no prompt, the section shows the prompt of the winning experiment in full, with a "Copy prompt" button.
- **An experiment with several runs** shows each completed run in the Results table. Final results and Agent diff still use its first completed run.
- **The server gives results for only the 50 most recent replays of a run.** A cohort with more cases gets 50 squares, and the count says "first 50 of N".
- **The Post-MVP view and the compare page did not change.** The grid of experiments, the stat tiles, the trend line and the compare card are in `LapViews.tsx`.

### One hard-coded loop

`day-30-refunds` is the only real loop on the server. It ran before the skill saved its rules to the server, so its rules and its "Completed" status are hard-coded in `KNOWN_LOOPS` in `src/pages/agent/loop/useLoop.ts`. Remove the entry once a loop's round 0 carries the `Loop settings:` line.

## Things that will trip you up

- **Every API call needs the CSRF header.** `src/api/client.ts` adds it for you. A raw `fetch` without it gets a 401.
- **Sessions expire after 1 hour.** You get sent back to sign in.
- **"Run again" costs money.** It replays the whole cohort and calls the model. It has not been clicked yet.
- **Session number is not searchable on the server.** A `#371` search filters the rows already loaded.
- **Empty states have a preview switch.** Account menu (top right) → "Preview empty states". A pill in the top bar shows when it's on.
- **After a file changes, the browser console may show old Vite reload errors.** Reload the page before trusting them.

## Design rules

Fonts, colors and the logo come from the Evalve Design System (`src/design-system/`). Beyond that:

- Use tokens (`var(--…)`) only. No raw colors in `src/app.css`.
- Light mode is the default.
- One blue primary button per view. Orange is for the brand mark only.
- Flat cards with a border. No gradients.
- A status dot always sits next to a label, never alone.

## Where things are

| Path | What |
| --- | --- |
| `src/App.tsx` | Routes and the top bar |
| `src/api/client.ts` | Every Kitaru call the app makes |
| `src/pages/` | One file per page; `agent/loop/` is the Loop tab |
| `src/pages/agent/loop/useLoop.ts` | Loads one loop and works out the experiments of the loop (`laps`), scores and status |
| `src/lib/loopResults.ts` | What the three sections of the loop page show in the MVP view |
| `src/lib/loopRules.ts` | The skill's pass and stop rules, ported |
| `src/lib/sessionNodes.ts` | Turns a session's raw steps into readable ones |
| `docs/kitaru-ui-route-map.md` | Which API calls each Kitaru page makes. Use it when building a placeholder page |
| `scripts/build-tokens.mjs` | Regenerates `tokens.css` from `tokens.json` (`npm run gen:tokens`) |

## Not tested

- A real one-run-per-experiment (MVP) loop. None exists on the server yet.
- The three sections of the loop page with real data. They were checked in a browser only with a mock API.
- "Run again" on an experiment.
- Session page: a failed session, a running session, and agents not built on openai-agents. Anything it can't read as text falls back to raw JSON.
- The budget stop and metric gates are not ported, so a loop stopped on budget shows "Stopped early".

## Loose ends outside this folder (Alyssa's, listed so you know they exist)

- **loop-skills:** `kitaru-loop/scripts/loop.py` has an uncommitted change that makes round 0 save the loop's rules to the server (`settings_line`). It compiles but has not run in a real loop. Alyssa needs to review and commit it.
- **Kitaru server:** an unused tag `loop-day-30-refunds` is left over from an earlier approach. It is harmless.
