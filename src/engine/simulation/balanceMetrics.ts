import { isFrontierZone } from "../board";
import { getCombatProfileNameForPiece } from "../data/classProfiles";
import { MoveRecord, Piece, PlayerSide } from "../types";
import { BalanceFlag, BalanceGameMetrics, BalancePieceProfile, BalanceSummary, CannonStats, CombatStats, PieceTypeStats, PromotionStats } from "./balanceTypes";
import { SimulationResult } from "./simulationTypes";

const PIECE_PROFILES: BalancePieceProfile[] = [
  "King",
  "Rook",
  "Knight",
  "Bishop",
  "Cannon",
  "Guard",
  "Pawn",
  "FrontierPawn",
  "FrontierGuard",
];

export function collectBalanceMetrics(result: SimulationResult): BalanceGameMetrics {
  const pieceStats = createPieceStatsMap();
  const combatStats: CombatStats = {
    totalCombats: 0,
    attackerWins: 0,
    defenderWins: 0,
    attackerTieWins: 0,
    attackerWinRate: 0,
  };
  const promotionStats: PromotionStats = {
    pawnPromotions: 0,
    guardPromotions: 0,
    bluePromotions: 0,
    redPromotions: 0,
    promotedPiecesInCombat: 0,
    promotedPiecesCapturing: 0,
    promotedPiecesCaptured: 0,
  };
  const cannonStats: CannonStats = {
    capturesAttempted: 0,
    capturesSuccessful: 0,
    directCapturesFromHome: 0,
    combatCapturesOutsideHome: 0,
    blueCaptures: 0,
    redCaptures: 0,
    blueCannonCaptured: 0,
    redCannonCaptured: 0,
  };
  const frontierStats = {
    capturesInFrontierZone: 0,
    capturesOutsideFrontierZone: 0,
    combatsByRow: { 3: 0, 4: 0, 5: 0 } as Record<3 | 4 | 5, number>,
  };

  let totalCaptures = 0;
  let directCaptures = 0;
  let combatCaptures = 0;
  let cannonCaptures = 0;
  const chronologicalRecords = [...result.finalState.moveHistory].reverse();

  chronologicalRecords.forEach((record) => {
    if (record.promotedPiece) {
      const promotedKey = profileKey(record.promotedPiece);
      pieceStats[promotedKey].promotions += 1;
      if (record.promotedPiece.type === "Pawn") {
        promotionStats.pawnPromotions += 1;
      }
      if (record.promotedPiece.type === "Guard") {
        promotionStats.guardPromotions += 1;
      }
      if (record.promotedPiece.side === "Blue") {
        promotionStats.bluePromotions += 1;
      } else {
        promotionStats.redPromotions += 1;
      }
    }

    if (!record.removedPiece) {
      return;
    }

    totalCaptures += 1;
    if (isFrontierZone(record.move.to)) {
      frontierStats.capturesInFrontierZone += 1;
    } else {
      frontierStats.capturesOutsideFrontierZone += 1;
    }

    if (record.combat && record.defender) {
      combatCaptures += 1;
      collectCombatRecord(record, pieceStats, combatStats, promotionStats, frontierStats);
    } else {
      directCaptures += 1;
      collectDirectCaptureRecord(record, pieceStats, promotionStats);
    }

    collectCannonRecord(record, pieceStats, cannonStats);
  });

  combatStats.attackerWinRate = rate(combatStats.attackerWins, combatStats.totalCombats);

  return {
    noLegalMoveGames: result.reason === "noLegalMoves" ? 1 : 0,
    maxTurnGames: result.reason === "maxTurns" ? 1 : 0,
    kingCaptures: result.reason === "kingCaptured" ? 1 : 0,
    totalCaptures,
    directCaptures,
    combatCaptures,
    cannonCaptures,
    kingCaptureTurns: result.reason === "kingCaptured" ? [result.totalTurns] : [],
    combatStats,
    promotionStats,
    frontierStats,
    cannonStats,
    pieceStats: Object.values(pieceStats),
  };
}

export function createBalanceFlags(summary: BalanceSummary): BalanceFlag[] {
  const frontierPawn = summary.pieceStats.find((stats) => stats.pieceType === "FrontierPawn");
  const frontierGuard = summary.pieceStats.find((stats) => stats.pieceType === "FrontierGuard");
  const frontierPawnWinRate = profileCombatWinRate(frontierPawn);
  const frontierGuardWinRate = profileCombatWinRate(frontierGuard);
  const flags: BalanceFlag[] = [];

  if (summary.blueWinRate > 60) flags.push({ label: "Blue win rate above 60%: possible first-player advantage.", severity: "warning" });
  if (summary.redWinRate > 60) flags.push({ label: "Red win rate above 60%: possible second-player advantage.", severity: "warning" });
  if (summary.drawRate > 30) flags.push({ label: "Draw rate above 30%: games may be too long or too cautious.", severity: "warning" });
  if (summary.averageTurns < 20) flags.push({ label: "Average game length below 20 turns: games may be too short.", severity: "warning" });
  if (summary.averageTurns > 120) flags.push({ label: "Average game length above 120 turns: games may be too long.", severity: "warning" });
  if (summary.averageCannonCapturesPerGame > 3) flags.push({ label: "Cannon captures above 3 per game: Cannons may be too influential.", severity: "warning" });
  if (summary.averagePromotionsPerGame < 0.5) flags.push({ label: "Promotion rate below 0.5 per game: promotion may be too rare.", severity: "warning" });
  if (summary.averagePromotionsPerGame > 4) flags.push({ label: "Promotion rate above 4 per game: promotion may be too common.", severity: "warning" });
  if (summary.combatStats.attackerWinRate > 65) flags.push({ label: "Attacker combat win rate above 65%: attacker tie advantage may be too strong.", severity: "warning" });
  if (frontierGuardWinRate > 70) flags.push({ label: "FrontierGuard combat win rate above 70%: FrontierGuard may be too strong.", severity: "warning" });
  if (frontierPawn && frontierPawn.combatsEntered > 0 && frontierPawnWinRate < 40) {
    flags.push({ label: "FrontierPawn combat win rate below 40%: FrontierPawn may be too weak.", severity: "warning" });
  }

  return flags.length ? flags : [{ label: "No balance flags crossed the current thresholds.", severity: "info" }];
}

