import { GameCard } from "../../engine/cards/cardTypes";
import { GameState, PlayerDrawState, PlayerSide } from "../../engine/types";

type CardPanelProps = {
  canAct: boolean;
  onCancelAdvance: () => void;
  onPlayCard: (side: PlayerSide, cardId: string) => void;
  state: GameState;
};

export function CardPanel({ canAct, onCancelAdvance, onPlayCard, state }: CardPanelProps) {
  return (
    <section className="panel-block card-panel">
      <h2>Cards</h2>
      {state.activeMoveCard ? (
        <div className="active-card-notice">
          <strong>Advance active</strong>
          <span>{state.activeMoveCard.side}: select a Pawn or Guard to move 2 squares forward.</span>
          {canAct ? <button onClick={onCancelAdvance} type="button">Cancel Advance</button> : null}
        </div>
      ) : null}
      <SideCards canAct={canAct} onPlayCard={onPlayCard} side="Blue" state={state} />
      <SideCards canAct={canAct} onPlayCard={onPlayCard} side="Red" state={state} />
    </section>
  );
}

function SideCards({ canAct, onPlayCard, side, state }: { canAct: boolean; onPlayCard: (side: PlayerSide, cardId: string) => void; side: PlayerSide; state: GameState }) {
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
            canPlay={canAct && state.turn === side && card.id === "basic_advance" && !state.activeMoveCard}
            card={card}
            key={card.id}
            onPlay={() => onPlayCard(side, card.id)}
          />
        )) : <p className="muted-copy">No cards in hand.</p>}
      </div>
    </div>
  );
}

function DrawStatus({ drawState }: { drawState: PlayerDrawState }) {
  return (
    <div className="draw-status">
      <span>Passive draws: {drawState.passiveDrawsUsed} / 5</span>
      <span>Active draws: {drawState.activeDrawsUsed} / 2</span>
      <span>Captured pieces: {drawState.capturedPiecesCount}</span>
      <span>3 captures: {drawState.hasDrawnForThreeCaptures ? "drawn" : "pending"}</span>
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
