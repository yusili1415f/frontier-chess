import { createEmptyBoard, getPiecePosition, isFrontierLine, isFrontierZone, setPieceAt } from "./board";
import { shouldCannonCaptureUseCombat, shouldTriggerCombat, resolveCombat } from "./combat";
import { getCombatProfileForPiece, getPieceAbbreviation, getPieceDisplayLabel, getPieceIconPath } from "./data/classProfiles";
import { applyMove, createInitialGameState } from "./gameState";
import { countInterveningPieces, getLegalMove, getLegalMovesForPiece } from "./movement";
import { classifyMove } from "./movement";
import { applyPromotionIfNeeded } from "./promotion";
import { getAllLegalMovesForSide } from "./simulation/randomAI";
import { runBatchRandomSimulations, runRandomSimulation } from "./simulation/simulator";
import { chooseHeuristicMove, runBatchHeuristicSimulations, runHeuristicSimulation } from "./simulation/heuristicAI";
import { getCombatWinProbability, scoreMove } from "./simulation/moveScoring";
import { collectBalanceMetrics } from "./simulation/balanceMetrics";
import { runBalanceSimulation } from "./simulation/balanceSimulator";
import { getNextSwitchedMode, isAITurn, isHumanTurn } from "./ai/aiTurn";
import { annotateLastMove, createGameSnapshot } from "./history";
import { getCheckedSides, getKingThreats, isKingInCheck } from "./kingThreat";
import { deriveLastMoveHighlight } from "./lastMoveHighlight";
import {
  autoRollExpiredPendingCombat,
  createPendingCombat,
  pendingCombatToForcedDice,
  rollPendingCombatSide,
} from "./pendingCombat";
import { createReplaySnapshots } from "./replay";
import {
  deserializeGameStateFromFirestore,
  hasNestedArray,
  serializeGameStateForFirestore,
} from "./online/firestoreSerialization";
import { OnlineGameDocument } from "./online/onlineTypes";
import { startOnlineRematchIfBothAccepted } from "../services/onlineGameService";
import { GameState, LegalMove, Piece, Position } from "./types";

type ValidationResult = {
  passed: boolean;
  messages: string[];
};

export function runRuleValidation(): ValidationResult {
  const checks: Array<[string, () => boolean]> = [
    ["Board has 7x7 = 49 squares", validatesBoardSize],
    ["Each side starts with 14 pieces", validatesPieceCounts],
    ["Blue Cannon starts at C1 and Blue Bishop starts at E1", validatesBlueBackRankSwap],
    ["Red Bishop remains at C7 and Red Cannon remains at E7", validatesRedBackRankUnchanged],
    ["Blue starts on rows 1-2; Red starts on rows 6-7", validatesStartingTerritories],
    ["Frontier Zone is rows 3-5", validatesFrontierZone],
    ["Frontier Line is row 4", validatesFrontierLine],
    ["Combat triggers only when target square is in rows 3-5", validatesCombatTrigger],
    ["Attacker wins ties", validatesAttackerWinsTies],
    ["Friendly pieces cannot be captured", validatesFriendlyBlock],
    ["Sliding pieces cannot jump over pieces", validatesSlidingBlockers],
    ["Knight can jump", validatesKnightJump],
    ["King moves one square", validatesKingMovesOneSquare],
    ["Guard moves one square", validatesGuardMovesOneSquare],
    ["Rook moves orthogonally", validatesRookMovesOrthogonally],
    ["Bishop moves diagonally", validatesBishopMovesDiagonally],
    ["Blue Pawn before crossing moves toward higher rows", validatesBluePawnForward],
    ["Red Pawn before crossing moves toward lower rows", validatesRedPawnForward],
    ["Pawn before crossing can capture forward and diagonal-forward", validatesPawnPreCrossCaptures],
    ["Pawn movement changes after crossing the Frontier Line", validatesPawnCrossing],
    ["Red Pawn on row 3 uses crossed movement", validatesRedPawnCrossing],
    ["Pawn still moves only one square", validatesPawnOneSquare],
    ["Cannon cannot capture with 0 intervening pieces", validatesCannonNeedsScreen],
    ["Cannon can capture with exactly 1 intervening piece", validatesCannonOneScreen],
    ["Cannon cannot capture with 2 or more intervening pieces", validatesCannonTooManyScreens],
    ["Cannon can use friendly or enemy pieces as the screen", validatesCannonAnyScreen],
    ["Cannon capture from home territory does not trigger dice combat", validatesCannonHomeDirectCapture],
    ["Cannon capture outside home uses combat only when target is in the Frontier Zone", validatesCannonOutsideHomeCombat],
    ["Cannon normal movement is orthogonal and path-clear", validatesCannonNormalMovement],
    ["Cannon normal movement remains blocked by occupied squares", validatesCannonMovementBlocked],
    ["Cannon cannot capture diagonally", validatesCannonNoDiagonalCapture],
    ["If attacker wins combat, attacker moves to target square", validatesAttackerWinPlacement],
    ["If defender wins combat, attacker is removed and defender stays", validatesDefenderWinPlacement],
    ["Blue Pawn moving to row 5 becomes promoted", validatesBluePawnPromotion],
    ["Blue Pawn moving back to row 4 remains promoted", validatesBluePawnPromotionPersists],
    ["Red Pawn moving to row 3 becomes promoted", validatesRedPawnPromotion],
    ["Red Pawn moving back to row 4 remains promoted", validatesRedPawnPromotionPersists],
    ["Blue Guard moving to row 5 becomes promoted", validatesBlueGuardPromotion],
    ["Blue Guard moving back to row 4 remains promoted", validatesBlueGuardPromotionPersists],
    ["Red Guard moving to row 3 becomes promoted", validatesRedGuardPromotion],
    ["Red Guard moving back to row 4 remains promoted", validatesRedGuardPromotionPersists],
    ["Promoted Pawn uses FrontierPawn profile regardless of current row", validatesFrontierPawnProfile],
    ["Promoted Guard uses FrontierGuard profile regardless of current row", validatesFrontierGuardProfile],
    ["Non-promoted Pawn and Guard use normal profiles", validatesUnpromotedProfiles],
    ["King, Rook, Knight, Bishop and Cannon never promote", validatesOnlyPawnGuardPromote],
    ["classifyMove reports promotion on legal Frontier landing", validatesClassifyMovePromotion],
    ["Combat uses Frontier profiles when piece.promoted is true", validatesCombatUsesFrontierProfiles],
    ["Board display abbreviations are K/R/N/B/C/G/P", validatesPieceAbbreviations],
    ["Promoted Pawn and Guard display as P★ and G★", validatesPromotedAbbreviations],
    ["Traditional Chinese labels are 王/車/馬/相/炮/士/兵", validatesTraditionalChineseLabels],
    ["Traditional Chinese promoted Pawn and Guard display as 兵★ and 士★", validatesTraditionalChinesePromotedLabels],
    ["Icon mode uses side-specific icon asset paths", validatesPieceIconPaths],
    ["Promoted Pawn and Guard use frontier icon assets", validatesPromotedPieceIconPaths],
    ["Changing piece label mode does not affect legal moves", validatesLabelModeDoesNotAffectLegalMoves],
    ["Random AI never selects illegal moves", validatesRandomAiLegalMoves],
    ["Simulation stops when a King is captured", validatesSimulationKingCaptureStop],
    ["Simulation stops at max turn limit", validatesSimulationMaxTurns],
    ["Simulation can run 10 games without crashing", validatesTenGameBatch],
    ["Simulation can run 100 games without crashing", validatesHundredGameBatch],
    ["Promotion still works during simulation moves", validatesSimulationPromotion],
    ["Cannon capture still works during simulation moves", validatesSimulationCannonCapture],
    ["Combat uses attacker-wins-ties during simulation moves", validatesSimulationTieCombat],
    ["Combat win probability returns 0-1", validatesCombatProbabilityRange],
    ["Identical profiles favor attacker due to ties", validatesIdenticalProfileTieProbability],
    ["Capturing King scores extremely highly", validatesKingCaptureScore],
    ["High-value direct capture scores above low-value capture", validatesCaptureValueScoring],
    ["Combat capture score accounts for win/loss probability", validatesCombatExpectedValueScoring],
    ["Promotion move receives promotion bonus", validatesPromotionScoring],
    ["Heuristic AI only selects legal moves", validatesHeuristicSelectsLegalMove],
    ["Heuristic simulation stops when King is captured", validatesHeuristicKingCaptureStop],
    ["10 heuristic simulations run without crashing", validatesTenHeuristicGames],
    ["100 heuristic simulations run without crashing", validatesHundredHeuristicGames],
    ["Balance simulator can run 10 games", validatesTenBalanceGames],
    ["Balance simulator can run 100 games", validatesHundredBalanceGames],
    ["Balance outcomes total equals games run", validatesBalanceOutcomeTotals],
    ["Balance win rates and draw rate sum to approximately 100%", validatesBalanceRates],
    ["Balance average turns matches total turns", validatesBalanceAverageTurns],
    ["Balance piece stats aggregate captures", validatesBalancePieceStatsAggregate],
    ["Balance tracks Cannon captures separately", validatesBalanceCannonTracking],
    ["Balance tracks promotion counts", validatesBalancePromotionTracking],
    ["Balance metrics track attacker tie wins", validatesBalanceTieWinTracking],
    ["Balance simulator runs Heuristic Blue vs Random Red", validatesBalanceHeuristicBlueRandomRed],
    ["Balance simulator runs Random Blue vs Heuristic Red", validatesBalanceRandomBlueHeuristicRed],
    ["Balance simulation does not mutate the visible board state", validatesBalanceDoesNotMutateExternalState],
    ["Human Blue vs AI Red allows Blue human to move first", validatesHumanBlueCanMoveFirst],
    ["Human Blue vs AI Red marks Red as an AI turn after Blue moves", validatesRedAutoTurnAfterBlueMove],
    ["Human Blue vs AI Red prevents selecting Red pieces on Blue human turn", validatesHumanCannotSelectRedPiece],
    ["Human cannot act while AI side is thinking", validatesHumanBlockedOnAITurn],
    ["Heuristic Blue vs Human Red marks Blue as AI on the first turn", validatesAIBlueMovesFirst],
    ["AI vs AI treats both sides as AI turns", validatesAIVsAIModel],
    ["Play-mode AI move uses legal heuristic moves only", validatesPlayModeAIMoveLegal],
    ["AI move explanation has score reasons", validatesAIMoveExplanationData],
    ["Game still stops after King capture in play mode", validatesPlayModeKingCaptureStop],
    ["Switching game mode helper does not alter board state", validatesSwitchModeDoesNotMutateBoard],
    ["Undo snapshot restores previous board state", validatesUndoRestoresBoard],
    ["Undo snapshot restores promoted status", validatesUndoRestoresPromotion],
    ["Undo snapshot restores captured pieces", validatesUndoRestoresCapturedPieces],
    ["Undo snapshot after combat restores both pieces", validatesUndoRestoresCombatPieces],
    ["Undo snapshot after Cannon direct capture restores screen and target", validatesUndoRestoresCannonCapture],
    ["Human vs AI undo grouping removes a human plus AI move pair", validatesHumanAIUndoPairGrouping],
    ["Reset-style snapshot clears log and AI state", validatesResetSnapshotClearsState],
    ["Replay snapshots expose start, previous and next positions", validatesReplaySnapshots],
    ["AI turn helper does not allow AI movement during replay-equivalent paused state", validatesReplayBlocksAITurn],
    ["Game-over state is restorable through snapshots", validatesGameOverSnapshotRestore],
    ["Online serialized game state contains no nested arrays", validatesOnlineSerializationHasNoNestedArrays],
    ["Online serialized board reconstructs correctly", validatesOnlineSerializationRebuildsBoard],
    ["Online serialization preserves starting Blue and Red piece squares", validatesOnlineSerializationStartingSquares],
    ["Online serialization preserves promoted status", validatesOnlineSerializationPromotion],
    ["Online serialization preserves Cannon screen move history", validatesOnlineSerializationCannonScreenHistory],
    ["Online serialization preserves combat move history", validatesOnlineSerializationCombatHistory],
    ["Online deserialized state still validates legal moves", validatesOnlineDeserializedLegalMoves],
    ["Online rematch waits for both players", validatesOnlineRematchWaitsForBothPlayers],
    ["Online rematch starts next match in same room", validatesOnlineRematchStartsNextMatch],
    ["Online rematch can swap player sides", validatesOnlineRematchCanSwapSides],
    ["Last move highlight derives normal move", validatesLastMoveHighlightNormalMove],
    ["Last move highlight derives direct capture and Cannon screen", validatesLastMoveHighlightDirectCapture],
    ["Last move highlight derives attacker-won combat", validatesLastMoveHighlightAttackerWonCombat],
    ["Last move highlight derives defender-won combat", validatesLastMoveHighlightDefenderWonCombat],
    ["Last move highlight derives promotion", validatesLastMoveHighlightPromotion],
    ["King with no threats is not in check", validatesKingNoThreats],
    ["King with one legal attacker is in check", validatesKingOneThreat],
    ["King with multiple legal attackers returns multiple threats", validatesKingMultipleThreats],
    ["Cannon gives check with exactly 1 screen", validatesCannonCheckOneScreen],
    ["Cannon does not give check with 0 screens", validatesCannonCheckZeroScreens],
    ["Cannon does not give check with 2 or more screens", validatesCannonCheckTooManyScreens],
    ["Frontier Zone combat attack still counts as check", validatesCombatCaptureCheck],
    ["Move record marks checked side after a checking move", validatesMoveRecordCheckMarker],
    ["Manual combat roll maps die face to profile value", validatesManualRollProfileMapping],
    ["Manual combat roll preserves attacker-wins-ties", validatesManualRollAttackerWinsTies],
    ["Manual combat timeout auto-rolls missing dice", validatesManualRollTimeoutAutoRoll],
    ["Automatic combat mode still resolves without manual flag", validatesAutomaticCombatUnchanged],
  ];

  const messages = checks.map(([name, run]) => `${run() ? "PASS" : "FAIL"}: ${name}`);
  return {
    passed: messages.every((message) => message.startsWith("PASS")),
    messages,
  };
}

