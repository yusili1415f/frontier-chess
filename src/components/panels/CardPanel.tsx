import { useState } from "react";
import { GameCard } from "../../engine/cards/cardTypes";
import { cardDefinitionId, canPlayCard, getEligibleBoneRevivalPieces } from "../../engine/cards/cardEngine";
import { canPlayBeforeCombatCard } from "../../engine/pendingCombat";
import { GameState, PendingCombat, PlayerDrawState, PlayerSide } from "../../engine/types";

type CardPanelProps = {
  canAct: boolean;
  discardControlSide?: PlayerSide;
  onCancelAdvance: () => void;
  onPlayCard: (side: PlayerSide, cardId: string) => void;
  onSelectRemovedPiece?: (side: PlayerSide, removedPieceId: string) => void;
  onSkipBannerDrillCannon?: () => void;
  onSkipCrownbreakerPostCombat?: () => void;
  onVoluntaryDiscard?: (side: PlayerSide, cardIds: string[]) => void;
  pendingCombat?: PendingCombat;
  state: GameState;
  visibleHandSide?: PlayerSide | "Both" | "Spectator" | null;
};

export function CardPanel({
  canAct,
  discardControlSide,
  onCancelAdvance,
  onPlayCard,
  onSelectRemovedPiece,
  onSkipBannerDrillCannon,
  onSkipCrownbreakerPostCombat,
  onVoluntaryDiscard,
  pendingCombat,
  state,
  visibleHandSide = "Both",
}: CardPanelProps) {
  const activeLabel = state.activeMoveCard?.cardName;
  const [selectedDiscardIds, setSelectedDiscardIds] = useState<Record<PlayerSide, string[]>>({ Blue: [], Red: [] });
  const toggleDiscardSelection = (side: PlayerSide, cardId: string) => {
    setSelectedDiscardIds((current) => {
      const selected = current[side];
      return {
        ...current,
        [side]: selected.includes(cardId)
          ? selected.filter((id) => id !== cardId)
          : [...selected, cardId].slice(0, 2),
      };
    });
  };
  const confirmDiscard = (side: PlayerSide, cardIds: string[]) => {
    onVoluntaryDiscard?.(side, cardIds);
    setSelectedDiscardIds((current) => ({ ...current, [side]: [] }));
  };
  return (
    <section className="panel-block card-panel">
      <h2>Cards</h2>
      {state.activeMoveCard ? (
        <div className="active-card-notice">
          <strong>{activeLabel} active</strong>
          <span>{describeActiveCard(state)}</span>
          {canAct ? <button onClick={onCancelAdvance} type="button">Cancel {activeLabel}</button> : null}
          {canAct && state.activeMoveCard.cardName === "Banner Drill" && state.activeMoveCard.phase === "moveCannon" ? (
            <button onClick={onSkipBannerDrillCannon} type="button">Skip Cannon Move</button>
          ) : null}
          {canAct && state.activeMoveCard.cardName === "Crownbreaker Charge" && state.activeMoveCard.phase === "postCombatMove" ? (
            <button onClick={onSkipCrownbreakerPostCombat} type="button">Skip post-combat move</button>
          ) : null}
          {canAct && (state.activeMoveCard.cardName === "Raise the Fallen" || state.activeMoveCard.cardName === "Necromancer's Bell") && state.activeMoveCard.phase === "selectRemovedPiece" ? (
            <div className="gambit-actions">
              {getEligibleBoneRevivalPieces(state, state.activeMoveCard.side, state.activeMoveCard.cardDefinitionId ?? "").map((piece) => (
                <button key={piece.pieceId} onClick={() => onSelectRemovedPiece?.(state.activeMoveCard!.side, piece.pieceId)} type="button">
                  Return {piece.wasPromoted ? "promoted " : ""}{piece.type} {piece.pieceId}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <SideCards
        canAct={canAct}
        discardControlSide={discardControlSide}
        onDiscard={confirmDiscard}
        onPlayCard={onPlayCard}
        onToggleDiscard={toggleDiscardSelection}
        pendingCombat={pendingCombat}
        selectedDiscardIds={selectedDiscardIds.Blue}
        side="Blue"
        state={state}
        visibleHandSide={visibleHandSide}
      />
      <SideCards
        canAct={canAct}
        discardControlSide={discardControlSide}
        onDiscard={confirmDiscard}
        onPlayCard={onPlayCard}
        onToggleDiscard={toggleDiscardSelection}
        pendingCombat={pendingCombat}
        selectedDiscardIds={selectedDiscardIds.Red}
        side="Red"
        state={state}
        visibleHandSide={visibleHandSide}
      />
    </section>
  );
}

type SideCardsProps = {
  canAct: boolean;
  discardControlSide?: PlayerSide;
  onDiscard: (side: PlayerSide, cardIds: string[]) => void;
  onPlayCard: (side: PlayerSide, cardId: string) => void;
  onToggleDiscard: (side: PlayerSide, cardId: string) => void;
  pendingCombat?: PendingCombat;
  selectedDiscardIds: string[];
  side: PlayerSide;
  state: GameState;
  visibleHandSide: PlayerSide | "Both" | "Spectator" | null;
};

function SideCards({
  canAct,
  discardControlSide,
  onDiscard,
  onPlayCard,
  onToggleDiscard,
  pendingCombat,
  selectedDiscardIds,
  side,
  state,
  visibleHandSide,
}: SideCardsProps) {
  const cards = state.cards[side];
  const drawState = state.drawState[side];
  const handVisible = visibleHandSide === "Both" || visibleHandSide === side;
  const discardAvailable = discardControlSide === side &&
    state.turn === side &&
    !state.activeMoveCard &&
    !pendingCombat &&
    !state.turnActions[side].voluntaryDiscardUsedThisTurn;
  return (
    <div className="card-side">
      <h3>{side} hand: {cards.hand.length} / {cards.handLimit}</h3>
      <div className="card-counts">
        <span>Deck: {cards.deck.length}</span>
        <span>Discard: {cards.discard.length}</span>
        <span>Hand limit: {cards.handLimit}</span>
      </div>
      <DrawStatus drawState={drawState} />
      <div className="voluntary-discard-controls">
        <span>{state.turnActions[side].voluntaryDiscardUsedThisTurn ? "Discard used this turn" : `Selected to discard: ${selectedDiscardIds.length}`}</span>
        <button disabled={!discardAvailable} onClick={() => onDiscard(side, selectedDiscardIds)} type="button">Discard selected</button>
        <button disabled={!discardAvailable} onClick={() => onDiscard(side, [])} type="button">Skip discard</button>
      </div>
      <div className="hand-card-list">
        {!handVisible ? (
          <p className="muted-copy">Opponent hand hidden.</p>
        ) : cards.hand.length ? cards.hand.map((card) => (
          <CardItem
            canPlay={canAct && canPlayHandCard(state, pendingCombat, side, card)}
            card={card}
            key={card.id}
            onToggleDiscard={() => onToggleDiscard(side, card.id)}
            onPlay={() => onPlayCard(side, card.id)}
            selectedForDiscard={selectedDiscardIds.includes(card.id)}
            showDiscardSelect={discardAvailable}
          />
        )) : <p className="muted-copy">No cards in hand.</p>}
      </div>
    </div>
  );
}

function canPlayHandCard(state: GameState, pendingCombat: PendingCombat | undefined, side: PlayerSide, card: GameCard): boolean {
  if (pendingCombat) {
    return canPlayBeforeCombatCard(pendingCombat, state, side, card.id);
  }
  const definitionId = cardDefinitionId(card);
  return state.turn === side &&
    !state.activeMoveCard &&
    (definitionId === "basic_advance" ||
      definitionId === "banner_drill" ||
      definitionId === "breakthrough_charge" ||
      definitionId === "crownbreaker_charge" ||
      definitionId === "raise_the_fallen" ||
      definitionId === "necromancers_bell") &&
    canPlayCard(state, side, card.id, { timing: card.timing }) &&
    card.implemented;
}

function describeActiveCard(state: GameState): string {
  const active = state.activeMoveCard;
  if (!active) {
    return "";
  }
  if (active.cardName === "Advance") {
    return `${active.side}: select a Pawn or Guard to move 2 squares forward.`;
  }
  if (active.cardName === "Breakthrough Charge") {
    return `${active.side}: select a friendly Knight, then move it normally. Combat may unlock one Knight die reroll.`;
  }
  if (active.cardName === "Crownbreaker Charge" && active.phase === "postCombatMove") {
    return `${active.side}: move the winning Knight 1 adjacent empty square, or skip.`;
  }
  if (active.cardName === "Crownbreaker Charge") {
    return `${active.side}: select a friendly Knight. If it attacks, it gets +1 and may move after winning.`;
  }
  if (active.cardName === "Raise the Fallen" || active.cardName === "Necromancer's Bell") {
    return active.phase === "selectHomeSquare"
      ? `${active.side}: choose an empty home-zone square for the returned piece.`
      : `${active.side}: choose a removed piece to return.`;
  }
  if (active.phase === "moveCannon") {
    return `${active.side}: you may move one adjacent friendly Cannon 1 orthogonal space. Cannon cannot capture.`;
  }
  return `${active.side}: select a friendly Guard, then move it 1 space to an empty adjacent square.`;
}

function DrawStatus({ drawState }: { drawState: PlayerDrawState }) {
  return (
    <div className="draw-status">
      <span>Passive draws: {drawState.passiveDrawsUsed} / 5</span>
      <span>Active draws: {drawState.activeDrawsUsed} / 2</span>
      <span>Eligible captures lost: {drawState.eligibleCapturedCount}</span>
      <span>Total captures lost: {drawState.capturedPiecesCount}</span>
      <span>3-capture thresholds: {drawState.passiveDrawsUsed}</span>
      <span>Frontier crossing: {drawState.hasDrawnForFirstFrontierCrossing ? "drawn" : "pending"}</span>
      <span>Enemy home entry: {drawState.hasDrawnForFirstEnemyHomeEntry ? "drawn" : "pending"}</span>
    </div>
  );
}

function CardItem({
  canPlay,
  card,
  onPlay,
  onToggleDiscard,
  selectedForDiscard,
  showDiscardSelect,
}: {
  canPlay: boolean;
  card: GameCard;
  onPlay: () => void;
  onToggleDiscard: () => void;
  selectedForDiscard: boolean;
  showDiscardSelect: boolean;
}) {
  return (
    <article className="hand-card">
      <div className="hand-card-heading">
        <strong>{card.name}</strong>
        <span>{card.source}</span>
      </div>
      <span>Timing: {card.timing}</span>
      <p>{card.description}</p>
      <span>Implemented: {card.implemented ? "yes" : "no"}</span>
      {showDiscardSelect ? (
        <label className="discard-select">
          <input checked={selectedForDiscard} onChange={onToggleDiscard} type="checkbox" />
          <span>Discard</span>
        </label>
      ) : null}
      <button disabled={!canPlay} onClick={onPlay} type="button">
        {canPlay ? `Play ${card.name}` : card.implemented ? "Not playable now" : "Not implemented"}
      </button>
    </article>
  );
}
