# How the dashboard reads a Loop from Kitaru

Kitaru has no idea what a loop is. The source of truth is the `kitaru-loop` skill ([loop-skills](https://github.com/alyssa43/loop-skills)). The dashboard only reads what the skill leaves on the Kitaru server. It never creates experiments or runs for a loop.

## What the skill writes

1. **One experiment per round**, named `<prefix>-round-0`, `<prefix>-round-1`, and so on. The dashboard groups experiments into loops by that prefix. The UI calls a round a lap.
2. **Round 0 is the baseline audit**: no override, n trials per case.
3. **Every later round makes one change**, stored as the experiment's override. Its description starts `Round <n>: <the change>`, then `Hypothesis: …`.
4. **Round 0's description ends with one line, `Loop settings: {json}`.** It carries the rules from `kitaru-loop.json`: `name`, `criteria`, `allowed_changes`, `allowed_models` and `gate_evaluators`. `settings_line` in the skill's `loop.py` writes it.

## What the dashboard works out

- **Run phases**, from run order, the same way the skill does: round 0 runs are all trials. In later rounds run 1 is the screen (when `screen_first` is on), runs up to n are trials, and the next n are confirmation.
- **pass^k per case**, `C(c,k)/C(n,k)`, and the mean across the cohort on the selection trials.
- **The gate**: per-case floor, cohort target, no regression against round 0.
- **The status**, one of three: **Running** (a run is in progress, or there was activity in the last 30 minutes), **Completed** (a stop rule fired: a lap passed and confirmed, the plateau rule, or the lap cap), or **Stopped early** (it went quiet and no stop rule fired).

This logic is a port of `gate`, `round_score`, `plateau_check` and `decide` from the skill's `loop.py`, in `src/lib/loopRules.ts`. If one changes, change the other.

## What the dashboard can't see

- **Metric gates and the budget stop.** They need costs the dashboard doesn't load, so a loop the skill stopped on budget shows as "Stopped early".
- **A loop with no settings line** (run before the skill wrote one). The page lists its laps and results but can't score them. The one exception is `day-30-refunds`: its rules and final status are hard-coded in `KNOWN_LOOPS` in `src/pages/agent/loop/useLoop.ts`. Remove that entry once its round 0 carries the line.
- **Evidence files** (`sessions/kitaru-loop/`, `results.md`). They stay on the machine that ran the loop.

## MVP and Post-MVP views

The Loop tab has a switch, kept per browser (`src/lib/loopMode.tsx`). It changes how a loop is shown and what the New loop form asks for. It does not change the data.

- **Post-MVP** shows the skill's full rules: several trials per lap, mean pass^k, the gate, and confirmation.
- **MVP** shows a plain pass rate (the share of case runs that passed, over every run of the lap) and one Passed / Not passed result per lap. Its New loop form asks for one number, the pass rate target, and writes a config with one trial per lap and k = 1. With those settings mean pass^1 is the pass rate, so the same skill runs it.