function validatesBoardSize(): boolean {
  const state = createInitialGameState();
  return state.board.length === 7 && state.board.every((rank) => rank.length === 7) && state.board.flat().length === 49;
}

function validatesPieceCounts(): boolean {
  const state = createInitialGameState();
  return countSide(state, "Blue") === 14 && countSide(state, "Red") === 14;
}

function validatesBlueBackRankSwap(): boolean {
  const state = createInitialGameState();
  return pieceAt(state, { col: 2, row: 1 })?.type === "Cannon" &&
    pieceAt(state, { col: 2, row: 1 })?.side === "Blue" &&
    pieceAt(state, { col: 4, row: 1 })?.type === "Bishop" &&
    pieceAt(state, { col: 4, row: 1 })?.side === "Blue";
}

function validatesRedBackRankUnchanged(): boolean {
  const state = createInitialGameState();
  return pieceAt(state, { col: 2, row: 7 })?.type === "Bishop" &&
    pieceAt(state, { col: 2, row: 7 })?.side === "Red" &&
    pieceAt(state, { col: 4, row: 7 })?.type === "Cannon" &&
    pieceAt(state, { col: 4, row: 7 })?.side === "Red";
}

function validatesStartingTerritories(): boolean {
  const state = createInitialGameState();
  return Object.values(state.pieces).every((piece) => {
    const position = getPiecePosition(state.board, piece.id);
    if (!position) {
      return false;
    }
    return piece.side === "Blue" ? position.row === 1 || position.row === 2 : position.row === 6 || position.row === 7;
  });
}

function validatesFrontierZone(): boolean {
  return [1, 2, 6, 7].every((row) => !isFrontierZone({ col: 3, row })) &&
    [3, 4, 5].every((row) => isFrontierZone({ col: 3, row }));
}

function validatesFrontierLine(): boolean {
  return [1, 2, 3, 5, 6, 7].every((row) => !isFrontierLine({ col: 3, row })) &&
    isFrontierLine({ col: 3, row: 4 });
}

function validatesCombatTrigger(): boolean {
  return [1, 2, 6, 7].every((row) => !shouldTriggerCombat({ col: 2, row })) &&
    [3, 4, 5].every((row) => shouldTriggerCombat({ col: 2, row }));
}

function validatesAttackerWinsTies(): boolean {
  const attacker: Piece = { id: "Blue-King", side: "Blue", type: "King" };
  const defender: Piece = { id: "Red-King", side: "Red", type: "King" };
  const result = resolveCombat(attacker, defender, { col: 3, row: 4 }, () => 0);
  return result.attackerWon && result.winner === "Blue";
}

function validatesFriendlyBlock(): boolean {
  const state = createInitialGameState();
  const king = Object.values(state.pieces).find((piece) => piece.side === "Blue" && piece.type === "King");
  if (!king) {
    return false;
  }
  return !getLegalMovesForPiece(state, king.id).some((move) => same(move.to, { col: 3, row: 2 }));
}

function validatesSlidingBlockers(): boolean {
  const state = createInitialGameState();
  const rook = pieceAt(state, { col: 0, row: 1 });
  if (!rook) {
    return false;
  }
  const moves = getLegalMovesForPiece(state, rook.id);
  return !moves.some((move) => same(move.to, { col: 0, row: 3 }));
}

