# Evalve dashboard

A dashboard for the Kitaru server that shows agents, their sessions, experiments, and loops. It reads what Kitaru and the `kitaru-loop` skill leave on the server.

## Language

### Sessions

**Recorded session**:
A session that the agent produced from real use, not from a replay. A cohort holds recorded sessions, and each one is a case.
_Avoid_: Baseline session, original session

**Case**:
One recorded session in a cohort, used as a test input. Grids show one column for each case. Say "case" where an experiment or a loop replays the session. Say "session" where a page lists what a cohort holds.
_Avoid_: Test, example

**Replay**:
A session that re-runs one case, with or without a change. Its result session is the session that the replay produced.
_Avoid_: Re-run, rerun session

### Investigations

**Investigation**:
A named set of one agent's sessions that a person reviews one at a time. The person gives each session a verdict: acceptable, problematic, or uncertain.
_Avoid_: Review, audit

### Cohorts

**Cohort**:
A named set of recorded sessions for one agent, kept as numbered versions. An experiment replays a cohort version, not the cohort itself.
_Avoid_: Dataset, test set

**Cohort version**:
One fixed set of recorded sessions in a cohort. Adding or removing a session makes a new version. Its sessions are the cases.
_Avoid_: Snapshot, revision

### Evaluators

**Evaluator**:
A named check that scores one session and gives a result for it. Evaluators are kept as numbered versions. An experiment names the evaluators that score its replays.
_Avoid_: Judge, grader, metric

### Experiments

**Experiment**:
One replay of a cohort version with a named set of evaluators, with or without a change to the agent. An experiment has one or more runs. A loop is a set of experiments.
_Avoid_: Lap, round, iteration (use "round" and "iteration" only when you name a server experiment)

**Run**:
One pass of an experiment over every session in its cohort version. Each of these sessions is a case. The run makes one replay for each session, and the evaluators of the experiment score each replay. An experiment can have several runs.
_Avoid_: Trial (a trial is a phase of a run, not the run itself)

**Phase**:
The role of a run inside an experiment: screen, trial, or confirmation.

**Pass rate**:
The share of cases that passed. For a run, a case passed when it passed every gating evaluator in that run. For an experiment, a case passed when it passed in every completed run of the experiment.
_Avoid_: Score, success rate

**Mixed**:
A case is mixed in an experiment when it passed in some runs of the experiment and failed in others.
_Avoid_: Flaky, unstable

### Loops

**Loop**:
A set of experiments, run one after the other to improve an agent, one change at a time.

**Loop status**:
The state of a loop that the dashboard shows: Running, Completed, Canceled, Stopped, or Failed. The server keeps no loop status. The dashboard calculates it.

**Completed**:
The loop reached a stop rule. A completed loop passed or did not pass.
_Avoid_: Finished, stopped, failed (for a loop that did not pass)

**Canceled**:
A person canceled the newest run of the loop, and the loop has no stop result.
_Avoid_: Stopped

**Stopped**:
The loop has no stop result and no activity for 10 minutes, and its newest run did not fail. The status goes back to Running if a new run starts.
_Avoid_: Stopped early, canceled, timed out

**Failed**:
The loop has no stop result and no activity for 10 minutes, and its newest run failed. The status goes back to Running if a new run starts.
_Avoid_: "Failed" for a loop that did not pass

**Control experiment**:
The experiment of a loop that replays the cohort with no change. Later experiments are scored against it. It has no number.
_Avoid_: Baseline lap, baseline (alone), baseline audit, round 0, control group, experiment 0

**Gating evaluator**:
An evaluator whose result decides if a case passed in a loop. A case passes a run only when it passes every gating evaluator.
_Avoid_: Gate evaluator, scoring evaluator

**Winning experiment**:
The experiment that made the loop pass. A loop that did not pass has no winning experiment. The control experiment can be the winning experiment.
_Avoid_: Winner, best experiment (for a loop that passed)

**Best experiment**:
The experiment after the control experiment with the highest pass rate, in a loop that did not pass.
_Avoid_: Winning experiment

**Got worse**:
A case got worse when it passed in the control experiment and failed in a later experiment.
_Avoid_: Regression, regressed

### Coding agents

**Handoff prompt**:
Text that the app writes for a person to paste into a coding agent. The app creates nothing; the coding agent does the work.
_Avoid_: "prompt" alone for this meaning. "Prompt" alone is the system prompt of the agent, which a loop changes. A button next to the handoff prompt can say "Get prompt" or "Copy prompt".

### Sign-in

**Device**:
A computer on which the Kitaru CLI asks to sign in to the server. A person approves the device in the dashboard, and then the CLI gets a token for that account. Say "approve", not "verify" (the word in the server API).
_Avoid_: Client, machine

## Flagged ambiguities

- In the UI, "baseline" has one meaning: the "Baseline" row of the experiment grid, which scores the recorded session. Say "control experiment" for the experiment of a loop with no change, and "recorded session" for the session itself.
