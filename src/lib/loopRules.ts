// The kitaru-loop skill's scores, ported from scripts/loop.py (gate,
// round_score) so the result views show the same numbers as the skill. Keep
// the two in step. The dashboard calculates no Loop status, so the stop rule
// of the skill (plateau_check, decide) is not here.
import type { Criteria } from "./loops";

export type CaseStat = { c: number; n: number }; // passes, scored trials
export type Stats = Map<string, CaseStat>; // by case (baseline session id)

// The stats of some runs of one lap. Each run gives, by case, if the case
// passed (see runResults). A null is a run with no score for the case: the
// case stays in the stats and the run adds no scored run, so `gate` reads
// the lap as incomplete.
export function caseStats(runs: Map<string, boolean | null>[]): Stats {
  const stats: Stats = new Map();
  for (const run of runs) {
    for (const [id, ok] of run) {
      const s = stats.get(id) ?? { c: 0, n: 0 };
      if (ok != null) s.n += 1;
      if (ok) s.c += 1;
      stats.set(id, s);
    }
  }
  return stats;
}

function choose(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// tau-bench estimator: the chance that k attempts all succeed, from c of n.
export function passHatK(n: number, c: number, k: number): number | null {
  return n >= k ? choose(c, k) / choose(n, k) : null;
}

export function meanPassK(stats: Stats, k: number): number | null {
  const vals = [...stats.values()].map((s) => passHatK(s.n, s.c, k));
  if (vals.length === 0 || vals.some((v) => v == null)) return null;
  return (vals as number[]).reduce((a, b) => a + b, 0) / vals.length;
}

// The MVP score: the plain share of case runs that passed, with no pass^k
// weighting. With one run per lap it equals mean pass^1.
export function passRate(stats: Stats): number | null {
  let c = 0;
  let n = 0;
  for (const s of stats.values()) {
    c += s.c;
    n += s.n;
  }
  return n ? c / n : null;
}

export type Gate = {
  met: boolean;
  incomplete: boolean;
  meanPassK: number | null;
  belowFloor: string[];
  regressed: string[];
  flaky: string[];
  improved: string[];
  belowTarget: boolean;
};

export function gate(c: Criteria, stats: Stats, baseline: Stats | null): Gate {
  const out: Gate = { met: false, incomplete: false, meanPassK: meanPassK(stats, c.k), belowFloor: [], regressed: [], flaky: [], improved: [], belowTarget: false };
  if (stats.size === 0 || [...stats.values()].some((s) => s.n < c.trials_per_round)) {
    out.incomplete = true;
    return out;
  }
  for (const [id, s] of stats) {
    const floor = c.per_case_floor === "strict" ? s.n : s.n - 1;
    if (s.c < floor) out.belowFloor.push(id);
    if (s.c > 0 && s.c < s.n) out.flaky.push(id);
    const b = baseline?.get(id);
    if (b && b.n > 0) {
      if (c.no_regression && s.c / s.n < b.c / b.n) out.regressed.push(id);
      if (s.c / s.n > b.c / b.n) out.improved.push(id);
    }
  }
  out.belowTarget = (out.meanPassK ?? 0) < c.cohort_target_mean_pass_k;
  out.met = out.belowFloor.length === 0 && out.regressed.length === 0 && !out.belowTarget;
  return out;
}