function validatesKnightJump(): boolean {
  const state = createInitialGameState();
  const knight = pieceAt(state, { col: 1, row: 1 });
  if (!knight) {
    return false;
  }
  const moves = getLegalMovesForPiece(state, knight.id);
  return moves.some((move) => same(move.to, { col: 0, row: 3 })) && moves.some((move) => same(move.to, { col: 2, row: 3 }));
}

function validatesKingMovesOneSquare(): boolean {
  const state = customState([bluePiece("king", "King", { col: 3, row: 3 })]);
  const moves = getLegalMovesForPiece(state, "king");
  return moves.length === 8 && moves.every((move) => Math.max(Math.abs(move.to.col - 3), Math.abs(move.to.row - 3)) === 1);
}

function validatesGuardMovesOneSquare(): boolean {
  const state = customState([bluePiece("guard", "Guard", { col: 3, row: 3 })]);
  const moves = getLegalMovesForPiece(state, "guard");
  return moves.length === 8 && moves.every((move) => Math.max(Math.abs(move.to.col - 3), Math.abs(move.to.row - 3)) === 1);
}

function validatesRookMovesOrthogonally(): boolean {
  const state = customState([bluePiece("rook", "Rook", { col: 3, row: 3 })]);
  const moves = getLegalMovesForPiece(state, "rook");
  return moves.length === 12 && moves.every((move) => move.to.col === 3 || move.to.row === 3);
}

function validatesBishopMovesDiagonally(): boolean {
  const state = customState([bluePiece("bishop", "Bishop", { col: 3, row: 4 })]);
  const moves = getLegalMovesForPiece(state, "bishop");
  return moves.length === 12 && moves.every((move) => Math.abs(move.to.col - 3) === Math.abs(move.to.row - 4));
}

function validatesBluePawnForward(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 2 })]);
  const moves = getLegalMovesForPiece(state, "pawn");
  return moves.some((move) => same(move.to, { col: 3, row: 3 })) &&
    !moves.some((move) => same(move.to, { col: 3, row: 1 }));
}

function validatesRedPawnForward(): boolean {
  const state = customState([redTypedPiece("pawn", "Pawn", { col: 3, row: 6 })], "Red");
  const moves = getLegalMovesForPiece(state, "pawn");
  return moves.some((move) => same(move.to, { col: 3, row: 5 })) &&
    !moves.some((move) => same(move.to, { col: 3, row: 7 }));
}

function validatesPawnPreCrossCaptures(): boolean {
  const state = customState([
    bluePiece("pawn", "Pawn", { col: 3, row: 2 }),
    redPiece("forward", { col: 3, row: 3 }),
    redPiece("left", { col: 2, row: 3 }),
    redPiece("right", { col: 4, row: 3 }),
  ]);
  const captures = getLegalMovesForPiece(state, "pawn").filter((move) => move.kind === "capture");
  return captures.length === 3 &&
    captures.some((move) => same(move.to, { col: 3, row: 3 })) &&
    captures.some((move) => same(move.to, { col: 2, row: 3 })) &&
    captures.some((move) => same(move.to, { col: 4, row: 3 }));
}

function validatesPawnCrossing(): boolean {
  const before = customState([
    { id: "before", side: "Blue", type: "Pawn", position: { col: 3, row: 2 } },
  ]);
  const after = customState([{ id: "after", side: "Blue", type: "Pawn", position: { col: 3, row: 5 } }]);
  const beforeMoves = getLegalMovesForPiece(before, "before");
  const afterMoves = getLegalMovesForPiece(after, "after");

  return !beforeMoves.some((move) => same(move.to, { col: 2, row: 2 })) &&
    afterMoves.some((move) => same(move.to, { col: 2, row: 5 })) &&
    afterMoves.some((move) => same(move.to, { col: 4, row: 5 }));
}

function validatesRedPawnCrossing(): boolean {
  const state = customState([redTypedPiece("pawn", "Pawn", { col: 3, row: 3 })], "Red");
  const moves = getLegalMovesForPiece(state, "pawn");
  return moves.some((move) => same(move.to, { col: 2, row: 3 })) &&
    moves.some((move) => same(move.to, { col: 4, row: 3 }));
}

function validatesPawnOneSquare(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 5 })]);
  return getLegalMovesForPiece(state, "pawn").every((move) => Math.max(Math.abs(move.to.col - 3), Math.abs(move.to.row - 5)) === 1);
}

function validatesCannonNeedsScreen(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);

  return !hasLegalCapture(state, "cannon", { col: 4, row: 5 }) &&
    countInterveningPieces(state.board, { col: 4, row: 1 }, { col: 4, row: 5 }) === 0;
}

