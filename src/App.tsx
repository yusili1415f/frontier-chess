import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { Board } from "./components/Board";
import { DiceDebugPanel } from "./components/DiceDebugPanel";
import { MoveLog } from "./components/MoveLog";
import { AIMoveExplanationPanel } from "./components/panels/AIMoveExplanationPanel";
import { BalanceSimulatorPanel } from "./components/panels/BalanceSimulatorPanel";
import { CombatResultPanel } from "./components/panels/CombatResultPanel";
import { DisplaySettingsPanel } from "./components/panels/DisplaySettingsPanel";
import { GameControlsPanel } from "./components/panels/GameControlsPanel";
import { GameInfoPanel } from "./components/panels/GameInfoPanel";
import { GameStatusPanel } from "./components/panels/GameStatusPanel";
import { OnlineGamePanel } from "./components/panels/OnlineGamePanel";
import { PlayModePanel } from "./components/panels/PlayModePanel";
import { ReplayPanel } from "./components/panels/ReplayPanel";
import { RulesReferencePanel } from "./components/panels/RulesReferencePanel";
import { SelectedPiecePanel } from "./components/panels/SelectedPiecePanel";
import { AiMode, SimulationPanel } from "./components/panels/SimulationPanel";
import { ScenarioPanel } from "./components/ScenarioPanel";
import { AIPlayOptions, AIStatus, GameMode, getNextSwitchedMode, isAITurn, isHumanTurn } from "./engine/ai/aiTurn";
import { applyMove, createInitialGameState, getSelectedLegalMoves, pieceAt, selectPiece, setForcedDice } from "./engine/gameState";
import { annotateLastMove, createGameSnapshot, GameHistoryEntry, GameSnapshot, MoveActor } from "./engine/history";
import { clampReplayIndex, createReplaySnapshots, getReplaySnapshot, ReplayState } from "./engine/replay";
import { createScenario, ScenarioId } from "./engine/scenarios";
import { chooseHeuristicMove, runBatchHeuristicSimulations, runHeuristicSimulation } from "./engine/simulation/heuristicAI";
import { runBatchRandomSimulations, runRandomSimulation, stepRandomMove } from "./engine/simulation/simulator";
import { BatchSimulationSummary, ScoredMoveChoice, SimulationResult } from "./engine/simulation/simulationTypes";
import { ForcedDice, GameState, Position } from "./engine/types";
import { PieceLabelMode } from "./engine/data/classProfiles";
import { runRuleValidation } from "./engine/validation";
import {
  createOnlineGame,
  getOrCreatePlayerId,
  joinOnlineGame,
  normalizeGameId,
  submitOnlineMove,
  subscribeToOnlineGame,
} from "./services/onlineGameService";
import { OnlineGameDocument, OnlineGameViewDocument, OnlinePlayerRole } from "./engine/online/onlineTypes";

const PIECE_LABEL_MODE_STORAGE_KEY = "frontierChessPieceLabelMode";

