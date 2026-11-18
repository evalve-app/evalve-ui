import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { getCurrentAccount, listExperiments } from "../../../api/client";
import { getBackendVersion, listAllLoops } from "../../../api/evalve";
import { evaluatorsQuery } from "../../../lib/queries";
import { Button } from "../../../design-system/components";
import { versionLabel } from "../../../lib/cohorts";
import { buildEvalveLoopPrompt } from "../../../lib/evalveLoopHandoff";
import { approveButtons, nextApproveState, type ApproveAction, type ApproveState } from "../../../lib/loopApprove";
import { cohortVersionText, setupRuleProblems, type SetupValues } from "../../../lib/loopSetup";
import { budgetLimitText, nameInUse, startedLoop } from "../../../lib/newLoop";
import { useCohorts } from "../../../lib/useCohorts";
import { CHANGE_FIELD_LABELS, slugify } from "../../../lib/loops";
import { SetupCard } from "./SetupCard";

// What an Experiment of a Loop on the Evalve backend can change.
type Change = "system_prompt" | "model";
const CHANGES: Change[] = ["system_prompt", "model"];
const CHANGE_HELP: Record<Change, string> = {
  system_prompt: "The instructions the agent runs with. Usually the first thing to try.",
  model: "The coding agent chooses a model the replay worker can access.",
};

// How often the page requests the Loops of the viewer while it waits for the coding agent to start the Loop.
const POLL_MS = 4000;