function validatesCannonOneScreen(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    bluePiece("screen", "Pawn", { col: 4, row: 2 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);

  return hasLegalCapture(state, "cannon", { col: 4, row: 5 }) &&
    countInterveningPieces(state.board, { col: 4, row: 1 }, { col: 4, row: 5 }) === 1;
}

function validatesCannonTooManyScreens(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    bluePiece("screen-1", "Pawn", { col: 4, row: 2 }),
    redPiece("screen-2", { col: 4, row: 3 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);

  return !hasLegalCapture(state, "cannon", { col: 4, row: 5 }) &&
    countInterveningPieces(state.board, { col: 4, row: 1 }, { col: 4, row: 5 }) === 2;
}

function validatesCannonAnyScreen(): boolean {
  const friendlyScreen = customState([
    blueCannon({ col: 4, row: 3 }),
    bluePiece("friendly-screen", "Pawn", { col: 4, row: 4 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);
  const enemyScreen = customState([
    blueCannon({ col: 4, row: 3 }),
    redPiece("enemy-screen", { col: 4, row: 4 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);

  return hasLegalCapture(friendlyScreen, "cannon", { col: 4, row: 5 }) &&
    hasLegalCapture(enemyScreen, "cannon", { col: 4, row: 5 });
}

function validatesCannonHomeDirectCapture(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    bluePiece("screen", "Pawn", { col: 4, row: 2 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);
  const move = getLegalMove(state, "cannon", { col: 4, row: 5 });
  if (!move || shouldCannonCaptureUseCombat(state, state.pieces.cannon, move.to)) {
    return false;
  }

  const next = applyMove(state, "cannon", move);
  return next.lastMove?.capturedPieceId === "target" && !next.lastMove.combat;
}

function validatesCannonOutsideHomeCombat(): boolean {
  const frontierTarget = customState([
    blueCannon({ col: 4, row: 3 }),
    bluePiece("screen", "Pawn", { col: 4, row: 4 }),
    redPiece("target", { col: 4, row: 5 }),
  ]);
  const nonFrontierTarget = customState([
    blueCannon({ col: 4, row: 3 }),
    bluePiece("screen", "Pawn", { col: 4, row: 4 }),
    redPiece("target", { col: 4, row: 6 }),
  ]);
  const frontierMove = getLegalMove(frontierTarget, "cannon", { col: 4, row: 5 });
  const nonFrontierMove = getLegalMove(nonFrontierTarget, "cannon", { col: 4, row: 6 });

  if (!frontierMove || !nonFrontierMove) {
    return false;
  }

  const frontierNext = applyMove(frontierTarget, "cannon", frontierMove);
  const nonFrontierNext = applyMove(nonFrontierTarget, "cannon", nonFrontierMove);

  return shouldCannonCaptureUseCombat(frontierTarget, frontierTarget.pieces.cannon, frontierMove.to) &&
    Boolean(frontierNext.lastMove?.combat) &&
    !shouldCannonCaptureUseCombat(nonFrontierTarget, nonFrontierTarget.pieces.cannon, nonFrontierMove.to) &&
    !nonFrontierNext.lastMove?.combat;
}

function validatesCannonNormalMovement(): boolean {
  const state = customState([blueCannon({ col: 2, row: 1 })]);
  const moves = getLegalMovesForPiece(state, "cannon");
  return moves.some((move) => move.kind === "move" && same(move.to, { col: 2, row: 7 })) &&
    moves.every((move) => move.to.col === 2 || move.to.row === 1);
}

function validatesCannonMovementBlocked(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    bluePiece("blocker", "Pawn", { col: 4, row: 2 }),
  ]);
  const moves = getLegalMovesForPiece(state, "cannon");
  return !moves.some((move) => move.kind === "move" && same(move.to, { col: 4, row: 3 }));
}

function validatesCannonNoDiagonalCapture(): boolean {
  const state = customState([
    blueCannon({ col: 4, row: 1 }),
    bluePiece("screen", "Pawn", { col: 4, row: 2 }),
    redPiece("target", { col: 5, row: 2 }),
  ]);

  return !hasLegalCapture(state, "cannon", { col: 5, row: 2 }) &&
    countInterveningPieces(state.board, { col: 4, row: 1 }, { col: 5, row: 2 }) === Number.POSITIVE_INFINITY;
}

function validatesAttackerWinPlacement(): boolean {
  const state = customState([
    bluePiece("attacker", "Knight", { col: 3, row: 3 }),
    redPiece("defender", { col: 4, row: 5 }),
  ]);
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) {
    return false;
  }
  const next = applyMove({ ...state, forcedDice: { attackerRollIndex: 5, defenderRollIndex: 0 } }, "attacker", move);
  return pieceAt(next, { col: 4, row: 5 })?.id === "attacker" && !next.pieces.defender;
}

function validatesDefenderWinPlacement(): boolean {
  const state = customState([
    bluePiece("attacker", "Bishop", { col: 3, row: 3 }),
    redTypedPiece("defender", "Knight", { col: 4, row: 4 }),
  ]);
  const move = getLegalMove(state, "attacker", { col: 4, row: 4 });
  if (!move) {
    return false;
  }
  const next = applyMove({ ...state, forcedDice: { attackerRollIndex: 0, defenderRollIndex: 5 } }, "attacker", move);
  return pieceAt(next, { col: 4, row: 4 })?.id === "defender" && !next.pieces.attacker;
}

function validatesBluePawnPromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const move = getLegalMove(state, "pawn", { col: 3, row: 5 });
  return Boolean(move && applyMove(state, "pawn", move).pieces.pawn.promoted);
}

function validatesBluePawnPromotionPersists(): boolean {
  const pawn = bluePiece("pawn", "Pawn", { col: 3, row: 5 });
  const promoted = applyPromotionIfNeeded(pawn, { col: 3, row: 5 });
  return applyPromotionIfNeeded(promoted, { col: 3, row: 4 }).promoted === true;
}

function validatesRedPawnPromotion(): boolean {
  const state = customState([redTypedPiece("pawn", "Pawn", { col: 3, row: 4 })], "Red");
  const move = getLegalMove(state, "pawn", { col: 3, row: 3 });
  return Boolean(move && applyMove(state, "pawn", move).pieces.pawn.promoted);
}

function validatesRedPawnPromotionPersists(): boolean {
  const pawn = redTypedPiece("pawn", "Pawn", { col: 3, row: 3 });
  const promoted = applyPromotionIfNeeded(pawn, { col: 3, row: 3 });
  return applyPromotionIfNeeded(promoted, { col: 3, row: 4 }).promoted === true;
}

function validatesBlueGuardPromotion(): boolean {
  const state = customState([bluePiece("guard", "Guard", { col: 3, row: 4 })]);
  const move = getLegalMove(state, "guard", { col: 3, row: 5 });
  return Boolean(move && applyMove(state, "guard", move).pieces.guard.promoted);
}

function validatesBlueGuardPromotionPersists(): boolean {
  const promotedState = customState([{ ...bluePiece("guard", "Guard", { col: 3, row: 5 }), promoted: true }]);
  const move = getLegalMove(promotedState, "guard", { col: 3, row: 4 });
  return Boolean(move && applyMove(promotedState, "guard", move).pieces.guard.promoted);
}

function validatesRedGuardPromotion(): boolean {
  const state = customState([redTypedPiece("guard", "Guard", { col: 3, row: 4 })], "Red");
  const move = getLegalMove(state, "guard", { col: 3, row: 3 });
  return Boolean(move && applyMove(state, "guard", move).pieces.guard.promoted);
}

function validatesRedGuardPromotionPersists(): boolean {
  const promotedState = customState([{ ...redTypedPiece("guard", "Guard", { col: 3, row: 3 }), promoted: true }], "Red");
  const move = getLegalMove(promotedState, "guard", { col: 3, row: 4 });
  return Boolean(move && applyMove(promotedState, "guard", move).pieces.guard.promoted);
}

function validatesFrontierPawnProfile(): boolean {
  const promotedPawn: Piece = { id: "pawn", side: "Blue", type: "Pawn", promoted: true };
  return getCombatProfileForPiece(promotedPawn).join(",") === "1,2,3,4,4,5";
}

function validatesFrontierGuardProfile(): boolean {
  const promotedGuard: Piece = { id: "guard", side: "Red", type: "Guard", promoted: true };
  return getCombatProfileForPiece(promotedGuard).join(",") === "2,3,4,5,5,6";
}

function validatesUnpromotedProfiles(): boolean {
  const pawn: Piece = { id: "pawn", side: "Blue", type: "Pawn" };
  const guard: Piece = { id: "guard", side: "Blue", type: "Guard" };
  return getCombatProfileForPiece(pawn).join(",") === "0,2,2,3,3,4" &&
    getCombatProfileForPiece(guard).join(",") === "1,3,3,4,5,6";
}

function validatesOnlyPawnGuardPromote(): boolean {
  const types: Piece["type"][] = ["King", "Rook", "Knight", "Bishop", "Cannon"];
  return types.every((type) => {
    const piece = bluePiece(type.toLowerCase(), type, { col: 3, row: 4 });
    return !applyPromotionIfNeeded(piece, { col: 3, row: 5 }).promoted;
  });
}

function validatesClassifyMovePromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const classification = classifyMove(state, "pawn", { col: 3, row: 5 });
  return classification.legal && classification.kind === "normalMove" && classification.promotesPiece === true;
}

function validatesCombatUsesFrontierProfiles(): boolean {
  const attacker: Piece = { id: "attacker", side: "Blue", type: "Guard", promoted: true };
  const defender: Piece = { id: "defender", side: "Red", type: "Pawn", promoted: true };
  const result = resolveCombat(attacker, defender, { col: 3, row: 4 }, () => 0);
  return result.attackerValue === 2 && result.defenderValue === 1;
}

function validatesPieceAbbreviations(): boolean {
  const expected: Array<[Piece["type"], string]> = [
    ["King", "K"],
    ["Rook", "R"],
    ["Knight", "N"],
    ["Bishop", "B"],
    ["Cannon", "C"],
    ["Guard", "G"],
    ["Pawn", "P"],
  ];

  return expected.every(([type, abbreviation]) =>
    getPieceAbbreviation({ id: type, side: "Blue", type }) === abbreviation,
  );
}

function validatesPromotedAbbreviations(): boolean {
  return getPieceAbbreviation({ id: "pawn", side: "Blue", type: "Pawn", promoted: true }) === "P★" &&
    getPieceAbbreviation({ id: "guard", side: "Red", type: "Guard", promoted: true }) === "G★" &&
    getPieceAbbreviation({ id: "king", side: "Blue", type: "King", promoted: true }) === "K";
}

function validatesTraditionalChineseLabels(): boolean {
  const expected: Array<[Piece["type"], string]> = [
    ["King", "王"],
    ["Rook", "車"],
    ["Knight", "馬"],
    ["Bishop", "相"],
    ["Cannon", "炮"],
    ["Guard", "士"],
    ["Pawn", "兵"],
  ];

  return expected.every(([type, label]) =>
    getPieceDisplayLabel({ id: type, side: "Blue", type }, "traditionalChinese") === label,
  );
}

function validatesTraditionalChinesePromotedLabels(): boolean {
  return getPieceDisplayLabel({ id: "pawn", side: "Blue", type: "Pawn", promoted: true }, "traditionalChinese") === "兵★" &&
    getPieceDisplayLabel({ id: "guard", side: "Red", type: "Guard", promoted: true }, "traditionalChinese") === "士★" &&
    getPieceDisplayLabel({ id: "king", side: "Blue", type: "King", promoted: true }, "traditionalChinese") === "王";
}

function validatesPieceIconPaths(): boolean {
  return getPieceIconPath({ id: "king", side: "Blue", type: "King" }) === "/icons/blue/king.png" &&
    getPieceIconPath({ id: "cannon", side: "Red", type: "Cannon" }) === "/icons/red/cannon.png" &&
    getPieceIconPath({ id: "knight", side: "Blue", type: "Knight" }) === "/icons/blue/knight.png";
}

function validatesPromotedPieceIconPaths(): boolean {
  return getPieceIconPath({ id: "pawn", side: "Blue", type: "Pawn", promoted: true }) === "/icons/blue/frontier-pawn.png" &&
    getPieceIconPath({ id: "guard", side: "Red", type: "Guard", promoted: true }) === "/icons/red/frontier-guard.png" &&
    getPieceIconPath({ id: "pawn", side: "Red", type: "Pawn" }) === "/icons/red/pawn.png" &&
    getPieceIconPath({ id: "guard", side: "Blue", type: "Guard" }) === "/icons/blue/guard.png";
}

function validatesLabelModeDoesNotAffectLegalMoves(): boolean {
  const state = createInitialGameState();
  const piece = pieceAt(state, { col: 2, row: 1 });
  if (!piece) {
    return false;
  }
  const before = getLegalMovesForPiece(state, piece.id).map((move) => coordinateKey(move.to)).sort().join("|");
  getPieceDisplayLabel(piece, "english");
  getPieceDisplayLabel(piece, "traditionalChinese");
  getPieceDisplayLabel(piece, "icons");
  getPieceIconPath(piece);
  const after = getLegalMovesForPiece(state, piece.id).map((move) => coordinateKey(move.to)).sort().join("|");
  return before === after;
}

function validatesRandomAiLegalMoves(): boolean {
  const state = createInitialGameState();
  return getAllLegalMovesForSide(state, "Blue").every(({ pieceId, move }) => classifyMove(state, pieceId, move.to).legal);
}

function validatesSimulationKingCaptureStop(): boolean {
  const state = customState([
    { ...bluePiece("attacker", "Pawn", { col: 3, row: 6 }), promoted: true },
    bluePiece("block-left", "Pawn", { col: 2, row: 6 }),
    bluePiece("block-right", "Pawn", { col: 4, row: 6 }),
    bluePiece("block-forward-left", "Pawn", { col: 2, row: 7 }),
    bluePiece("block-forward-right", "Pawn", { col: 4, row: 7 }),
    redTypedPiece("king", "King", { col: 3, row: 7 }),
  ]);
  const result = runRandomSimulation(state, { maxTurns: 5, seed: 1 });
  return result.winner === "Blue" && result.reason === "kingCaptured";
}

function validatesSimulationMaxTurns(): boolean {
  const result = runRandomSimulation(createInitialGameState(), { maxTurns: 0, seed: 1 });
  return result.winner === "Draw" && result.reason === "maxTurns" && result.totalTurns === 0;
}

function validatesTenGameBatch(): boolean {
  return runBatchRandomSimulations(10, { maxTurns: 10, seed: 10 }).games === 10;
}

function validatesHundredGameBatch(): boolean {
  return runBatchRandomSimulations(100, { maxTurns: 5, seed: 100 }).games === 100;
}

function validatesSimulationPromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const result = runRandomSimulation(state, { maxTurns: 1, seed: 1 });
  return result.moves.some((move) => move.promotion) && result.finalState.pieces.pawn?.promoted === true;
}

function validatesSimulationCannonCapture(): boolean {
  const state = customState([
    blueCannon({ col: 2, row: 1 }),
    bluePiece("left-block", "Pawn", { col: 1, row: 1 }),
    bluePiece("right-block", "Pawn", { col: 3, row: 1 }),
    bluePiece("screen", "Pawn", { col: 2, row: 2 }),
    redPiece("target", { col: 2, row: 5 }),
  ]);
  const result = runRandomSimulation(state, { maxTurns: 1, seed: 1 });
  return result.moves.some((move) => move.moveKind === "directCapture" && move.targetPieceType === "Pawn");
}

function validatesSimulationTieCombat(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      bluePiece("block-b2", "Pawn", { col: 1, row: 2 }),
      bluePiece("block-b4", "Pawn", { col: 1, row: 4 }),
      bluePiece("block-c1", "Pawn", { col: 2, row: 1 }),
      bluePiece("block-c5", "Pawn", { col: 2, row: 5 }),
      bluePiece("block-e1", "Pawn", { col: 4, row: 1 }),
      bluePiece("block-f2", "Pawn", { col: 5, row: 2 }),
      bluePiece("block-f4", "Pawn", { col: 5, row: 4 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 4, defenderValue: 4 },
  };
  const result = runRandomSimulation(state, { maxTurns: 1, seed: 1 });
  return result.moves.some((move) => move.combatResult?.attackerWon === true);
}

function validatesCombatProbabilityRange(): boolean {
  const probability = getCombatWinProbability([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]);
  return probability >= 0 && probability <= 1;
}

function validatesIdenticalProfileTieProbability(): boolean {
  return getCombatWinProbability([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]) > 0.5;
}

function validatesKingCaptureScore(): boolean {
  const state = customState([
    bluePiece("rook", "Rook", { col: 3, row: 1 }),
    redTypedPiece("king", "King", { col: 3, row: 7 }),
  ]);
  const move = getLegalMove(state, "rook", { col: 3, row: 7 });
  return Boolean(move && scoreMove(state, "rook", move, "Blue").total > 10000);
}

function validatesCaptureValueScoring(): boolean {
  const highValueState = customState([
    bluePiece("rook", "Rook", { col: 3, row: 1 }),
    redTypedPiece("target", "Rook", { col: 3, row: 7 }),
  ]);
  const lowValueState = customState([
    bluePiece("rook", "Rook", { col: 3, row: 1 }),
    redPiece("target", { col: 3, row: 7 }),
  ]);
  const highMove = getLegalMove(highValueState, "rook", { col: 3, row: 7 });
  const lowMove = getLegalMove(lowValueState, "rook", { col: 3, row: 7 });

  return Boolean(highMove && lowMove && scoreMove(highValueState, "rook", highMove, "Blue").total >
    scoreMove(lowValueState, "rook", lowMove, "Blue").total);
}

function validatesCombatExpectedValueScoring(): boolean {
  const state = customState([
    bluePiece("knight", "Knight", { col: 3, row: 3 }),
    redPiece("pawn", { col: 4, row: 5 }),
  ]);
  const move = getLegalMove(state, "knight", { col: 4, row: 5 });
  const score = move ? scoreMove(state, "knight", move, "Blue") : undefined;
  return Boolean(score?.reasons.some((reason) => reason.label.startsWith("Combat EV")));
}

function validatesPromotionScoring(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const move = getLegalMove(state, "pawn", { col: 3, row: 5 });
  const score = move ? scoreMove(state, "pawn", move, "Blue") : undefined;
  return Boolean(score?.reasons.some((reason) => reason.label === "Pawn promotion" && reason.value === 3));
}

function validatesHeuristicSelectsLegalMove(): boolean {
  const state = createInitialGameState();
  const choice = chooseHeuristicMove(state, "Blue", { randomness: 0, seed: 1 });
  return Boolean(choice && classifyMove(state, choice.pieceId, choice.move.to).legal);
}

function validatesHeuristicKingCaptureStop(): boolean {
  const state = customState([
    { ...bluePiece("attacker", "Pawn", { col: 3, row: 6 }), promoted: true },
    bluePiece("block-left", "Pawn", { col: 2, row: 6 }),
    bluePiece("block-right", "Pawn", { col: 4, row: 6 }),
    bluePiece("block-forward-left", "Pawn", { col: 2, row: 7 }),
    bluePiece("block-forward-right", "Pawn", { col: 4, row: 7 }),
    redTypedPiece("king", "King", { col: 3, row: 7 }),
  ]);
  const result = runHeuristicSimulation(state, { maxTurns: 5, randomness: 0 });
  return result.winner === "Blue" && result.reason === "kingCaptured";
}

function validatesTenHeuristicGames(): boolean {
  return runBatchHeuristicSimulations(10, { maxTurns: 10, seed: 10 }).games === 10;
}

function validatesHundredHeuristicGames(): boolean {
  return runBatchHeuristicSimulations(100, { maxTurns: 5, seed: 100 }).games === 100;
}

function validatesTenBalanceGames(): boolean {
  return runBalanceSimulation({ games: 10, maxTurns: 5, seed: 10 }).gamesRun === 10;
}

function validatesHundredBalanceGames(): boolean {
  return runBalanceSimulation({ games: 100, maxTurns: 2, seed: 100, blueAI: "random", redAI: "random" }).gamesRun === 100;
}

function validatesBalanceOutcomeTotals(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 3, seed: 20 });
  return summary.blueWins + summary.redWins + summary.draws === summary.gamesRun;
}

function validatesBalanceRates(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 3, seed: 30 });
  return Math.abs(summary.blueWinRate + summary.redWinRate + summary.drawRate - 100) < 0.0001;
}

