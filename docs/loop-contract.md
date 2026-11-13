# How the dashboard reads a Loop from Kitaru

Kitaru has no idea what a loop is. The source of truth is the `kitaru-loop` skill ([loop-skills](https://github.com/alyssa43/loop-skills)). The dashboard only reads what the skill leaves on the Kitaru server. It never creates experiments or runs for a loop.

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
- **The status** is **Completed** when a stop rule fires, **Canceled** when the latest run was canceled and there is no active run or completed result, or **Running** while the loop is awaiting a terminal result.

This logic is a port of `gate`, `round_score`, `plateau_check` and `decide` from the skill's `loop.py`, in `src/lib/loopRules.ts`. If one changes, change the other.

## What the dashboard can't see

- **Legacy metric gates and budget stops.** They need costs the dashboard doesn't load. Legacy runs with these limits need a published result to report completion.
- **A loop with no settings line.** The page lists its experiments and results. It uses the archived outcomes for `day-30-refunds` and the original `support-desk-demo` loop in `KNOWN_LOOPS` in `src/lib/loops.ts`. Published metadata takes precedence when available.
- **Evidence files** (`sessions/kitaru-loop/`, `results.md`). They stay on the machine that ran the loop.

## MVP and Post-MVP views

The separate `evalve-loop` runner writes `Evalve loop: {json}` and `Evalve result: {json}` on the control experiment. The dashboard reads the runner's result to show **Completed** for a winning streak, an attempt cap, or a budget stop. It uses `winner_lap` to mark the winning experiment.

The Loop tab has a switch, kept per browser (`src/lib/loopMode.tsx`). It changes how a loop is shown and what the New loop form asks for. It does not change the data.

- **Post-MVP** shows the skill's full rules: several trials per experiment, mean pass^k, the gate, and confirmation.
- **MVP** shows a plain pass rate and one Passed / Not passed result per experiment. On the loop page, the pass rate of an experiment is the share of cases that passed each gating evaluator in the first completed run of the experiment. The compare page still uses the share of case runs that passed, over every run of the experiment. Its New loop form asks for one number, the pass rate target, and writes a config with one trial per experiment and k = 1. With those settings mean pass^1 is the pass rate, so the same skill runs it.

