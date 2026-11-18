# How the dashboard reads a Skill Loop from Kitaru

> **Frozen, read for Skill Loops only.** This page describes data that old loop skills left on Kitaru. No skill writes it any more: new Loops run on the Evalve backend. Don't add fields here. The `evalve-loop` source is kept at the loop-skills tag `evalve-loop-0.1.0`.

The dashboard shows two kinds of Loop:

- **A backend Loop.** The Evalve backend owns it and keeps its status, outcome, owner and spend. The dashboard shows what the backend says and calculates no Loop status (`src/lib/loopStatus.ts`).
- **A Skill Loop.** A loop skill (`kitaru-loop`, `experiment-loop`, or the retired `evalve-loop`) ran it on a Teammate's machine against Kitaru, with no state on the Evalve backend. The dashboard shows it read-only at `skill-loop/:slug`.

This page is about Skill Loops. Kitaru has no idea what a loop is. The source of truth is the loop skill ([loop-skills](https://github.com/evalve-app/loop-skills)). The dashboard only reads what the skill leaves on the Kitaru server. It never creates experiments or runs for a loop.

## What the skill writes

1. **One experiment per round**, named `<prefix>-round-0`, `<prefix>-round-1`, and so on. The dashboard groups experiments into loops by that prefix. The UI calls a round an experiment. Round 0 is the control experiment.
   The code names an experiment in a loop `lap`. The runner fields `lap`, `winner_lap`, and `laps` keep that name.
   The dashboard also reads experiments named `<prefix>-iteration-1`, `<prefix>-iteration-2`, and so on. Iterations count from 1, so iteration n is experiment n − 1 and iteration 1 is the control experiment. The older `support-desk-demo` loop used these names.
2. **Round 0 is the control experiment** (the skill calls it the baseline audit): no override, n trials per case.
3. **Every later round makes one change**, stored as the experiment's override. Its description starts `Round <n>: <the change>`, then `Hypothesis: …`.
4. **Round 0's description ends with one line, `Loop settings: {json}`.** It carries the rules from `kitaru-loop.json`: `name`, `criteria`, `allowed_changes`, `allowed_models` and `gate_evaluators`. `settings_line` in the skill's `loop.py` writes it.

## What the dashboard works out

- **Run phases**, from run order, the same way the skill does: round 0 runs are all trials. In later rounds run 1 is the screen (when `screen_first` is on), runs up to n are trials, and the next n are confirmation.
- **pass^k per case**, `C(c,k)/C(n,k)`, and the mean across the cohort on the selection trials.
- **The gate**: per-case floor, cohort target, no regression against round 0.
- **The status of a Skill Loop** is **Completed** when the `evalve-loop` runner published an end state in its `Evalve result` line (see below). Each other Skill Loop shows **No result**, in a muted tone. "No result" is not a Loop status. The dashboard calculates no Loop status, so it applies no stop rule of the skill and no time rule, and a Skill Loop page does not poll.

The scores are a port of `gate` and `round_score` from the skill's `loop.py`, in `src/lib/loopRules.ts`. If one changes, change the other.

## What the dashboard can't see

- **The outcome of a Skill Loop with no `Evalve result` line.** A Loop of the `kitaru-loop` skill publishes no result, so it shows No result. The page lists its experiments and results.
- **Evidence files** (`sessions/kitaru-loop/`, `results.md`). They stay on the machine that ran the loop.

## MVP and Post-MVP views

The separate `evalve-loop` runner writes `Evalve loop: {json}` and `Evalve result: {json}` on the control experiment. The dashboard reads the runner's end state to show **Completed** for a winning streak, an attempt cap, or a budget stop. It uses `winner_lap` to mark the winning experiment.

The `Evalve loop:` line of the control experiment also carries the setup of the loop: `name`, `agent_version_id`, `cohort_version_id`, `evaluators`, `allowed_changes`, `allowed_models`, `required_consecutive_greens`, `max_attempts` and `budget_usd`. `evaluators` is a list of strings in `name@version` form, and `budget_usd` is a decimal string (`description` in the runner's `loop.py`). `parseEvalveLoop` in `src/lib/loops.ts` reads these fields, and the setup card of the loop page shows them.

Every experiment of the runner, not just the control experiment, has an `Evalve loop:` line with `schema_version: 1`, `loop_id` and `lap`. The dashboard trusts the line only when `schema_version` is 1, and reads the setup from lap 0.

The runner rewrites one `Evalve result: {json}` line on the control experiment after each run it collects. It is the runner's own record of its decision.

The dashboard reads these fields, and only when `schema_version` is 1 and `loop_id` matches the `Evalve loop:` line:

| Field | Meaning |
| --- | --- |
| `status` | `running`, `stop_success`, `stop_attempt_cap` or `stop_budget` |
| `winner_lap` | the winning lap when `status` is `stop_success`, otherwise null |
| `reason` | why the loop stopped, or null. The page shows a default text when it is null |

The line also carries fields the dashboard doesn't read:

- `baseline_model` (nullable), the total `attempts`, and `recorded_cost_usd` and `accounted_cost_usd` as decimal strings.
- `laps`, one entry per lap: `lap`, `change`, `experiment_id`, `attempts`, `green`, `red`, `incomplete`, `green_streak` and `runs`.
- `runs`, one entry per run: `run_id`, `outcome` (`green`, `red` or `incomplete`), `passed`, `failed` and `unscored`.

The Skill Loop page remembers the browser's preferred results view (`src/lib/loopMode.tsx`). The MVP and Post-MVP views and their toggle are for Skill Loops only. A backend Loop shows the MVP view. The New Loop page does not read it: it has one form, for a Loop that the coding agent starts on the Evalve backend with the Evalve MCP.

- **Post-MVP** shows the skill's full rules: several trials per experiment, mean pass^k, the gate, and confirmation.
- **MVP** shows a plain pass rate and one Passed / Not passed result per experiment. On the loop page, the pass rate of an experiment is the share of cases that passed each gating evaluator in the first completed run of the experiment. The compare page uses the share of case runs that passed over every run of the experiment.

The New Loop page asks for the name, the hypothesis, the cohort version, the gating evaluators, what may change, the consecutive green runs, the maximum total runs and the Loop budget. The handoff prompt carries them as one JSON block with the field names of the Loop API (`max_runs`, not `max_attempts`). The coding agent finds the tool policy, the evaluator parameters, the allowed models, the agent version, the control model and the control cost estimate in the agent project, and starts the Loop with `evalve_loop_start`. The handoff prompt has no Loop rules and does not name the `evalve-loop` runner: the Evalve backend owns the rules.