export function createPieceStatsMap(): Record<BalancePieceProfile, PieceTypeStats> {
  return PIECE_PROFILES.reduce((map, pieceType) => {
    map[pieceType] = {
      pieceType,
      capturesMade: 0,
      timesCaptured: 0,
      combatsEntered: 0,
      combatsWon: 0,
      combatsLost: 0,
      directCapturesMade: 0,
      combatCapturesMade: 0,
      cannonCapturesMade: 0,
      promotions: 0,
      capturedOnTurns: [],
    };
    return map;
  }, {} as Record<BalancePieceProfile, PieceTypeStats>);
}

export function profileKey(piece: Piece): BalancePieceProfile {
  const profileName = getCombatProfileNameForPiece(piece);
  return profileName === "FrontierPawn" || profileName === "FrontierGuard" ? profileName : piece.type;
}

export function profileCombatWinRate(stats?: PieceTypeStats): number {
  if (!stats) {
    return 0;
  }
  return rate(stats.combatsWon, stats.combatsWon + stats.combatsLost);
}

export function rate(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function collectDirectCaptureRecord(
  record: MoveRecord,
  pieceStats: Record<BalancePieceProfile, PieceTypeStats>,
  promotionStats: PromotionStats,
): void {
  const attackerKey = profileKey(record.attacker);
  const removedKey = profileKey(record.removedPiece!);
  pieceStats[attackerKey].capturesMade += 1;
  pieceStats[attackerKey].directCapturesMade += 1;
  pieceStats[removedKey].timesCaptured += 1;
  pieceStats[removedKey].capturedOnTurns.push(record.turnNumber);
  if (record.attacker.promoted) {
    promotionStats.promotedPiecesCapturing += 1;
  }
  if (record.removedPiece?.promoted) {
    promotionStats.promotedPiecesCaptured += 1;
  }
}

function collectCombatRecord(
  record: MoveRecord,
  pieceStats: Record<BalancePieceProfile, PieceTypeStats>,
  combatStats: CombatStats,
  promotionStats: PromotionStats,
  frontierStats: BalanceGameMetrics["frontierStats"],
): void {
  const combat = record.combat!;
  const attackerKey = profileKey(record.attacker);
  const defenderKey = profileKey(record.defender!);
  const winner = combat.attackerWon ? record.attacker : record.defender!;
  const loser = combat.attackerWon ? record.defender! : record.attacker;
  const winnerKey = profileKey(winner);
  const loserKey = profileKey(loser);

  combatStats.totalCombats += 1;
  combatStats.attackerWins += combat.attackerWon ? 1 : 0;
  combatStats.defenderWins += combat.attackerWon ? 0 : 1;
  if (combat.attackerWon && combat.attackerValue === combat.defenderValue) {
    combatStats.attackerTieWins += 1;
  }

  if (record.move.to.row >= 3 && record.move.to.row <= 5) {
    frontierStats.combatsByRow[record.move.to.row as 3 | 4 | 5] += 1;
  }

  pieceStats[attackerKey].combatsEntered += 1;
  pieceStats[defenderKey].combatsEntered += 1;
  pieceStats[winnerKey].combatsWon += 1;
  pieceStats[winnerKey].capturesMade += 1;
  pieceStats[winnerKey].combatCapturesMade += 1;
  pieceStats[loserKey].combatsLost += 1;
  pieceStats[loserKey].timesCaptured += 1;
  pieceStats[loserKey].capturedOnTurns.push(record.turnNumber);

  if (record.attacker.promoted || record.defender?.promoted) {
    promotionStats.promotedPiecesInCombat += 1;
  }
  if (winner.promoted) {
    promotionStats.promotedPiecesCapturing += 1;
  }
  if (loser.promoted) {
    promotionStats.promotedPiecesCaptured += 1;
  }
}

function collectCannonRecord(
  record: MoveRecord,
  pieceStats: Record<BalancePieceProfile, PieceTypeStats>,
  cannonStats: CannonStats,
): void {
  if (record.removedPiece?.type === "Cannon") {
    if (record.removedPiece.side === "Blue") {
      cannonStats.blueCannonCaptured += 1;
    } else {
      cannonStats.redCannonCaptured += 1;
    }
  }

  if (record.attacker.type !== "Cannon" || !record.defender) {
    return;
  }

  cannonStats.capturesAttempted += 1;
  if (!record.combat || record.combat.attackerWon) {
    cannonStats.capturesSuccessful += 1;
    cannonStats[record.attacker.side === "Blue" ? "blueCaptures" : "redCaptures"] += 1;
    pieceStats.Cannon.cannonCapturesMade += 1;
  }
  if (record.captureType === "Direct" && record.cannon?.startsInHomeTerritory) {
    cannonStats.directCapturesFromHome += 1;
  }
  if (record.captureType === "Combat" && record.cannon && !record.cannon.startsInHomeTerritory) {
    cannonStats.combatCapturesOutsideHome += 1;
  }
}

export function sideKey(side: PlayerSide): "blueCaptures" | "redCaptures" {
  return side === "Blue" ? "blueCaptures" : "redCaptures";
}
