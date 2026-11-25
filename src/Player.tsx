import { useEffect, useState } from "react";
import type { ActionType, RoomView } from "../shared/types";
import { Avatar, Board, Brand, Card, money } from "./ui";
export function Player({
  room,
  seconds,
  connected,
  onAction,
  sound,
  toggleSound,
}: {
  room: RoomView;
  seconds: number;
  connected: boolean;
  onAction: (type: ActionType, total?: number) => void;
  sound: boolean;
  toggleSound: () => void;
}) {
  const game = room.game;
  const me = game?.players.find((item) => item.id === room.playerId);
  const legal = game?.legal;
  const [raise, setRaise] = useState(0);
  useEffect(() => {
    if (legal) setRaise(legal.minTotal);
  }, [game?.hand, game?.phase, game?.turn, legal?.minTotal]);
  const amount = legal
    ? Math.max(legal.minTotal, Math.min(legal.maxTotal, raise))
    : 0;
  const opponents =
    game?.players.filter((item) => item.id !== room.playerId) ??
    room.roster.filter((item) => item.id !== room.playerId);
  const act = (type: ActionType, total?: number) => {
    onAction(type, total);
  };
  return (
    <main className="player-screen">
      <header className="player-hud">
        <Brand />
        <div>
          <span>
            TABLE <b>{room.code}</b>
          </span>
          <button
            onClick={toggleSound}
            aria-label={sound ? "Mute sound" : "Enable sound"}
          >
            {sound ? "♫" : "♪"}
          </button>
        </div>
      </header>
      <div className="player-status">
        <span>{connected ? "● CONNECTED" : "○ RECONNECTING"}</span>
        <span>NO LIMIT HOLD’EM · 10 / 20</span>
      </div>
      <div className="phone-table">
        <div className="phone-rail">
          <div className="phone-felt">
            <div className="phone-pot">
              <span>TOTAL POT</span>
              <strong>◉ {money(game?.pot ?? 0)}</strong>
            </div>
            <Board game={game} compact />
            <span className="phone-street">
              {game?.phase.toUpperCase() ?? "WAITING TO DEAL"}
            </span>
          </div>
        </div>
      </div>
      <div className="opponents">
        {opponents.map((player) => (
          <div
            className={`opponent ${game?.turn === player.seat ? "active" : ""}`}
            key={player.id}
          >
            <Avatar seat={player.seat} name={player.name} />
            <strong>{player.name}</strong>
            <span>◉ {money("stack" in player ? player.stack : 1500)}</span>
          </div>
        ))}
      </div>
      <section className="my-hand-panel">
        <div className="my-meta">
          <div>
            <span>YOUR SEAT</span>
            <strong>
              {me?.name ??
                room.roster.find((item) => item.id === room.playerId)?.name}
            </strong>
          </div>
          <div>
            <span>YOUR STACK</span>
            <strong>◉ {money(me?.stack ?? 1500)}</strong>
          </div>
        </div>
        <div className="hole-cards">
          {me?.cards?.length ? (
            me.cards.map((card, index) => <Card card={card} key={index} />)
          ) : (
            <>
              <Card />
              <Card />
            </>
          )}
        </div>
      </section>
      <section className="action-panel">
        {legal ? (
          <>
            <div className="action-title">
              <span>YOUR MOVE</span>
              <b className={seconds <= 10 ? "urgent" : ""}>{seconds}s</b>
            </div>
            <div className="primary-actions">
              <button className="fold-button" onClick={() => act("fold")}>
                FOLD
              </button>
              <button
                className="call-button"
                onClick={() => act(legal.canCheck ? "check" : "call")}
              >
                {legal.canCheck ? "CHECK" : `CALL ${money(legal.toCall)}`}
              </button>
            </div>
            {legal.canRaise && (
              <div className="raise-controls">
                <div className="raise-heading">
                  <span>{game?.currentBet === 0 ? "BET" : "RAISE TO"}</span>
                  <strong>◉ {money(amount)}</strong>
                </div>
                <input
                  type="range"
                  min={legal.minTotal}
                  max={legal.maxTotal}
                  value={amount}
                  onChange={(event) => setRaise(Number(event.target.value))}
                  aria-label="Bet or raise amount"
                />
                <div className="bet-presets">
                  <button onClick={() => setRaise(legal.minTotal)}>MIN</button>
                  <button
                    onClick={() =>
                      setRaise(
                        Math.min(
                          legal.maxTotal,
                          Math.max(
                            legal.minTotal,
                            game!.currentBet + Math.ceil(game!.pot / 2),
                          ),
                        ),
                      )
                    }
                  >
                    ½ POT
                  </button>
                  <button
                    onClick={() =>
                      setRaise(
                        Math.min(
                          legal.maxTotal,
                          Math.max(
                            legal.minTotal,
                            game!.currentBet + game!.pot,
                          ),
                        ),
                      )
                    }
                  >
                    POT
                  </button>
                  <button onClick={() => setRaise(legal.maxTotal)}>
                    ALL IN
                  </button>
                </div>
                <button
                  className="gold-button raise-button"
                  onClick={() => act("raise", amount)}
                >
                  {amount === legal.maxTotal
                    ? "ALL IN"
                    : game?.currentBet === 0
                      ? "BET"
                      : "RAISE"}{" "}
                  {money(amount)} <span>♠</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="waiting-action">
            <span>♠</span>
            <strong>
              {game?.phase === "showdown"
                ? (game.history.find((item) => item.kind === "win")?.message ??
                  "Hand complete")
                : me?.folded
                  ? "You folded this hand"
                  : game && game.turn >= 0
                    ? `${game.players[game.turn]?.name} is thinking…`
                    : "Waiting for the next hand"}
            </strong>
            <small>
              {game?.phase === "showdown"
                ? "The dealer will start the next hand."
                : "Your cards are private on this device."}
            </small>
          </div>
        )}
      </section>
    </main>
  );
}