export function App() {
  const [state, setState] = useState(createInitialGameState);
  const [pieceLabelMode, setPieceLabelMode] = useState<PieceLabelMode>(() => getStoredPieceLabelMode());
  const [gameMode, setGameMode] = useState<GameMode>("human-blue-vs-ai-red");
  const [aiStatus, setAIStatus] = useState<AIStatus>("idle");
  const [aiPlayOptions, setAIPlayOptions] = useState<AIPlayOptions>({
    heuristicRandomness: 0.1,
    topN: 3,
    aiMoveDelayMs: 200,
    maxTurns: 200,
  });
  const [aiMoveExplanation, setAIMoveExplanation] = useState<GameSnapshot["aiExplanation"]>();
  const [playOutcome, setPlayOutcome] = useState<string | undefined>();
  const [initialSnapshot, setInitialSnapshot] = useState(() => createGameSnapshot(createInitialGameState()));
  const [historyEntries, setHistoryEntries] = useState<GameHistoryEntry[]>([]);
  const [replay, setReplay] = useState<ReplayState>({ active: false, index: 0 });
  const [currentScenarioId, setCurrentScenarioId] = useState<ScenarioId>("standard");
  const [simulationResult, setSimulationResult] = useState<SimulationResult | undefined>();
  const [batchSummary, setBatchSummary] = useState<BatchSimulationSummary | undefined>();
  const [aiMode, setAiMode] = useState<AiMode>("random");
  const [lastHeuristicChoice, setLastHeuristicChoice] = useState<ScoredMoveChoice | undefined>();
  const [onlineGameId, setOnlineGameId] = useState<string | undefined>();
  const [onlinePlayerId, setOnlinePlayerId] = useState<string | undefined>();
  const [onlineRole, setOnlineRole] = useState<OnlinePlayerRole | undefined>();
  const [onlineGame, setOnlineGame] = useState<OnlineGameViewDocument | undefined>();
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | undefined>();
  const pendingAITurnKeyRef = useRef<string | undefined>();
  const autoJoinAttemptedRef = useRef(false);
  const validation = useMemo(() => runRuleValidation(), []);
  const replaySnapshots = useMemo(() => createReplaySnapshots(initialSnapshot, historyEntries), [historyEntries, initialSnapshot]);
  const replaySnapshot = replay.active ? getReplaySnapshot(replay, initialSnapshot, historyEntries) : undefined;
  const displayState = replaySnapshot?.state ?? state;
  const displayAIExplanation = replaySnapshot?.aiExplanation ?? aiMoveExplanation;
  const displayPlayOutcome = replaySnapshot?.playOutcome ?? playOutcome;
  const onlineActive = Boolean(onlineGameId && onlineRole && onlineGame);
  const reachedMaxTurns = !state.winner && state.moveHistory.length >= aiPlayOptions.maxTurns;
  const displayReachedMaxTurns = !displayState.winner && displayState.moveHistory.length >= aiPlayOptions.maxTurns;
  const onlineCanMove = onlineActive &&
    onlineGame?.status === "active" &&
    onlineRole !== "Spectator" &&
    onlineRole === state.turn &&
    !state.winner;
  const humanTurn = !replay.active && (
    onlineActive
      ? onlineCanMove
      : isHumanTurn(state, gameMode) && !reachedMaxTurns && !playOutcome
  );
  const legalMoves = useMemo(() => (humanTurn ? getSelectedLegalMoves(state) : []), [humanTurn, state]);
  const selectedPiece = displayState.selectedPieceId ? displayState.pieces[displayState.selectedPieceId] : undefined;
  const resultText = getPlayResultText(displayState.winner, displayReachedMaxTurns, displayPlayOutcome);

  useEffect(() => {
    console.group("Frontier Chess rules validation");
    validation.messages.forEach((message) => console.log(message));
    console.log(validation.passed ? "All validation checks passed." : "Validation failed.");
    console.groupEnd();
  }, [validation]);

  useEffect(() => {
    window.localStorage.setItem(PIECE_LABEL_MODE_STORAGE_KEY, pieceLabelMode);
  }, [pieceLabelMode]);

  useEffect(() => {
    if (onlineActive || replay.active || !isAITurn(state, gameMode) || state.winner || reachedMaxTurns || playOutcome) {
      if (aiStatus === "thinking") {
        setAIStatus("idle");
      }
      return;
    }

    const turnKey = createAITurnKey(state);
    if (pendingAITurnKeyRef.current === turnKey) {
      return;
    }

    pendingAITurnKeyRef.current = turnKey;
    setAIStatus("thinking");
    const timer = window.setTimeout(() => {
      performAIMove(turnKey);
    }, aiPlayOptions.aiMoveDelayMs);

    return () => {
      window.clearTimeout(timer);
      if (pendingAITurnKeyRef.current === turnKey) {
        pendingAITurnKeyRef.current = undefined;
      }
    };
  }, [aiPlayOptions.aiMoveDelayMs, aiPlayOptions.heuristicRandomness, aiPlayOptions.topN, aiStatus, gameMode, onlineActive, playOutcome, reachedMaxTurns, replay.active, state]);

  useEffect(() => {
    if (!onlineGameId) {
      setOnlineGame(undefined);
      return;
    }

    return subscribeToOnlineGame(
      onlineGameId,
      (game) => {
        setOnlineGame(game ?? undefined);
        if (game) {
          cancelPendingAI();
          setState(game.gameState);
          setInitialSnapshot(createGameSnapshot(game.gameState));
          setHistoryEntries([]);
          setReplay({ active: false, index: game.moveHistory.length });
          setAIMoveExplanation(undefined);
          setPlayOutcome(game.reason ? formatOnlineReason(game.reason) : undefined);
        }
      },
      (error) => setOnlineError(error.message),
    );
  }, [onlineGameId]);

  useEffect(() => {
    if (autoJoinAttemptedRef.current) {
      return;
    }
    autoJoinAttemptedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get("game");
    if (gameId) {
      handleJoinOnlineGame(gameId);
    }
  }, []);

  function handleSquareClick(position: Position) {
    if (!humanTurn) {
      return;
    }

    const clickedPiece = pieceAt(state, position);
    if (onlineActive) {
      if (clickedPiece?.side === state.turn && clickedPiece.side === onlineRole) {
        setState((current) => selectPiece(current, clickedPiece.id));
        return;
      }

      if (state.selectedPieceId) {
        submitSelectedOnlineMove(position);
      }
      return;
    }

    if (clickedPiece?.side === state.turn) {
      setState((current) => selectPiece(current, clickedPiece.id));
      return;
    }

    if (!state.selectedPieceId) {
      return;
    }

    applyTrackedMove("Human", state.selectedPieceId, position);
  }

  function applyTrackedMove(actor: MoveActor, pieceId: string, to: Position, scoreChoice?: ScoredMoveChoice): boolean {
    const beforeSnapshot = createGameSnapshot(state, aiMoveExplanation, playOutcome);
    const legalMove = getSelectedLegalMoves({ ...state, selectedPieceId: pieceId }).find((move) => move.to.col === to.col && move.to.row === to.row);
    if (!legalMove) {
      return false;
    }

    const rawAfter = applyMove(state, pieceId, legalMove);
    if (rawAfter === state || !rawAfter.lastMove) {
      return false;
    }

    const after = annotateLastMove(rawAfter, actor);
    const explanation = actor === "AI" && scoreChoice
      ? {
          side: state.turn,
          piece: state.pieces[pieceId],
          from: scoreChoice.move.from,
          to: scoreChoice.move.to,
          target: pieceAt(state, scoreChoice.move.to),
          score: scoreChoice.score,
        }
      : undefined;
    const afterSnapshot = createGameSnapshot(after, explanation, undefined);

    pendingAITurnKeyRef.current = undefined;
    setState(after);
    setAIMoveExplanation(explanation);
    setPlayOutcome(undefined);
    setAIStatus(actor === "AI" ? "moved" : "idle");
    setHistoryEntries((entries) => [...entries, { actor, before: beforeSnapshot, after: afterSnapshot, record: after.lastMove! }]);
    setReplay({ active: false, index: historyEntries.length + 1 });
    return true;
  }

  function performAIMove(turnKey: string) {
    if (
      createAITurnKey(state) !== turnKey ||
      replay.active ||
      !isAITurn(state, gameMode) ||
      state.winner ||
      state.moveHistory.length >= aiPlayOptions.maxTurns ||
      playOutcome
    ) {
      return;
    }

    const choice = chooseHeuristicMove(state, state.turn, {
      randomness: aiPlayOptions.heuristicRandomness,
      topN: aiPlayOptions.topN,
    });

    if (!choice) {
      pendingAITurnKeyRef.current = undefined;
      setAIStatus("idle");
      setPlayOutcome("Draw / no legal moves");
      return;
    }

    applyTrackedMove("AI", choice.pieceId, choice.move.to, choice);
  }

  function cancelPendingAI() {
    pendingAITurnKeyRef.current = undefined;
    setAIStatus("idle");
  }

  function resetToState(nextState: GameState, scenarioId: ScenarioId = "standard") {
    cancelPendingAI();
    const snapshot = createGameSnapshot(nextState);
    setState(nextState);
    setInitialSnapshot(snapshot);
    setHistoryEntries([]);
    setReplay({ active: false, index: 0 });
    setAIMoveExplanation(undefined);
    setPlayOutcome(undefined);
    setCurrentScenarioId(scenarioId);
    setSimulationResult(undefined);
    setBatchSummary(undefined);
    setLastHeuristicChoice(undefined);
  }

  function handleResetGame() {
    if (onlineActive) {
      return;
    }
    resetToState(createInitialGameState(), "standard");
  }

  function handleScenario(id: ScenarioId) {
    if (onlineActive) {
      return;
    }
    resetToState(createScenario(id), id);
  }

  function handleResetCurrentScenario() {
    if (onlineActive) {
      return;
    }
    resetToState(createScenario(currentScenarioId), currentScenarioId);
  }

  function handleForcedDiceChange(forcedDice: ForcedDice) {
    setState((current) => setForcedDice(current, forcedDice));
  }

  function handleGameModeChange(nextMode: GameMode) {
    if (onlineActive) {
      return;
    }
    cancelPendingAI();
    setGameMode(nextMode);
    setReplay({ active: false, index: historyEntries.length });
    setState((current) => ({ ...current, selectedPieceId: undefined }));
  }

  function handleSwitchSides() {
    if (onlineActive) {
      return;
    }
    setGameMode((current) => getNextSwitchedMode(current));
    resetToState(createInitialGameState(), "standard");
  }

  function handleNewHumanVsAI() {
    if (onlineActive) {
      return;
    }
    setGameMode("human-blue-vs-ai-red");
    resetToState(createInitialGameState(), "standard");
  }

  function handleNewHumanVsHuman() {
    if (onlineActive) {
      return;
    }
    setGameMode("human-vs-human");
    resetToState(createInitialGameState(), "standard");
  }

  function handleLetAIMoveNow() {
    if (onlineActive) {
      return;
    }
    if (replay.active || !isAITurn(state, gameMode) || state.winner || reachedMaxTurns || playOutcome) {
      return;
    }
    performAIMove(createAITurnKey(state));
  }

  function handleUndo() {
    if (onlineActive) {
      return;
    }
    if (!historyEntries.length) {
      return;
    }

    cancelPendingAI();
    const undoCount = getUndoCount(historyEntries, gameMode);
    const nextEntries = historyEntries.slice(0, -undoCount);
    const restoreFrom = historyEntries[historyEntries.length - undoCount].before;
    setState(restoreFrom.state);
    setAIMoveExplanation(restoreFrom.aiExplanation);
    setPlayOutcome(restoreFrom.playOutcome);
    setHistoryEntries(nextEntries);
    setReplay({ active: false, index: nextEntries.length });
  }

  function startReplayAt(index: number) {
    if (onlineActive) {
      return;
    }
    cancelPendingAI();
    setReplay({ active: true, index: clampReplayIndex(index, replaySnapshots) });
  }

  function goToLatestReplay() {
    if (onlineActive) {
      return;
    }
    cancelPendingAI();
    setReplay({ active: true, index: Math.max(0, replaySnapshots.length - 1) });
  }

  function returnToLiveGame() {
    setReplay({ active: false, index: historyEntries.length });
  }

  function handleStepAiMove() {
    if (onlineActive) {
      return;
    }
    setState((current) => {
      if (aiMode === "heuristic") {
        const choice = chooseHeuristicMove(current, current.turn);
        setLastHeuristicChoice(choice ?? undefined);
        return choice ? applyMove(current, choice.pieceId, choice.move) : current;
      }
      setLastHeuristicChoice(undefined);
      return stepRandomMove(current);
    });
  }

  function handleRunOneSimulation() {
    if (onlineActive) {
      return;
    }
    const result =
      aiMode === "heuristic"
        ? runHeuristicSimulation(createInitialGameState(), { maxTurns: 200 })
        : runRandomSimulation(createInitialGameState(), { maxTurns: 200 });
    resetToState(result.finalState, "standard");
    setSimulationResult(result);
    setBatchSummary(undefined);
    setLastHeuristicChoice(undefined);
  }

  function handleRunBatch(games: number) {
    if (onlineActive) {
      return;
    }
    const summary =
      aiMode === "heuristic"
        ? runBatchHeuristicSimulations(games, { maxTurns: 200 })
        : runBatchRandomSimulations(games, { maxTurns: 200 });
    setBatchSummary(summary);
    setSimulationResult(summary.results[0]);
    setLastHeuristicChoice(undefined);
  }

  function handleAutoPlay() {
    if (onlineActive) {
      return;
    }
    const result =
      aiMode === "heuristic"
        ? runHeuristicSimulation(state, { maxTurns: 200 })
        : runRandomSimulation(state, { maxTurns: 200 });
    resetToState(result.finalState, "standard");
    setSimulationResult(result);
    setBatchSummary(undefined);
    setLastHeuristicChoice(undefined);
  }

  async function handleCreateOnlineGame() {
    setOnlineBusy(true);
    setOnlineError(undefined);
    try {
      const playerId = getOrCreatePlayerId();
      const gameId = await createOnlineGame(playerId);
      setOnlinePlayerId(playerId);
      setOnlineRole("Blue");
      setOnlineGameId(gameId);
      window.history.replaceState(null, "", `${window.location.pathname}?game=${gameId}`);
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "Could not create online game.");
    } finally {
      setOnlineBusy(false);
    }
  }

  async function handleJoinOnlineGame(gameId: string) {
    const normalizedGameId = normalizeGameId(gameId);
    setOnlineBusy(true);
    setOnlineError(undefined);
    try {
      const playerId = getOrCreatePlayerId();
      const role = await joinOnlineGame(normalizedGameId, playerId);
      setOnlinePlayerId(playerId);
      setOnlineRole(role);
      setOnlineGameId(normalizedGameId);
      window.history.replaceState(null, "", `${window.location.pathname}?game=${normalizedGameId}`);
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "Could not join online game.");
    } finally {
      setOnlineBusy(false);
    }
  }

  function handleLeaveOnlineGame() {
    setOnlineGameId(undefined);
    setOnlineRole(undefined);
    setOnlineGame(undefined);
    setOnlineError(undefined);
    setOnlineBusy(false);
    window.history.replaceState(null, "", window.location.pathname);
    resetToState(createInitialGameState(), "standard");
  }

  async function submitSelectedOnlineMove(position: Position) {
    if (!onlineGameId || !onlinePlayerId || !state.selectedPieceId) {
      return;
    }

    setOnlineError(undefined);
    try {
      await submitOnlineMove(onlineGameId, onlinePlayerId, {
        pieceId: state.selectedPieceId,
        to: position,
      });
    } catch (error) {
      setOnlineError(error instanceof Error ? error.message : "Could not submit online move.");
    }
  }

  return (
    <AppLayout
      left={
        <>
          <GameInfoPanel state={displayState} onReset={handleResetGame} />
          <DisplaySettingsPanel pieceLabelMode={pieceLabelMode} onPieceLabelModeChange={setPieceLabelMode} />
          <OnlineGamePanel
            busy={onlineBusy}
            error={onlineError}
            game={onlineGame}
            gameId={onlineGameId}
            onCreateGame={handleCreateOnlineGame}
            onJoinGame={handleJoinOnlineGame}
            onLeaveGame={handleLeaveOnlineGame}
            role={onlineRole}
          />
          <GameStatusPanel
            aiStatus={aiStatus}
            gameMode={gameMode}
            playOutcome={displayPlayOutcome}
            reachedMaxTurns={displayReachedMaxTurns}
            replayActive={replay.active}
            resultText={resultText}
            state={displayState}
          />
          <PlayModePanel
            aiStatus={aiStatus}
            gameMode={gameMode}
            onGameModeChange={handleGameModeChange}
            onLetAIMoveNow={handleLetAIMoveNow}
            onNewHumanVsAI={handleNewHumanVsAI}
            onOptionsChange={setAIPlayOptions}
            onSwitchSides={handleSwitchSides}
            options={aiPlayOptions}
            resultText={resultText}
            state={displayState}
          />
          <GameControlsPanel
            canUndo={!onlineActive && historyEntries.length > 0}
            onNewHumanVsAI={handleNewHumanVsAI}
            onNewHumanVsHuman={handleNewHumanVsHuman}
            onResetScenario={handleResetCurrentScenario}
            onResetStandard={handleResetGame}
            onUndo={handleUndo}
          />
          <ReplayPanel
            active={replay.active}
            index={replay.active ? clampReplayIndex(replay.index, replaySnapshots) : historyEntries.length}
            latestIndex={Math.max(0, replaySnapshots.length - 1)}
            onGoLatest={goToLatestReplay}
            onGoStart={() => startReplayAt(0)}
            onNext={() => startReplayAt(replay.index + 1)}
            onPrevious={() => startReplayAt(replay.index - 1)}
            onReturnLive={returnToLiveGame}
          />
          <AIMoveExplanationPanel explanation={displayAIExplanation} labelMode={pieceLabelMode} />
          <SelectedPiecePanel labelMode={pieceLabelMode} selectedPiece={selectedPiece} state={displayState} />
          <CombatResultPanel labelMode={pieceLabelMode} state={displayState} />
          <section className="panel-block validation-summary">
            <h2>Validation</h2>
            <p className={validation.passed ? "validation-pass" : "validation-fail"}>
              {validation.passed ? "All rule checks passed." : "Some checks failed."}
            </p>
          </section>
        </>
      }
      center={
        <section className="game-area">
          <div className="mobile-status-bar">
            <span>{displayState.winner ? `${displayState.winner} wins` : `${displayState.turn} to move`}</span>
            <span>{onlineGameId ? `Online ${onlineRole ?? ""}` : gameMode.split("-").join(" ")}</span>
          </div>
          <header className="topbar">
            <div>
              <p className="eyebrow">Frontier Chess</p>
              <h1>Core Rules Prototype</h1>
            </div>
          </header>

          {replay.active ? <div className="replay-banner">Replay Mode - normal play is paused</div> : null}
          <div className="board-zone">
            <Board
              humanTurn={humanTurn}
              labelMode={pieceLabelMode}
              legalMoves={legalMoves}
              onSquareClick={handleSquareClick}
              state={displayState}
            />
          </div>

          <div className="territory-key" aria-label="Board territory key">
            <span>Rows 1-2: Blue home</span>
            <span>Rows 3-5: Frontier Zone</span>
            <span>Row 4: Frontier Line</span>
            <span>Rows 6-7: Red home</span>
          </div>
        </section>
      }
      right={
        <>
          <MoveLog history={displayState.moveHistory} labelMode={pieceLabelMode} />
          <SimulationPanel
            aiMode={aiMode}
            batchSummary={batchSummary}
            lastHeuristicChoice={lastHeuristicChoice}
            lastResult={simulationResult}
            onAiModeChange={setAiMode}
            onAutoPlay={handleAutoPlay}
            onRunBatch={handleRunBatch}
            onRunOne={handleRunOneSimulation}
            onStep={handleStepAiMove}
          />
          <BalanceSimulatorPanel />
          <ScenarioPanel onScenario={handleScenario} />
          <DiceDebugPanel forcedDice={displayState.forcedDice} onForcedDiceChange={handleForcedDiceChange} />
          <RulesReferencePanel />
        </>
      }
    />
  );
}

