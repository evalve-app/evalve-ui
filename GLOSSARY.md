# Evalve dashboard

A dashboard for the Kitaru server that shows agents, their sessions, experiments, and loops. It reads what Kitaru and the `kitaru-loop` skill leave on the server.

## Language

### Sessions

**Recorded session**:
A session that the agent produced from real use, not from a replay. A cohort holds recorded sessions, and each one is a case.
_Avoid_: Baseline session, original session

**Case**:
One recorded session in a cohort, used as a test input. Grids show one column for each case.
_Avoid_: Test, example

**Replay**:
A session that re-runs one case, with or without a change. Its result session is the session that the replay produced.
_Avoid_: Re-run, rerun session

### Loops

**Loop**:
A set of experiments that the `kitaru-loop` skill runs to improve an agent, one change at a time.

**Lap**:
One experiment in a loop. Lap 0 is the baseline lap, and each later lap makes one change.
_Avoid_: Round (the skill's and the server's word; use it only when you name a server experiment)

**Baseline lap**:
Lap 0 of a loop. It replays the cohort with no change, and later laps are scored against it.
_Avoid_: Baseline (alone), baseline audit, round 0

**Run**:
One pass of an experiment over every case in the cohort. A lap can have several runs.
_Avoid_: Trial (a trial is a phase of a run, not the run itself)

**Phase**:
The role of a run inside a lap: screen, trial, or confirmation.

**Gating evaluator**:
An evaluator whose result decides if a case passed in a loop. A case passes a run only when it passes every gating evaluator.
_Avoid_: Gate evaluator, scoring evaluator

## Flagged ambiguities

- "Baseline" alone has three meanings in the code: the baseline lap, the recorded session (`baseline_session_id`), and the experiment grid's "Baseline" row, which scores the recorded session. Say "baseline lap" or "recorded session". Use "baseline" alone only where the context makes the meaning clear.
