import { useState } from "react";
import { OnlineGameViewDocument, OnlinePlayerRole, OnlineRematchSideMode } from "../../engine/online/onlineTypes";
import { isOnlineConfigured } from "../../services/onlineGameService";

type OnlineGamePanelProps = {
  gameId?: string;
  role?: OnlinePlayerRole;
  game?: OnlineGameViewDocument;
  error?: string;
  busy: boolean;
  onCreateGame: () => void;
  onJoinGame: (gameId: string) => void;
  onLeaveGame: () => void;
  onRequestRematch: (sideMode: OnlineRematchSideMode) => void;
  onCancelRematch: () => void;
};

export function OnlineGamePanel({
  gameId,
  role,
  game,
  error,
  busy,
  onCreateGame,
  onJoinGame,
  onLeaveGame,
  onRequestRematch,
  onCancelRematch,
}: OnlineGamePanelProps) {
  const [joinCode, setJoinCode] = useState("");
  const [rematchSideMode, setRematchSideMode] = useState<OnlineRematchSideMode>("same");
  const inviteLink = gameId ? `${window.location.origin}${window.location.pathname}?game=${gameId}` : "";
  const opponentJoined = Boolean(game?.bluePlayerId && game?.redPlayerId);
  const playerRequestedRematch = role === "Blue"
    ? game?.rematch?.requestedByBlue
    : role === "Red"
      ? game?.rematch?.requestedByRed
      : false;

  async function handleCopyInviteLink() {
    if (!inviteLink) {
      return;
    }
    await navigator.clipboard.writeText(inviteLink);
  }

  return (
    <section className="panel-block online-game-panel">
      <h2>Online Multiplayer</h2>
      {!isOnlineConfigured() ? (
        <p className="muted-copy">Firebase is not configured. Add VITE_FIREBASE_* values to enable online rooms.</p>
      ) : null}

      <div className="online-actions">
        <button disabled={busy || !isOnlineConfigured()} onClick={onCreateGame} type="button">
          Create Online Game
        </button>
        <label>
          Join Game by Code
          <input
            autoCapitalize="characters"
            disabled={busy || !isOnlineConfigured()}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ROOM ID"
            value={joinCode}
          />
        </label>
        <button disabled={busy || !joinCode.trim() || !isOnlineConfigured()} onClick={() => onJoinGame(joinCode)} type="button">
          Join Game
        </button>
        <button disabled={!gameId} onClick={handleCopyInviteLink} type="button">
          Copy Invite Link
        </button>
        <button disabled={!gameId} onClick={onLeaveGame} type="button">
          Leave Online Game
        </button>
      </div>

      <div className="info-grid online-info">
        <span>Room code</span>
        <strong>{gameId ?? "None"}</strong>
        <span>Match</span>
        <strong>{game?.matchNumber ?? 1}</strong>
        <span>Player role</span>
        <strong>{role ?? "Local"}</strong>
        <span>Game status</span>
        <strong>{game?.status ?? "offline"}</strong>
        <span>Current player</span>
        <strong>{game?.currentPlayer ?? "n/a"}</strong>
        <span>Opponent joined</span>
        <strong>{opponentJoined ? "yes" : "no"}</strong>
      </div>

      {game?.status === "finished" ? (
        <div className="online-rematch">
          <p className="muted-copy">{formatFinishedResult(game)}</p>
          <label>
            Rematch sides
            <select value={rematchSideMode} onChange={(event) => setRematchSideMode(event.target.value as OnlineRematchSideMode)}>
              <option value="same">Same sides</option>
              <option value="swap">Swap sides</option>
            </select>
          </label>
          <p className="muted-copy">{formatRematchStatus(game, role)}</p>
          <div className="simulation-actions">
            {playerRequestedRematch ? (
              <button disabled={busy} onClick={onCancelRematch} type="button">Cancel Rematch Request</button>
            ) : (
              <button disabled={busy || role === "Spectator"} onClick={() => onRequestRematch(rematchSideMode)} type="button">
                {game.rematch?.requestedByBlue || game.rematch?.requestedByRed ? "Accept Rematch" : "Request Rematch"}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {game?.previousResults?.length ? (
        <div className="online-results">
          <h3>Previous Results</h3>
          <ol>
            {game.previousResults.slice(-5).map((result) => (
              <li key={`${result.matchNumber}-${result.finishedAt}`}>
                Match {result.matchNumber}: {result.winner ?? "Draw"} · {result.reason ?? "n/a"} · {result.totalTurns} turns
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {game?.status === "waiting" ? <p className="muted-copy">Waiting for Red player to join...</p> : null}
      {role === "Spectator" ? <p className="muted-copy">Spectating only.</p> : null}
      {inviteLink ? <p className="online-link">{inviteLink}</p> : null}
      {error ? <p className="validation-fail">{error}</p> : null}
    </section>
  );
}

function formatFinishedResult(game: OnlineGameViewDocument): string {
  if (game.winner) {
    return `Match ${game.matchNumber} finished: ${game.winner} wins by ${formatReason(game.reason)}.`;
  }
  return `Match ${game.matchNumber} finished: Draw by ${formatReason(game.reason)}.`;
}

function formatRematchStatus(game: OnlineGameViewDocument, role?: OnlinePlayerRole): string {
  const blueRequested = Boolean(game.rematch?.requestedByBlue);
  const redRequested = Boolean(game.rematch?.requestedByRed);
  if (role === "Spectator") {
    return blueRequested || redRequested ? "Players are discussing a rematch." : "Spectating only.";
  }
  if (blueRequested && !redRequested) {
    return role === "Blue" ? "Rematch requested. Waiting for Red..." : "Blue wants a rematch.";
  }
  if (redRequested && !blueRequested) {
    return role === "Red" ? "Rematch requested. Waiting for Blue..." : "Red wants a rematch.";
  }
  if (blueRequested && redRequested) {
    return "Both players accepted. Starting rematch...";
  }
  return "No rematch requested yet.";
}

function formatReason(reason: OnlineGameViewDocument["reason"]): string {
  switch (reason) {
    case "kingCaptured":
      return "King capture";
    case "maxTurns":
      return "max turns";
    case "noLegalMoves":
      return "no legal moves";
    default:
      return "unknown reason";
  }
}