function validatesBalanceAverageTurns(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 0, seed: 40 });
  return summary.averageTurns === 0 && summary.shortestGameTurns === 0 && summary.longestGameTurns === 0;
}

function validatesBalancePieceStatsAggregate(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 4, seed: 50 });
  const capturedPieces = summary.pieceStats.reduce((sum, stats) => sum + stats.timesCaptured, 0);
  return capturedPieces === summary.totalCaptures;
}

function validatesBalanceCannonTracking(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 4, seed: 60 });
  return summary.cannonCaptures === summary.cannonStats.capturesSuccessful &&
    summary.averageCannonCapturesPerGame === summary.cannonStats.capturesSuccessful / summary.gamesRun;
}

function validatesBalancePromotionTracking(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 4, seed: 70 });
  const profilePromotions = summary.pieceStats
    .filter((stats) => stats.pieceType === "FrontierPawn" || stats.pieceType === "FrontierGuard")
    .reduce((sum, stats) => sum + stats.promotions, 0);
  return profilePromotions === summary.promotionStats.pawnPromotions + summary.promotionStats.guardPromotions;
}

function validatesBalanceTieWinTracking(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      bluePiece("block-b2", "Pawn", { col: 1, row: 2 }),
      bluePiece("block-b4", "Pawn", { col: 1, row: 4 }),
      bluePiece("block-c1", "Pawn", { col: 2, row: 1 }),
      bluePiece("block-c5", "Pawn", { col: 2, row: 5 }),
      bluePiece("block-e1", "Pawn", { col: 4, row: 1 }),
      bluePiece("block-f2", "Pawn", { col: 5, row: 2 }),
      bluePiece("block-f4", "Pawn", { col: 5, row: 4 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 4, defenderValue: 4 },
  };
  const result = runRandomSimulation(state, { maxTurns: 1, seed: 1 });
  return collectBalanceMetrics(result).combatStats.attackerTieWins === 1;
}

