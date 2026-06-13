import { useState } from "react";
import { BalanceAIType, BalanceSummary } from "../../engine/simulation/balanceTypes";
import { runBalanceSimulation } from "../../engine/simulation/balanceSimulator";
import { BalanceSummaryPanel } from "./BalanceSummaryPanel";

const GAME_OPTIONS = [10, 100, 500, 1000];

export function BalanceSimulatorPanel() {
  const [blueAI, setBlueAI] = useState<BalanceAIType>("heuristic");
  const [redAI, setRedAI] = useState<BalanceAIType>("heuristic");
  const [games, setGames] = useState(100);
  const [maxTurns, setMaxTurns] = useState(200);
  const [heuristicRandomness, setHeuristicRandomness] = useState(0.1);
  const [seed, setSeed] = useState("42");
  const [summary, setSummary] = useState<BalanceSummary | undefined>();
  const [status, setStatus] = useState("Ready.");

  function handleRun() {
    setStatus(`Running ${games} games...`);
    window.setTimeout(() => {
      const parsedSeed = seed.trim() === "" ? undefined : Number(seed);
      const result = runBalanceSimulation({
        games,
        maxTurns,
        blueAI,
        redAI,
        heuristicRandomness,
        seed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      });
      setSummary(result);
      setStatus(`Completed ${result.gamesRun} games.`);
    }, 0);
  }

  function handleClear() {
    setSummary(undefined);
    setStatus("Ready.");
  }

  return (
    <section className="panel-block balance-panel">
      <h2>Balance Simulator</h2>
      <div className="balance-controls">
        <label>
          Blue AI
          <select value={blueAI} onChange={(event) => setBlueAI(event.target.value as BalanceAIType)}>
            <option value="heuristic">Heuristic</option>
            <option value="random">Random</option>
          </select>
        </label>
        <label>
          Red AI
          <select value={redAI} onChange={(event) => setRedAI(event.target.value as BalanceAIType)}>
            <option value="heuristic">Heuristic</option>
            <option value="random">Random</option>
          </select>
        </label>
        <label>
          Games
          <select value={games} onChange={(event) => setGames(Number(event.target.value))}>
            {GAME_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max turns
          <input min={0} type="number" value={maxTurns} onChange={(event) => setMaxTurns(Number(event.target.value))} />
        </label>
        <label>
          Heuristic randomness
          <input
            max={1}
            min={0}
            step={0.05}
            type="number"
            value={heuristicRandomness}
            onChange={(event) => setHeuristicRandomness(Number(event.target.value))}
          />
        </label>
        <label>
          Seed
          <input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Optional" />
        </label>
      </div>
      <div className="simulation-actions">
        <button onClick={handleRun} type="button">Run Balance Simulation</button>
        <button onClick={handleClear} type="button">Clear Results</button>
      </div>
      <p className="balance-status">{status}</p>
      {summary ? <BalanceSummaryPanel summary={summary} /> : null}
    </section>
  );
}
