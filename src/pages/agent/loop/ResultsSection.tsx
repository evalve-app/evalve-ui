import { Fragment, useState } from "react";
import { Link } from "react-router";
import { ChevronDown } from "lucide-react";
import { Badge, StatusLabel } from "../../../design-system/components";
import { experimentName } from "../../../lib/loops";
import { resultsTable, type ResultsCell, type ResultsReplay, type ResultsRow } from "../../../lib/loopResults";
import { LAP_PAGE } from "./LapViews";
import type { LoopData } from "./useLoop";

// The Results section of the loop page (MVP view): what occurred in each lap.
// A table with one row for each lap and one column for each gating evaluator.
// The view model (`resultsTable`) makes the rows. This component only lays them out.
export function ResultsSection({ loop, onShowOlder }: { loop: LoopData; onShowOlder: () => void }) {
  const [open, setOpen] = useState<number[]>([]); // the laps whose rows are open; all closed at first
  const table = resultsTable({ laps: loop.laps, cases: loop.cases, criteria: loop.settings?.criteria ?? null, winnerLap: loop.winnerLap, cohortCaseCount: loop.cohortCaseCount });
  const toggle = (lap: number) => setOpen((cur) => (cur.includes(lap) ? cur.filter((x) => x !== lap) : [...cur, lap]));
  // With no results in any lap, one column holds the text of each lap.
  const resultColumns = table.evaluators.length || 1;

  return (
    <section className="panel" aria-label="Results">
      <div className="panel-head">
        <div>
          <div className="panel-title">Results</div>
          <div className="panel-sub">One row for each experiment, and one column for each gating evaluator. A square opens the result session of its replay in a new tab.</div>
        </div>
        <span className="legend">
          <span>
            <span className="rs-square pass" aria-hidden /> Passed replay
          </span>
          <span>
            <span className="rs-square fail" aria-hidden /> Failed replay
          </span>
          <span>One square for each case</span>
        </span>
      </div>
      {loop.totalLaps > loop.laps.length ? (
        <button type="button" className="text-button older" onClick={onShowOlder}>
          Show {Math.min(LAP_PAGE, loop.totalLaps - loop.laps.length)} older experiments
        </button>
      ) : null}
      <div className="results-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th>Experiment</th>
              {table.evaluators.length ? (
                table.evaluators.map((name) => (
                  <th key={name} className="mono" title="Gating evaluator">
                    {name}
                  </th>
                ))
              ) : (
                <th>Replays</th>
              )}
              <th>Status</th>
              <th>Experiment result</th>
              <th aria-label="Replays of the experiment" />
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => {
              const hasResults = row.noResults == null;
              const isOpen = hasResults && open.includes(row.lap);
              const detailId = `results-lap-${row.lap}-replays`;
              return (
                <Fragment key={row.lap}>
                  <tr>
                    <td className="rs-lap">
                      <span className="rs-lap-num">
                        {experimentName(row.lap, row.lap === 0 ? "short" : "label")}
                        {row.winning ? (
                          <span className="winner-mark" role="img" aria-label="Winning experiment" title="Winning experiment">
                            ★
                          </span>
                        ) : null}
                      </span>
                      <span className="rs-lap-summary">{row.summary}</span>
                    </td>
                    {hasResults ? (
                      row.cells.map((cell, i) => <td key={table.evaluators[i]}>{cell ? <EvaluatorCell cell={cell} /> : <span className="muted">—</span>}</td>)
                    ) : (
                      <td colSpan={resultColumns} className="muted">
                        {row.noResults}
                      </td>
                    )}
                    <td>
                      <StatusLabel status={row.status} />
                    </td>
                    <td>{row.result ? <LapResultBadge result={row.result} /> : hasResults ? <span className="muted">—</span> : null}</td>
                    <td>
                      {hasResults ? (
                        <button type="button" className="text-button rs-toggle" aria-expanded={isOpen} aria-controls={detailId} aria-label={`${isOpen ? "Hide" : "Show"} replays of ${experimentName(row.lap, "inline")}`} onClick={() => toggle(row.lap)}>
                          {isOpen ? "Hide replays" : "Show replays"}
                          <ChevronDown size={14} aria-hidden className={isOpen ? "chev open" : "chev"} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr id={detailId}>
                      <td colSpan={resultColumns + 4} className="rs-detail">
                        <ReplayList lap={row.lap} replays={row.replays} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// One square for each replay, then the count.
function EvaluatorCell({ cell }: { cell: ResultsCell }) {
  return (
    <>
      <div className="rs-squares">
        {cell.squares.map((sq) => {
          const cls = `rs-square ${sq.passed ? "pass" : "fail"}`;
          return sq.sessionId ? (
            <Link key={sq.caseId} to={`/sessions/${sq.sessionId}`} target="_blank" rel="noreferrer" className={cls} title={sq.label} aria-label={sq.name} />
          ) : (
            <span key={sq.caseId} className={cls} role="img" title={sq.name} aria-label={sq.name} />
          );
        })}
      </div>
      <div className={`rs-count ${cell.tone}`}>{cell.count}</div>
    </>
  );
}

function LapResultBadge({ result }: { result: NonNullable<ResultsRow["result"]> }) {
  return (
    <span title={result.title || undefined}>
      <Badge variant={result.tone}>{result.label}</Badge>
    </span>
  );
}

// The replays of an open row: case name, one badge for each gating evaluator, status, result.
function ReplayList({ lap, replays }: { lap: number; replays: ResultsReplay[] }) {
  return (
    <div className="rs-replays-wrap">
      <table className="rs-replays" aria-label={`Replays of ${experimentName(lap, "inline")}`}>
        <thead>
          <tr>
            <th>Case</th>
            <th>Gating evaluators</th>
            <th>Status</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {replays.map((r) => (
            <tr key={r.caseId}>
              <td className="mono">
                {r.sessionId ? (
                  <Link to={`/sessions/${r.sessionId}`} target="_blank" rel="noreferrer" className="inline-link" title="Open the result session in a new tab">
                    {r.caseName}
                  </Link>
                ) : (
                  r.caseName
                )}
              </td>
              <td>
                <span className="rs-badges">
                  {r.badges.map((b) => (
                    <Badge key={b.evaluator} variant={b.passed == null ? "neutral" : b.passed ? "success" : "destructive"} mono>
                      {b.text}
                    </Badge>
                  ))}
                </span>
              </td>
              <td>
                <StatusLabel status={r.status} />
              </td>
              <td>
                <Badge variant={r.result === "Passed" ? "success" : r.result === "Failed" ? "destructive" : "neutral"}>{r.result}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
