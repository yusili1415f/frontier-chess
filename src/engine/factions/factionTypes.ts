import { PieceType, PlayerSide } from "../types";

export type FactionId = "core" | "test-vanguard" | "test-bastion";

export type FactionRuleStatus = "placeholder" | "experimental" | "ready";

export type FactionPieceModifier = {
  pieceType: PieceType;
  note: string;
};

export type FactionDefinition = {
  id: FactionId;
  name: string;
  side?: PlayerSide;
  status: FactionRuleStatus;
  summary: string;
  pieceModifiers: FactionPieceModifier[];
};

export type FactionSelection = Partial<Record<PlayerSide, FactionId>>;

export type FactionEngineContext = {
  selection: FactionSelection;
};