// The New Loop page. A person selects the Loop parameters and gets the handoff
// prompt. The coding agent starts the Loop with the Evalve MCP: this page makes
// no call that starts a Loop.
export function NewLoopPage() {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();

  const { cohorts, versionsByCohort } = useCohorts(agentId);
  const evaluators = useQuery(evaluatorsQuery());
  // Only to select in advance the evaluators of the newest experiment of the agent. The page works without it.
  const experiments = useQuery({ queryKey: ["experiments", agentId], queryFn: () => listExperiments(agentId) });
  // The state of the Approve flow. It is browser state only: a reload returns the page to "edit".
  const [approval, setApproval] = useState<ApproveState>("edit");
  // The install command of the handoff prompt needs the backend version. Without it, Approve is not available.
  const health = useQuery({ queryKey: ["evalve-backend-version"], queryFn: getBackendVersion });
  // The name check: the running Loops of this agent, from each account.
  const runningLoops = useQuery({ queryKey: ["evalve-loops-all", agentId, { status: "running" }], queryFn: () => listAllLoops(agentId, { status: "running" }) });
  const me = useQuery({ queryKey: ["me"], queryFn: getCurrentAccount });
  const myId = me.data?.id;
  // After the copy, the page waits for the coding agent to start the Loop. There is no time limit.
  const myLoops = useQuery({
    queryKey: ["evalve-loops-all", agentId, { ownerAccountId: myId }],
    queryFn: () => listAllLoops(agentId, { ownerAccountId: myId }),
    enabled: !!myId,
    refetchInterval: approval === "copied" ? POLL_MS : false,
  });

  const cohortOptions = (cohorts.data ?? []).flatMap((c) =>
    (versionsByCohort[c.id] ?? []).map((v) => ({ id: v.id, text: cohortVersionText({ name: c.name, version: versionLabel(v), caseCount: v.session_count }) })),
  );
  const liveEvaluators = (evaluators.data ?? []).filter((e) => !e.agent_id || e.agent_id === agentId);
  // What the page had at the time of Approve. The locked card and the handoff prompt use it until Cancel, so that
  // a later answer cannot put a value in the handoff prompt that the person did not approve.
  // - `evaluators`: the evaluators with their versions.
  // - `version`: the backend version.
  // - `seenIds`: the Loops of the viewer. Null when the page did not have them (see `startedLoop`).
  const [approved, setApproved] = useState<{ evaluators: typeof liveEvaluators; version: string; seenIds: ReadonlySet<string> | null } | null>(null);
  const agentEvaluators = approved?.evaluators ?? liveEvaluators;
  const backendVersion = approved?.version ?? health.data;
  // The number of the current approval. Cancel starts a new number, and a clipboard write of an older number changes nothing.
  const approvalNumber = useRef(0);
  const recent = useMemo(() => [...(experiments.data ?? [])].sort((a, b) => b.created.localeCompare(a.created))[0], [experiments.data]);

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [cohortVersionId, setCohortVersionId] = useState("");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [changes, setChanges] = useState<Change[]>(["system_prompt"]);
  const [requiredGreens, setRequiredGreens] = useState(2);
  const [maxRuns, setMaxRuns] = useState(10);
  const [budget, setBudget] = useState(5);
  const [showBuiltIn, setShowBuiltIn] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!cohortVersionId && cohortOptions[0]) setCohortVersionId(cohortOptions[0].id);
  }, [cohortOptions, cohortVersionId]);
  useEffect(() => {
    // When the experiments do not load, no evaluator is selected in advance.
    if (picked === null && evaluators.data && (experiments.data || experiments.isError)) setPicked(recent ? recent.evaluators.map((e) => e.evaluator) : []);
  }, [experiments.data, experiments.isError, evaluators.data, picked, recent]);

  const chosen = picked ?? [];
  const isBuiltIn = (n: string) => n.startsWith("kitaru/");
  // A built-in evaluator shows only when it is selected, or when the person shows the built-in evaluators.
  const visibleEvaluators = agentEvaluators.filter((e) => showBuiltIn || !isBuiltIn(e.name) || chosen.includes(e.name));
  const builtInCount = agentEvaluators.filter((e) => isBuiltIn(e.name) && !chosen.includes(e.name)).length;
  const slug = slugify(name);
  // The name check runs only in the edit state: after Approve, the coding agent starts a Loop with this name.
  const taken = approval === "edit" && nameInUse(runningLoops.data ?? [], agentId, slug);
  const cohort = cohortOptions.find((o) => o.id === cohortVersionId);
  const selectedEvaluators = agentEvaluators.filter((e) => chosen.includes(e.name)).map((e) => ({ ref: `${e.name}@${e.latest_version}` }));

  // The values of the editable setup card, and the function that takes its changes.
  const setup: SetupValues = { name, hypothesis, cohortVersionId, evaluators: chosen, changes, greenRuns: requiredGreens, maxRuns, budget };
  function changeSetup(change: Partial<SetupValues>) {
    if (change.name !== undefined) setName(change.name);
    if (change.hypothesis !== undefined) setHypothesis(change.hypothesis);
    if (change.cohortVersionId !== undefined) setCohortVersionId(change.cohortVersionId);
    if (change.evaluators !== undefined) setPicked(change.evaluators);
    // In the sequence in which the person selected them: the handoff prompt lists them in this sequence.
    if (change.changes !== undefined) setChanges(change.changes.filter((field): field is Change => field !== "model_params"));
    if (change.greenRuns !== undefined) setRequiredGreens(change.greenRuns);
    if (change.maxRuns !== undefined) setMaxRuns(change.maxRuns);
    if (change.budget !== undefined) setBudget(change.budget);
  }

  const problems = [
    !slug && "Give the loop a name.",
    taken && `A Loop named ${slug} is running on this agent.`,
    !cohort && "Pick a cohort.",
    selectedEvaluators.length === 0 && "Pick at least one evaluator.",
    changes.length === 0 && "Pick at least one thing that may change.",
    ...setupRuleProblems({ greenRuns: requiredGreens, maxRuns, budget }),
    !backendVersion && (health.isPending ? "Reading the Evalve backend…" : "Could not reach the Evalve backend."),
  ].filter(Boolean) as string[];

  const prompt = backendVersion
    ? buildEvalveLoopPrompt(
      { dashboardOrigin: window.location.origin, backendVersion },
      {
        name: name.trim(),
        ...(hypothesis.trim() ? { hypothesis: hypothesis.trim() } : {}),
        cohort_version_id: cohortVersionId,
        evaluators: selectedEvaluators,
        allowed_changes: changes,
        required_consecutive_greens: requiredGreens,
        max_runs: maxRuns,
        budget_usd: String(budget),
      },
    )
    : "";

  // The Approve flow. An inactive button does nothing.
  const hasProblem = problems.length > 0;
  const buttons = approveButtons(approval, { hasProblem });
  const act = (action: ApproveAction) => setApproval((state) => nextApproveState(state, action, { hasProblem }));
  function approve() {
    if (!buttons.approve || !health.data) return;
    setApproved({ evaluators: liveEvaluators, version: health.data, seenIds: myLoops.data ? new Set(myLoops.data.map((loop) => loop.loop_id)) : null });
    act("approve");
  }
  function cancelApproval() {
    if (!buttons.cancel) return;
    approvalNumber.current += 1;
    setApproved(null);
    setCopyFailed(false);
    act("cancel");
  }
  async function copyHandoffPrompt() {
    const mine = approvalNumber.current;
    let failed = false;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // The browser can refuse the clipboard (no permission, or no HTTPS).
      failed = true;
    }
    // The person canceled this approval while the clipboard write was not complete. The clipboard can hold the
    // handoff prompt of the old setup, so the page does not show a copy of the new setup.
    if (mine !== approvalNumber.current) return;
    setCopyFailed(failed);
    if (failed) return;
    act("copyPrompt");
  }

  // When the Loop of the viewer shows in the backend, the Loop page replaces this page.
  const waiting = approval === "copied";
  const started = waiting && approved ? startedLoop(myLoops.data ?? [], { agentId, slug, seenIds: approved.seenIds }) : null;
  const startedId = started?.loop_id;
  useEffect(() => {
    if (startedId) navigate(`/agents/${agentId}/loop/${startedId}`, { replace: true });
  }, [startedId, navigate, agentId]);
  // The page cannot see the new Loop while one of these requests fails.
  const waitError = me.error ?? myLoops.error;

  const budgetLimit = budgetLimitText(budget);
  const builtInToggle =
    builtInCount > 0 || showBuiltIn ? (
      <button type="button" className="text-button small-link" onClick={() => setShowBuiltIn(!showBuiltIn)}>
        {showBuiltIn ? "Hide built-in evaluators" : `Show ${builtInCount} built-in Kitaru evaluators`}
      </button>
    ) : null;

  return (
    <div className="tab-page new-loop">
      <button type="button" className="back-link" onClick={() => navigate(`/agents/${agentId}/loop`)}>
        <ArrowLeft size={14} aria-hidden />
        Loops
      </button>
      <div className="form-header">
        <div className="detail-eyebrow">Loop / New</div>
        <h2 className="detail-title sans">Set up the loop</h2>
        <p className="detail-description">Fill in the setup, get the handoff prompt, and give it to your coding agent, which starts and runs the Loop.</p>
      </div>

      <div className="setup-shell">
        <SetupCard
          edit={{
            values: setup,
            onChange: changeSetup,
            locked: approval !== "edit",
            nameTaken: taken,
            cohortVersions: cohortOptions.map((o) => ({ id: o.id, label: o.text })),
            evaluators: visibleEvaluators.map((e) => ({ id: e.name, label: `${e.name}@${e.latest_version}`, help: e.description ?? undefined })),
            evaluatorsFooter: builtInToggle,
            changes: CHANGES.map((f) => ({ id: f, label: CHANGE_FIELD_LABELS[f], help: CHANGE_HELP[f] })),
          }}
        />
        <div className="setup-footer">
          <div className="setup-footer-text">
            <span>Approve locks the setup. Cancel unlocks it for editing.</span>
            {budgetLimit ? <span>{budgetLimit}</span> : null}
            {approval !== "edit" ? null : problems.length > 0 ? (
              <span className="setup-problem">{problems[0]}</span>
            ) : runningLoops.isError ? (
              // Advice only: the backend refuses a name that is in use, so Approve stays available.
              <span>Could not check the name against the running Loops.</span>
            ) : null}
          </div>
          <div className="form-bar-actions">
            <Button variant="outline" disabled={!buttons.cancel} onClick={cancelApproval}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!buttons.approve} onClick={approve}>
              Approve
            </Button>
            <Button disabled={!buttons.getPrompt} onClick={() => act("getPrompt")}>
              Get prompt
            </Button>
          </div>
        </div>
      </div>
      {approval === "prompt" || approval === "copied" ? (
        <div className="panel handoff-panel">
          <div className={approval === "copied" ? "handoff-body dimmed" : "handoff-body"}>
            <h2 className="section-title">Start the Loop</h2>
            <ol className="steps">
              <li>Copy the handoff prompt.</li>
              <li>Paste it into your coding agent with the agent project open. The coding agent starts the Loop with the Evalve MCP.</li>
              <li>This page opens the Loop when the Evalve backend has it.</li>
            </ol>
            <pre className="code-block prompt-preview">{prompt}</pre>
          </div>
          <div className="handoff-actions">
            <p className="handoff-status" aria-live="polite">
              {approval !== "copied" ? (
                copyFailed ? "Could not copy. Select the handoff prompt and copy it." : null
              ) : waitError ? (
                // The interval continues while the request fails.
                <>
                  <span className="setup-problem">Could not read your Loops ({waitError.message}).</span> The page tries again every {POLL_MS / 1000} seconds. If the error stays, sign in again.{" "}
                  <button type="button" className="text-button small-link" onClick={() => (me.error ? me.refetch() : myLoops.refetch())}>
                    Try again now
                  </button>
                </>
              ) : (
                "Waiting for your coding agent to start the Loop."
              )}
            </p>
            <div className="form-bar-actions">
              <Button variant="outline" onClick={() => navigate(`/agents/${agentId}/loop`)}>
                Back to loops
              </Button>
              <Button icon={approval === "copied" ? Check : Copy} disabled={!buttons.copyPrompt} onClick={copyHandoffPrompt}>
                {approval === "copied" ? "Prompt copied" : "Copy prompt"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