function validatesBalanceHeuristicBlueRandomRed(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 3, seed: 80, blueAI: "heuristic", redAI: "random" });
  return summary.gamesRun === 10 && summary.options.blueAI === "heuristic" && summary.options.redAI === "random";
}

function validatesBalanceRandomBlueHeuristicRed(): boolean {
  const summary = runBalanceSimulation({ games: 10, maxTurns: 3, seed: 90, blueAI: "random", redAI: "heuristic" });
  return summary.gamesRun === 10 && summary.options.blueAI === "random" && summary.options.redAI === "heuristic";
}

function validatesBalanceDoesNotMutateExternalState(): boolean {
  const state = createInitialGameState();
  const before = JSON.stringify(state);
  runBalanceSimulation({ games: 10, maxTurns: 3, seed: 1000 });
  return JSON.stringify(state) === before;
}

function validatesHumanBlueCanMoveFirst(): boolean {
  return isHumanTurn(createInitialGameState(), "human-blue-vs-ai-red");
}

function validatesRedAutoTurnAfterBlueMove(): boolean {
  const state = createInitialGameState();
  const choice = chooseHeuristicMove(state, "Blue", { randomness: 0, seed: 1 });
  if (!choice) {
    return false;
  }
  const afterBlueMove = applyMove(state, choice.pieceId, choice.move);
  return isAITurn(afterBlueMove, "human-blue-vs-ai-red") && afterBlueMove.turn === "Red";
}

function validatesHumanCannotSelectRedPiece(): boolean {
  const state = createInitialGameState();
  const redPiece = pieceAt(state, { col: 0, row: 7 });
  return Boolean(redPiece && redPiece.side === "Red" && redPiece.side !== state.turn && isHumanTurn(state, "human-blue-vs-ai-red"));
}

function validatesHumanBlockedOnAITurn(): boolean {
  const state = customState([redTypedPiece("red", "Knight", { col: 1, row: 7 })], "Red");
  return isAITurn(state, "human-blue-vs-ai-red") && !isHumanTurn(state, "human-blue-vs-ai-red");
}

function validatesAIBlueMovesFirst(): boolean {
  return isAITurn(createInitialGameState(), "ai-blue-vs-human-red");
}

function validatesAIVsAIModel(): boolean {
  const blueState = createInitialGameState();
  const redState = customState([redTypedPiece("red", "Knight", { col: 1, row: 7 })], "Red");
  return isAITurn(blueState, "ai-vs-ai") && isAITurn(redState, "ai-vs-ai");
}

function validatesPlayModeAIMoveLegal(): boolean {
  const state = createInitialGameState();
  const choice = chooseHeuristicMove(state, "Blue", { randomness: 0, seed: 1 });
  return Boolean(choice && classifyMove(state, choice.pieceId, choice.move.to).legal);
}

function validatesAIMoveExplanationData(): boolean {
  const state = createInitialGameState();
  const choice = chooseHeuristicMove(state, "Blue", { randomness: 0, seed: 1 });
  return Boolean(choice && Number.isFinite(choice.score.total) && choice.score.reasons.length > 0);
}

function validatesPlayModeKingCaptureStop(): boolean {
  const state = customState([
    { ...bluePiece("attacker", "Pawn", { col: 3, row: 6 }), promoted: true },
    bluePiece("block-left", "Pawn", { col: 2, row: 6 }),
    bluePiece("block-right", "Pawn", { col: 4, row: 6 }),
    bluePiece("block-forward-left", "Pawn", { col: 2, row: 7 }),
    bluePiece("block-forward-right", "Pawn", { col: 4, row: 7 }),
    redTypedPiece("king", "King", { col: 3, row: 7 }),
  ]);
  const result = runHeuristicSimulation(state, { maxTurns: 5, randomness: 0 });
  return result.winner === "Blue" && !isAITurn(result.finalState, "ai-vs-ai");
}

function validatesSwitchModeDoesNotMutateBoard(): boolean {
  const state = createInitialGameState();
  const before = JSON.stringify(state.board);
  const nextMode = getNextSwitchedMode("human-blue-vs-ai-red");
  return nextMode === "ai-blue-vs-human-red" && JSON.stringify(state.board) === before;
}

function validatesUndoRestoresBoard(): boolean {
  const state = createInitialGameState();
  const snapshot = createGameSnapshot(state);
  const pawn = pieceAt(state, { col: 0, row: 2 });
  const move = pawn ? getLegalMove(state, pawn.id, { col: 0, row: 3 }) : undefined;
  if (!move) return false;
  const moved = applyMove(state, pawn!.id, move);
  return JSON.stringify(snapshot.state.board) !== JSON.stringify(moved.board) &&
    JSON.stringify(snapshot.state.board) === JSON.stringify(createInitialGameState().board);
}

function validatesUndoRestoresPromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const snapshot = createGameSnapshot(state);
  const move = getLegalMove(state, "pawn", { col: 3, row: 5 });
  if (!move) return false;
  const moved = applyMove(state, "pawn", move);
  return moved.pieces.pawn.promoted === true && snapshot.state.pieces.pawn.promoted !== true;
}

function validatesUndoRestoresCapturedPieces(): boolean {
  const state = customState([
    bluePiece("rook", "Rook", { col: 0, row: 1 }),
    redPiece("target", { col: 0, row: 7 }),
  ]);
  const snapshot = createGameSnapshot(state);
  const move = getLegalMove(state, "rook", { col: 0, row: 7 });
  if (!move) return false;
  const moved = applyMove(state, "rook", move);
  return !moved.pieces.target && Boolean(snapshot.state.pieces.target);
}

function validatesUndoRestoresCombatPieces(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 6, defenderValue: 1 },
  };
  const snapshot = createGameSnapshot(state);
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) return false;
  const moved = applyMove(state, "attacker", move);
  return !moved.pieces.defender && Boolean(snapshot.state.pieces.attacker && snapshot.state.pieces.defender);
}

function validatesUndoRestoresCannonCapture(): boolean {
  const state = customState([
    blueCannon({ col: 2, row: 1 }),
    bluePiece("screen", "Pawn", { col: 2, row: 2 }),
    redPiece("target", { col: 2, row: 5 }),
  ]);
  const snapshot = createGameSnapshot(state);
  const move = getLegalMove(state, "cannon", { col: 2, row: 5 });
  if (!move) return false;
  const moved = applyMove(state, "cannon", move);
  return !moved.pieces.target && Boolean(snapshot.state.pieces.screen && snapshot.state.pieces.target);
}

function validatesHumanAIUndoPairGrouping(): boolean {
  const initial = createInitialGameState();
  const pawn = pieceAt(initial, { col: 0, row: 2 });
  const firstMove = pawn ? getLegalMove(initial, pawn.id, { col: 0, row: 3 }) : undefined;
  if (!firstMove) return false;
  const afterHuman = annotateLastMove(applyMove(initial, pawn!.id, firstMove), "Human");
  const aiChoice = chooseHeuristicMove(afterHuman, "Red", { randomness: 0, seed: 1 });
  if (!aiChoice) return false;
  const afterAI = annotateLastMove(applyMove(afterHuman, aiChoice.pieceId, aiChoice.move), "AI");
  const entries = [
    { actor: "Human" as const, before: createGameSnapshot(initial), after: createGameSnapshot(afterHuman), record: afterHuman.lastMove! },
    { actor: "AI" as const, before: createGameSnapshot(afterHuman), after: createGameSnapshot(afterAI), record: afterAI.lastMove! },
  ];
  const restored = entries[entries.length - 2].before.state;
  return entries.length === 2 && JSON.stringify(restored.board) === JSON.stringify(initial.board);
}

function validatesResetSnapshotClearsState(): boolean {
  const reset = createGameSnapshot(createInitialGameState());
  return reset.state.moveHistory.length === 0 && !reset.state.lastMove && !reset.aiExplanation && !reset.playOutcome;
}

