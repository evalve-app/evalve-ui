import importlib.util
import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
RELEASE = json.loads((ROOT / "src/lib/evalveLoopRelease.json").read_text())
RUNNER = ROOT / "public/skills/evalve-loop" / RELEASE["version"] / "scripts/loop.py"
spec = importlib.util.spec_from_file_location("evalve_loop", RUNNER)
loop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loop)

COHORT_VERSION = "00000000-0000-4000-8000-000000000001"
SERVER = "https://kitaru.example.test"
AGENT_VERSION = {
    "id": "agent-version", "agent_id": "agent", "version": 1,
    "run_spec": {"env": {"OPENAI_MODEL": "baseline-model"}},
}
START = Namespace(model=None, prompt_file=None, change=None, baseline_model=None, estimate_usd=None)


class RunnerTest(unittest.TestCase):
    def setUp(self):
        project = tempfile.TemporaryDirectory()
        self.addCleanup(project.cleanup)
        self.project = Path(project.name)
        self.experiment = None
        self.runs_by_key = {}
        self.submitted_keys = []
        self.lose_response = False
        self.passed = None
        self.replay_cost = "0.10"
        kitaru = patch.object(loop, "kitaru", side_effect=self.fake_kitaru)
        kitaru.start()
        self.addCleanup(kitaru.stop)

    def preflight(self, **limits):
        settings = {
            "name": "Test loop", "server_url": SERVER, "cohort_version_id": COHORT_VERSION,
            "evaluators": [{"ref": "policy@1"}], "allowed_changes": ["system_prompt"],
            "tool_policy": {"default": {"type": "history", "scope": "baseline", "on_miss": "fail"}},
            "required_consecutive_greens": 2, "max_attempts": 10, "budget_usd": "1.00",
        }
        path = self.project / "evalve-loop.json"
        path.write_text(json.dumps(settings | limits))
        self.config = loop.load_config(path)
        self.config["_dir"].mkdir(parents=True)
        loop.preflight(self.config, None)

    def fake_kitaru(self, _config, *args, check=True):
        def item(value):
            return {"ok": True, "item": value}

        def flag(name):
            return args[args.index(name) + 1]

        if args == ("status",):
            return item({"authentication": "authenticated", "server_url": SERVER})
        if args[:3] == ("cohort", "version", "get"):
            return item({"cohort_id": "cohort", "session_count": 1})
        if args[:2] == ("cohort", "get"):
            return item({"agent_id": "agent"})
        if args[:2] == ("session", "list"):
            return {"items": [{"id": "recorded", "agent_version_id": AGENT_VERSION["id"], "cost": "0.10"}]}
        if args[:3] == ("agent", "version", "list"):
            return {"items": [AGENT_VERSION]}
        if args[:3] == ("agent", "version", "get"):
            return item(AGENT_VERSION)
        if args[:2] == ("evaluator", "get"):
            return item({"name": "policy"})
        if args[:3] == ("evaluator", "version", "get"):
            return item({"id": "policy-version"})
        if args[:2] == ("experiment", "get"):
            return item(self.experiment) if self.experiment else {"ok": False, "error": {"kind": "not_found"}}
        if args[:2] == ("experiment", "create"):
            self.experiment = {
                "id": "experiment", "agent_id": "agent", "description": flag("--description"),
                "tool_policy": json.loads(flag("--tool-policy")),
                "evaluators": [{"evaluator": "policy", "version": 1, "params": {}, "connection_id": None}],
            }
            return item(self.experiment)
        if args[:2] == ("experiment", "update"):
            self.experiment["description"] = flag("--description")
            return item(self.experiment)
        if args[:3] == ("experiment", "run", "start"):
            key = flag("--idempotency-key")
            self.submitted_keys.append(key)
            run = self.runs_by_key.setdefault(key, {"id": f"run-{len(self.runs_by_key) + 1}", "status": "completed"})
            if self.lose_response:
                self.lose_response = False
                raise SystemExit("Simulated lost submission response")
            return item({"run": run})
        if args[:3] == ("experiment", "run", "get"):
            return item(next(run for run in self.runs_by_key.values() if run["id"] == args[3]))
        if args[:2] == ("replay", "list"):
            return {"items": [{"id": "replay", "baseline_session_id": "recorded", "result_session_id": "result", "status": "completed"}]}
        if args[:2] == ("evaluation", "list"):
            verdict = {"session_id": "result", "evaluator_version_id": "policy-version", "passed": self.passed}
            return {"items": [] if self.passed is None else [verdict]}
        if args[:2] == ("session", "get"):
            return item({"status": "completed", "cost": self.replay_cost})
        self.fail(f"Unexpected Kitaru call: {args}")

    def replay(self, verdict, outcome, next_action):
        self.passed = verdict
        submission = loop.start(self.config, START)
        self.assertEqual(submission["lap"], 0)
        result = loop.collect(self.config, Namespace(run_id=submission["run_id"]))
        self.assertEqual(result["outcome"], outcome)
        self.assertEqual(result["next"]["action"], next_action)
        return result["next"]

    def test_red_baseline_still_requires_two_fully_scored_runs(self):
        self.preflight()
        self.replay(False, "red", "replay")
        self.replay(None, "incomplete", "retry")
        self.replay(True, "green", "start_candidate")

    def test_incomplete_baseline_breaks_the_green_streak(self):
        self.preflight()
        self.replay(True, "green", "replay")
        self.assertEqual(self.replay(None, "incomplete", "retry")["green_streak"], 0)
        self.replay(True, "green", "replay")
        self.assertEqual(self.replay(True, "green", "stop_success")["lap"], 0)

    def test_budget_blocks_next_submission_using_estimated_missing_cost(self):
        self.preflight(budget_usd="0.19")
        self.replay_cost = None
        step = self.replay(None, "incomplete", "retry")
        self.assertEqual(step["accounted_cost_usd"], "0.10")
        self.assertEqual(loop.start(self.config, START)["action"], "stop_budget")
        self.assertEqual(loop.start(self.config, START)["action"], "stop_budget")
        self.assertEqual(len(self.submitted_keys), 1)

    def test_attempt_cap_counts_incomplete_runs(self):
        self.preflight(max_attempts=2)
        self.replay(False, "red", "replay")
        self.replay(None, "incomplete", "stop_attempt_cap")
        self.assertEqual(loop.start(self.config, START)["action"], "stop_attempt_cap")
        self.assertEqual(len(self.submitted_keys), 2)

    def test_interrupted_submission_resumes_with_the_same_key(self):
        self.preflight()
        self.lose_response = True
        with self.assertRaisesRegex(SystemExit, "lost submission response"):
            loop.start(self.config, START)
        pending = loop.load_state(self.config)
        self.assertEqual(loop.decide(self.config, pending)["action"], "resume_start")
        self.assertEqual(loop.start(self.config, START)["run_id"], "run-1")
        self.assertEqual(len(self.submitted_keys), 2)
        self.assertEqual(self.submitted_keys[0], self.submitted_keys[1])
        self.assertEqual(len(self.runs_by_key), 1)
        settled = loop.load_state(self.config)
        self.assertEqual(loop.decide(self.config, settled)["attempts"], 1)
        self.assertEqual(loop.decide(self.config, settled)["action"], "collect")