function createAITurnKey(state: GameState): string {
  return `${state.turn}-${state.turnNumber}-${state.moveHistory.length}`;
}

function getUndoCount(entries: GameHistoryEntry[], gameMode: GameMode): number {
  if (gameMode === "human-vs-human" || gameMode === "ai-vs-ai" || entries.length < 2) {
    return 1;
  }

  const last = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  return last.actor !== previous.actor ? 2 : 1;
}

function getPlayResultText(winner: "Blue" | "Red" | undefined, reachedMaxTurns: boolean, playOutcome?: string): string {
  if (winner) {
    const loser = winner === "Blue" ? "Red" : "Blue";
    return `${winner} wins by capturing ${loser} King`;
  }
  if (reachedMaxTurns) {
    return "Draw / max turns reached";
  }
  return playOutcome ?? "In progress";
}

function formatOnlineReason(reason: NonNullable<OnlineGameDocument["reason"]>): string {
  switch (reason) {
    case "kingCaptured":
      return "King captured";
    case "maxTurns":
      return "Draw / max turns reached";
    case "noLegalMoves":
      return "Draw / no legal moves";
  }
}

function getStoredPieceLabelMode(): PieceLabelMode {
  const stored = window.localStorage.getItem(PIECE_LABEL_MODE_STORAGE_KEY);
  return stored === "traditionalChinese" ? "traditionalChinese" : "english";
}