function validatesReplaySnapshots(): boolean {
  const initial = createInitialGameState();
  const pawn = pieceAt(initial, { col: 0, row: 2 });
  const move = pawn ? getLegalMove(initial, pawn.id, { col: 0, row: 3 }) : undefined;
  if (!move) return false;
  const after = annotateLastMove(applyMove(initial, pawn!.id, move), "Human");
  const snapshots = createReplaySnapshots(createGameSnapshot(initial), [
    { actor: "Human", before: createGameSnapshot(initial), after: createGameSnapshot(after), record: after.lastMove! },
  ]);
  return snapshots.length === 2 &&
    pieceAt(snapshots[0].state, { col: 0, row: 2 })?.id === pawn!.id &&
    pieceAt(snapshots[1].state, { col: 0, row: 3 })?.id === pawn!.id;
}

function validatesReplayBlocksAITurn(): boolean {
  const state = customState([redTypedPiece("red", "Knight", { col: 1, row: 7 })], "Red");
  const replayActive = true;
  return isAITurn(state, "human-blue-vs-ai-red") && replayActive;
}

function validatesGameOverSnapshotRestore(): boolean {
  const state = customState([
    { ...bluePiece("attacker", "Pawn", { col: 3, row: 6 }), promoted: true },
    bluePiece("block-left", "Pawn", { col: 2, row: 6 }),
    bluePiece("block-right", "Pawn", { col: 4, row: 6 }),
    bluePiece("block-forward-left", "Pawn", { col: 2, row: 7 }),
    bluePiece("block-forward-right", "Pawn", { col: 4, row: 7 }),
    redTypedPiece("king", "King", { col: 3, row: 7 }),
  ]);
  const snapshot = createGameSnapshot(state);
  const result = runHeuristicSimulation(state, { maxTurns: 5, randomness: 0 });
  return result.finalState.winner === "Blue" && snapshot.state.winner === undefined;
}

function validatesOnlineSerializationHasNoNestedArrays(): boolean {
  return !hasNestedArray(serializeGameStateForFirestore(createInitialGameState()));
}

function validatesOnlineSerializationRebuildsBoard(): boolean {
  const state = createInitialGameState();
  const restored = deserializeGameStateFromFirestore(serializeGameStateForFirestore(state));
  return JSON.stringify(restored.board) === JSON.stringify(state.board) &&
    Object.keys(restored.pieces).length === Object.keys(state.pieces).length;
}

function validatesOnlineSerializationStartingSquares(): boolean {
  const restored = deserializeGameStateFromFirestore(serializeGameStateForFirestore(createInitialGameState()));
  return pieceAt(restored, { col: 2, row: 1 })?.type === "Cannon" &&
    pieceAt(restored, { col: 4, row: 1 })?.type === "Bishop" &&
    pieceAt(restored, { col: 2, row: 7 })?.type === "Bishop" &&
    pieceAt(restored, { col: 4, row: 7 })?.type === "Cannon";
}

function validatesOnlineSerializationPromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const move = getLegalMove(state, "pawn", { col: 3, row: 5 });
  if (!move) return false;
  const promoted = applyMove(state, "pawn", move);
  const restored = deserializeGameStateFromFirestore(serializeGameStateForFirestore(promoted));
  return restored.pieces.pawn.promoted === true;
}

function validatesOnlineSerializationCannonScreenHistory(): boolean {
  const state = customState([
    blueCannon({ col: 2, row: 1 }),
    bluePiece("screen", "Pawn", { col: 2, row: 2 }),
    redPiece("target", { col: 2, row: 5 }),
  ]);
  const move = getLegalMove(state, "cannon", { col: 2, row: 5 });
  if (!move) return false;
  const captured = applyMove(state, "cannon", move);
  const serialized = serializeGameStateForFirestore(captured);
  const restored = deserializeGameStateFromFirestore(serialized);
  return serialized.moveHistory[0]?.cannonScreenSquares?.[0] === "C2" &&
    restored.moveHistory[0]?.cannon?.screenSquares.some((square) => same(square, { col: 2, row: 2 })) === true;
}

function validatesOnlineSerializationCombatHistory(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 6, defenderValue: 1 },
  };
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) return false;
  const combat = applyMove(state, "attacker", move);
  const restored = deserializeGameStateFromFirestore(serializeGameStateForFirestore(combat));
  return restored.moveHistory[0]?.combat?.attackerValue === 6 &&
    restored.moveHistory[0]?.combat?.defenderValue === 1 &&
    restored.moveHistory[0]?.combat?.attackerWon === true;
}

function validatesOnlineDeserializedLegalMoves(): boolean {
  const restored = deserializeGameStateFromFirestore(serializeGameStateForFirestore(createInitialGameState()));
  const cannon = pieceAt(restored, { col: 2, row: 1 });
  return Boolean(cannon && getLegalMovesForPiece(restored, cannon.id).length > 0);
}

function validatesOnlineRematchWaitsForBothPlayers(): boolean {
  const game = finishedOnlineGame({ requestedByBlue: true, requestedByRed: false });
  const update = startOnlineRematchIfBothAccepted(game);
  return update.status === undefined &&
    update.rematch?.requestedByBlue === true &&
    update.rematch?.requestedByRed === false;
}

function validatesOnlineRematchStartsNextMatch(): boolean {
  const game = finishedOnlineGame({ requestedByBlue: true, requestedByRed: true });
  const update = startOnlineRematchIfBothAccepted(game);
  const restored = update.gameState ? deserializeGameStateFromFirestore(update.gameState) : undefined;
  return update.status === "active" &&
    update.currentPlayer === "Blue" &&
    update.matchNumber === 2 &&
    update.winner === null &&
    update.reason === null &&
    update.moveHistory?.length === 0 &&
    update.previousResults?.length === 1 &&
    update.bluePlayerId === "blue-player" &&
    update.redPlayerId === "red-player" &&
    restored?.turn === "Blue" &&
    restored.moveHistory.length === 0 &&
    pieceAt(restored, { col: 2, row: 1 })?.type === "Cannon";
}

function validatesOnlineRematchCanSwapSides(): boolean {
  const game = finishedOnlineGame({ requestedByBlue: true, requestedByRed: true, sideMode: "swap" });
  const update = startOnlineRematchIfBothAccepted(game);
  return update.bluePlayerId === "red-player" &&
    update.redPlayerId === "blue-player" &&
    update.currentPlayer === "Blue";
}

function validatesLastMoveHighlightNormalMove(): boolean {
  const state = createInitialGameState();
  const pawn = pieceAt(state, { col: 0, row: 2 });
  const move = pawn ? getLegalMove(state, pawn.id, { col: 0, row: 3 }) : undefined;
  if (!pawn || !move) return false;
  const next = applyMove(state, pawn.id, move);
  const highlight = deriveLastMoveHighlight(next.lastMove);
  return highlight.kind === "normalMove" &&
    same(highlight.from!, { col: 0, row: 2 }) &&
    same(highlight.to!, { col: 0, row: 3 }) &&
    highlight.movedPieceId === pawn.id;
}

function validatesLastMoveHighlightDirectCapture(): boolean {
  const state = customState([
    blueCannon({ col: 2, row: 1 }),
    bluePiece("screen", "Pawn", { col: 2, row: 2 }),
    redPiece("target", { col: 2, row: 5 }),
  ]);
  const move = getLegalMove(state, "cannon", { col: 2, row: 5 });
  if (!move) return false;
  const next = applyMove(state, "cannon", move);
  const highlight = deriveLastMoveHighlight(next.lastMove);
  return highlight.kind === "directCapture" &&
    same(highlight.from!, { col: 2, row: 1 }) &&
    same(highlight.to!, { col: 2, row: 5 }) &&
    highlight.cannonScreenSquares.some((square) => same(square, { col: 2, row: 2 }));
}

function validatesLastMoveHighlightAttackerWonCombat(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 6, defenderValue: 1 },
  };
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) return false;
  const next = applyMove(state, "attacker", move);
  const highlight = deriveLastMoveHighlight(next.lastMove);
  return highlight.kind === "combatAttackerWon" &&
    same(highlight.from!, { col: 3, row: 3 }) &&
    same(highlight.finalPieceSquare!, { col: 4, row: 5 });
}

function validatesLastMoveHighlightDefenderWonCombat(): boolean {
  const state = {
    ...customState([
      bluePiece("attacker", "Knight", { col: 3, row: 3 }),
      redPiece("defender", { col: 4, row: 5 }),
    ]),
    forcedDice: { attackerValue: 1, defenderValue: 6 },
  };
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) return false;
  const next = applyMove(state, "attacker", move);
  const highlight = deriveLastMoveHighlight(next.lastMove);
  return highlight.kind === "combatDefenderWon" &&
    same(highlight.from!, { col: 3, row: 3 }) &&
    same(highlight.finalPieceSquare!, { col: 4, row: 5 }) &&
    highlight.summary.includes("held the square");
}

