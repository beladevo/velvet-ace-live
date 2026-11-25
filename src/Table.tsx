import type { RoomView } from "../shared/types";
import { Board, Brand, Seat, money } from "./ui";
export function Table({
  room,
  seconds,
  connected,
  onDeal,
  sound,
  toggleSound,
}: {
  room: RoomView | null;
  seconds: number;
  connected: boolean;
  onDeal: (fresh: boolean) => void;
  sound: boolean;
  toggleSound: () => void;
}) {
  if (!room)
    return (
      <main className="loading-screen">
        <Brand />
        <span>{connected ? "Opening the table…" : "Reconnecting…"}</span>
      </main>
    );
  const game = room.game;
  const lobby = !game || game.phase === "waiting" || game.phase === "gameover";
  const ready = room.roster.filter((item) => item.connected).length;
  const seats = Array.from(
    { length: 6 },
    (_, index) => game?.players[index] ?? room.roster[index],
  );
  const winner = game?.winners[0];
  return (
    <main className="casino-screen">
      <div className="casino-backdrop" />
      <header className="table-hud">
        <div className="hud-left">
          <Brand />
          <span className="hud-divider" />
          <span>NO LIMIT TEXAS HOLD’EM</span>
        </div>
        <div className="hud-right">
          <span className="live-pill">
            <i />
            {connected ? "LIVE TABLE" : "RECONNECTING"}
          </span>
          <span className="blind-pill">
            BLINDS <b>10 / 20</b>
          </span>
          <button
            className="icon-button"
            onClick={toggleSound}
            aria-label={sound ? "Mute sound" : "Enable sound"}
          >
            {sound ? "♫" : "♪"}
          </button>
        </div>
      </header>
      <div className="game-stage">
        <div className="dealer">
          <img src="/assets/dealer.png" alt="Velvet Ace dealer" />
          <div className="dealer-label">THE DEALER</div>
        </div>
        <div className="table-shell">
          <div className="table-rail">
            <div className="table-led">
              <div className="table-felt">
                <div className="felt-outline" />
                <span className="felt-logo">♠ VELVET ACE</span>
                <div className="pot">
                  <span>◉ &nbsp; TOTAL POT</span>
                  <strong>{money(game?.pot ?? 0)}</strong>
                </div>
                <Board game={game} />
                <span className="street">
                  {game ? game.phase.toUpperCase() : "WAITING FOR PLAYERS"}
                </span>
                {game?.phase === "showdown" && winner && (
                  <div className="showdown-ribbon">
                    <span>{game.players[winner.seat]?.name} WINS</span>
                    <strong>{winner.name.toUpperCase()}</strong>
                    <b>+{money(winner.amount)}</b>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="table-seats">
          {seats.map((player, index) => (
            <Seat
              key={player?.id ?? index}
              player={player}
              seat={index}
              game={game}
            />
          ))}
        </div>
      </div>
      <div className="table-bottom">
        <div className="hand-status">
          <span className="eyebrow">
            {game
              ? `HAND ${game.hand} · ${game.phase.toUpperCase()}`
              : "THE TABLE IS YOURS"}
          </span>
          <strong>
            {game?.phase === "showdown"
              ? game.history.find((item) => item.kind === "win")?.message
              : game?.turn !== undefined && game.turn >= 0
                ? `${game.players[game.turn].name} to act`
                : ready >= 2
                  ? `${ready} players ready`
                  : "Waiting for players"}
          </strong>
        </div>
        <div className="table-bottom-actions">
          {lobby || game?.phase === "showdown" ? (
            <button
              className="gold-button"
              disabled={ready < 2}
              onClick={() => onDeal(!game || game.phase === "gameover")}
            >
              {game?.phase === "showdown"
                ? "DEAL NEXT HAND"
                : "DEAL FIRST HAND"}{" "}
              <span>♠</span>
            </button>
          ) : (
            <span className={`countdown ${seconds <= 10 ? "urgent" : ""}`}>
              {seconds}s
            </span>
          )}
        </div>
      </div>
      <aside className="join-widget">
        <div className="join-widget-head">
          <span>JOIN THIS TABLE</span>
          <strong>{room.code}</strong>
        </div>
        <img
          src={`/api/rooms/${room.code}/qr.svg`}
          alt={`Scan to join table ${room.code}`}
        />
        <div className="join-widget-foot">
          SCAN WITH YOUR PHONE <b>{ready} / 6 SEATED</b>
        </div>
      </aside>
    </main>
  );
}
