import { useState } from "react";
import { OnlineGameDocument, OnlinePlayerRole } from "../../engine/online/onlineTypes";
import { isOnlineConfigured } from "../../services/onlineGameService";

type OnlineGamePanelProps = {
  gameId?: string;
  role?: OnlinePlayerRole;
  game?: OnlineGameDocument;
  error?: string;
  busy: boolean;
  onCreateGame: () => void;
  onJoinGame: (gameId: string) => void;
  onLeaveGame: () => void;
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
}: OnlineGamePanelProps) {
  const [joinCode, setJoinCode] = useState("");
  const inviteLink = gameId ? `${window.location.origin}${window.location.pathname}?game=${gameId}` : "";
  const opponentJoined = Boolean(game?.bluePlayerId && game?.redPlayerId);

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
        <span>Player role</span>
        <strong>{role ?? "Local"}</strong>
        <span>Game status</span>
        <strong>{game?.status ?? "offline"}</strong>
        <span>Current player</span>
        <strong>{game?.currentPlayer ?? "n/a"}</strong>
        <span>Opponent joined</span>
        <strong>{opponentJoined ? "yes" : "no"}</strong>
      </div>

      {game?.status === "waiting" ? <p className="muted-copy">Waiting for Red player to join...</p> : null}
      {role === "Spectator" ? <p className="muted-copy">Spectating only.</p> : null}
      {inviteLink ? <p className="online-link">{inviteLink}</p> : null}
      {error ? <p className="validation-fail">{error}</p> : null}
    </section>
  );
}