function validatesLastMoveHighlightPromotion(): boolean {
  const state = customState([bluePiece("pawn", "Pawn", { col: 3, row: 4 })]);
  const move = getLegalMove(state, "pawn", { col: 3, row: 5 });
  if (!move) return false;
  const next = applyMove(state, "pawn", move);
  const highlight = deriveLastMoveHighlight(next.lastMove);
  return highlight.kind === "promotion" &&
    same(highlight.from!, { col: 3, row: 4 }) &&
    same(highlight.to!, { col: 3, row: 5 }) &&
    highlight.summary.includes("Promoted");
}

function validatesKingNoThreats(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 3, row: 1 }),
    redTypedPiece("red-rook", "Rook", { col: 0, row: 7 }),
  ], "Blue");

  return !isKingInCheck(state, "Blue") && getCheckedSides(state).length === 0;
}

function validatesKingOneThreat(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 3, row: 1 }),
    redTypedPiece("red-rook", "Rook", { col: 3, row: 7 }),
  ], "Blue");
  const threats = getKingThreats(state, "Blue");

  return threats.length === 1 &&
    threats[0].attackerPieceId === "red-rook" &&
    threats[0].attackKind === "directCapture";
}

function validatesKingMultipleThreats(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 3, row: 1 }),
    redTypedPiece("red-rook", "Rook", { col: 3, row: 7 }),
    redTypedPiece("red-bishop", "Bishop", { col: 6, row: 4 }),
  ], "Blue");

  return getKingThreats(state, "Blue").length === 2;
}

function validatesCannonCheckOneScreen(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 4, row: 5 }),
    redTypedPiece("red-cannon", "Cannon", { col: 4, row: 7 }),
    bluePiece("screen", "Pawn", { col: 4, row: 6 }),
  ], "Blue");
  const threats = getKingThreats(state, "Blue");

  return threats.length === 1 &&
    threats[0].attackerPieceId === "red-cannon" &&
    threats[0].reason.includes("exactly 1 screen");
}

function validatesCannonCheckZeroScreens(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 4, row: 5 }),
    redTypedPiece("red-cannon", "Cannon", { col: 4, row: 7 }),
  ], "Blue");

  return getKingThreats(state, "Blue").length === 0;
}

function validatesCannonCheckTooManyScreens(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 4, row: 4 }),
    redTypedPiece("red-cannon", "Cannon", { col: 4, row: 7 }),
    redTypedPiece("screen-one", "Pawn", { col: 4, row: 6 }),
    bluePiece("screen-two", "Pawn", { col: 4, row: 5 }),
  ], "Blue");

  return getKingThreats(state, "Blue").length === 0;
}

function validatesCombatCaptureCheck(): boolean {
  const state = customState([
    bluePiece("blue-king", "King", { col: 3, row: 4 }),
    redTypedPiece("red-knight", "Knight", { col: 1, row: 5 }),
  ], "Blue");
  const threats = getKingThreats(state, "Blue");

  return threats.length === 1 &&
    threats[0].attackerPieceId === "red-knight" &&
    threats[0].attackKind === "combatCapture";
}

function validatesMoveRecordCheckMarker(): boolean {
  const state = customState([
    bluePiece("blue-rook", "Rook", { col: 3, row: 1 }),
    redTypedPiece("red-king", "King", { col: 3, row: 7 }),
  ], "Blue");
  const move = getLegalMove(state, "blue-rook", { col: 3, row: 2 });
  if (!move) {
    return false;
  }

  const after = applyMove(state, "blue-rook", move);
  return after.lastMove?.checkedSides?.includes("Red") === true;
}

function validatesManualRollProfileMapping(): boolean {
  const state = customState([
    bluePiece("attacker", "Knight", { col: 3, row: 3 }),
    redPiece("defender", { col: 4, row: 5 }),
  ]);
  const attacker = state.pieces.attacker;
  const defender = state.pieces.defender;
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) {
    return false;
  }

  const pending = createPendingCombat(state, move, attacker, defender, 100);
  const rolled = rollPendingCombatSide(pending, "Blue", { dieIndex: 1 });
  return rolled.attackerDieIndex === 1 &&
    rolled.attackerProfileValue === rolled.attackerProfile[1];
}

function validatesManualRollAttackerWinsTies(): boolean {
  const state = customState([
    bluePiece("attacker", "Knight", { col: 3, row: 3 }),
    redPiece("defender", { col: 4, row: 5 }),
  ]);
  const attacker = state.pieces.attacker;
  const defender = state.pieces.defender;
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) {
    return false;
  }

  const pending = createPendingCombat(state, move, attacker, defender, 100);
  const blueRolled = rollPendingCombatSide(pending, "Blue", { dieIndex: 2 });
  const bothRolled = rollPendingCombatSide(blueRolled, "Red", { dieIndex: 5 });
  const after = applyMove(
    { ...state, forcedDice: { ...pendingCombatToForcedDice(bothRolled), manualRoll: true } },
    "attacker",
    move,
  );

  return after.lastMove?.combat?.attackerValue === after.lastMove?.combat?.defenderValue &&
    after.lastMove?.combat?.attackerWon === true &&
    after.lastMove?.combat?.manualRoll === true &&
    after.lastMove?.combat?.forcedDice === false;
}

function validatesManualRollTimeoutAutoRoll(): boolean {
  const state = customState([
    bluePiece("attacker", "Knight", { col: 3, row: 3 }),
    redPiece("defender", { col: 4, row: 5 }),
  ]);
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) {
    return false;
  }

  const pending = createPendingCombat(state, move, state.pieces.attacker, state.pieces.defender, 100);
  const rolled = rollPendingCombatSide(pending, "Blue", { dieIndex: 0 });
  const expired = autoRollExpiredPendingCombat(rolled, rolled.rollDeadlineAt + 1);
  return expired.attackerDieIndex === 0 &&
    expired.defenderDieIndex !== undefined &&
    expired.defenderAutoRolled === true &&
    expired.status === "revealingResult" &&
    expired.resolveAfterAt !== undefined;
}

function validatesAutomaticCombatUnchanged(): boolean {
  const state = customState([
    bluePiece("attacker", "Knight", { col: 3, row: 3 }),
    redPiece("defender", { col: 4, row: 5 }),
  ]);
  const move = getLegalMove(state, "attacker", { col: 4, row: 5 });
  if (!move) {
    return false;
  }

  const after = applyMove({ ...state, forcedDice: { attackerValue: 6, defenderValue: 1 } }, "attacker", move);
  return after.lastMove?.combat?.manualRoll !== true &&
    after.lastMove?.combat?.forcedDice === true &&
    pieceAt(after, { col: 4, row: 5 })?.id === "attacker";
}

function finishedOnlineGame(rematch: NonNullable<OnlineGameDocument["rematch"]>): OnlineGameDocument {
  return {
    gameId: "ROOM01",
    createdAt: 1,
    updatedAt: 2,
    status: "finished",
    currentPlayer: "Red",
    bluePlayerId: "blue-player",
    redPlayerId: "red-player",
    gameState: serializeGameStateForFirestore({ ...createInitialGameState(), winner: "Blue", turnNumber: 12 }),
    moveHistory: [],
    matchNumber: 1,
    previousResults: [],
    winner: "Blue",
    reason: "kingCaptured",
    rematch,
  };
}

function customState(entries: Array<Piece & { position: Position }>, turn: "Blue" | "Red" = "Blue"): GameState {
  let board = createEmptyBoard();
  const pieces: Record<string, Piece> = {};

  entries.forEach(({ position, ...piece }) => {
    pieces[piece.id] = piece;
    board = setPieceAt(board, position, piece.id);
  });

  return {
    board,
    pieces,
    turn,
    turnNumber: 1,
    log: [],
    moveHistory: [],
  };
}

function countSide(state: GameState, side: "Blue" | "Red"): number {
  return Object.values(state.pieces).filter((piece) => piece.side === side).length;
}

function pieceAt(state: GameState, position: Position): Piece | undefined {
  const pieceId = state.board[position.row - 1][position.col].pieceId;
  return pieceId ? state.pieces[pieceId] : undefined;
}

function same(a: Position, b: Position): boolean {
  return a.col === b.col && a.row === b.row;
}

function coordinateKey(position: Position): string {
  return `${position.col}-${position.row}`;
}

function hasLegalCapture(state: GameState, pieceId: string, to: Position): boolean {
  const move: LegalMove | undefined = getLegalMove(state, pieceId, to);
  return move?.kind === "capture";
}

function blueCannon(position: Position): Piece & { position: Position } {
  return bluePiece("cannon", "Cannon", position);
}

function bluePiece(id: string, type: Piece["type"], position: Position): Piece & { position: Position } {
  return { id, side: "Blue", type, position };
}

function redPiece(id: string, position: Position): Piece & { position: Position } {
  return { id, side: "Red", type: "Pawn", position };
}

function redTypedPiece(id: string, type: Piece["type"], position: Position): Piece & { position: Position } {
  return { id, side: "Red", type, position };
}
