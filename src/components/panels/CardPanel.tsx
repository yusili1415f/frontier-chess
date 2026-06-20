import { GameCard } from "../../engine/cards/cardTypes";
import { cardDefinitionId } from "../../engine/cards/cardEngine";
import { canPlayBeforeCombatCard } from "../../engine/pendingCombat";
import { GameState, PendingCombat, PlayerDrawState, PlayerSide } from "../../engine/types";

type CardPanelProps = {
  canAct: boolean;
  onCancelAdvance: () => void;
  onPlayCard: (side: PlayerSide, cardId: string) => void;
  onSkipBannerDrillCannon?: () => void;
  pendingCombat?: PendingCombat;
  state: GameState;
};

export function CardPanel({ canAct, onCancelAdvance, onPlayCard, onSkipBannerDrillCannon, pendingCombat, state }: CardPanelProps) {
  const activeLabel = state.activeMoveCard?.cardName;
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
        </div>
      ) : null}
      <SideCards canAct={canAct} onPlayCard={onPlayCard} pendingCombat={pendingCombat} side="Blue" state={state} />
      <SideCards canAct={canAct} onPlayCard={onPlayCard} pendingCombat={pendingCombat} side="Red" state={state} />
    </section>
  );
}

function SideCards({ canAct, onPlayCard, pendingCombat, side, state }: { canAct: boolean; onPlayCard: (side: PlayerSide, cardId: string) => void; pendingCombat?: PendingCombat; side: PlayerSide; state: GameState }) {
  const cards = state.cards[side];
  const drawState = state.drawState[side];
  return (
    <div className="card-side">
      <h3>{side} hand: {cards.hand.length} / {cards.handLimit}</h3>
      <div className="card-counts">
        <span>Deck: {cards.deck.length}</span>
        <span>Discard: {cards.discard.length}</span>
        <span>Hand limit: {cards.handLimit}</span>
      </div>
      <DrawStatus drawState={drawState} />
      <div className="hand-card-list">
        {cards.hand.length ? cards.hand.map((card) => (
          <CardItem
            canPlay={canAct && canPlayHandCard(state, pendingCombat, side, card)}
            card={card}
            key={card.id}
            onPlay={() => onPlayCard(side, card.id)}
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
    (definitionId === "basic_advance" || definitionId === "banner_drill") &&
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

function CardItem({ canPlay, card, onPlay }: { canPlay: boolean; card: GameCard; onPlay: () => void }) {
  return (
    <article className="hand-card">
      <div className="hand-card-heading">
        <strong>{card.name}</strong>
        <span>{card.source}</span>
      </div>
      <span>Timing: {card.timing}</span>
      <p>{card.description}</p>
      <span>Implemented: {card.implemented ? "yes" : "no"}</span>
      <button disabled={!canPlay} onClick={onPlay} type="button">
        {canPlay ? `Play ${card.name}` : card.implemented ? "Not playable now" : "Not implemented"}
      </button>
    </article>
  );
}
