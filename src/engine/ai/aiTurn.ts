import { GameState, PlayerSide } from "../types";

export type GameMode = "human-vs-human" | "human-blue-vs-ai-red" | "ai-blue-vs-human-red" | "ai-vs-ai";

export type AIStatus = "idle" | "thinking" | "moved";

export type AIPlayOptions = {
  heuristicRandomness: number;
  topN: number;
  aiMoveDelayMs: number;
  maxTurns: number;
};

export function isHumanSide(side: PlayerSide, gameMode: GameMode): boolean {
  switch (gameMode) {
    case "human-vs-human":
      return true;
    case "human-blue-vs-ai-red":
      return side === "Blue";
    case "ai-blue-vs-human-red":
      return side === "Red";
    case "ai-vs-ai":
      return false;
  }
}

export function isAISide(side: PlayerSide, gameMode: GameMode): boolean {
  return !isHumanSide(side, gameMode);
}

export function isHumanTurn(gameState: GameState, gameMode: GameMode): boolean {
  return !gameState.winner && isHumanSide(gameState.turn, gameMode);
}

export function isAITurn(gameState: GameState, gameMode: GameMode): boolean {
  return !gameState.winner && isAISide(gameState.turn, gameMode);
}

export function getAISideForMode(gameMode: GameMode): PlayerSide | null {
  switch (gameMode) {
    case "human-blue-vs-ai-red":
      return "Red";
    case "ai-blue-vs-human-red":
      return "Blue";
    case "ai-vs-ai":
      return null;
    case "human-vs-human":
      return null;
  }
}

export function getHumanSideLabel(gameMode: GameMode): string {
  switch (gameMode) {
    case "human-vs-human":
      return "Blue and Red";
    case "human-blue-vs-ai-red":
      return "Blue";
    case "ai-blue-vs-human-red":
      return "Red";
    case "ai-vs-ai":
      return "None";
  }
}

export function getAISideLabel(gameMode: GameMode): string {
  switch (gameMode) {
    case "human-vs-human":
      return "None";
    case "human-blue-vs-ai-red":
      return "Red";
    case "ai-blue-vs-human-red":
      return "Blue";
    case "ai-vs-ai":
      return "Blue and Red";
  }
}

export function getNextSwitchedMode(gameMode: GameMode): GameMode {
  switch (gameMode) {
    case "human-blue-vs-ai-red":
      return "ai-blue-vs-human-red";
    case "ai-blue-vs-human-red":
      return "human-blue-vs-ai-red";
    case "human-vs-human":
      return "ai-vs-ai";
    case "ai-vs-ai":
      return "human-vs-human";
  }
}
