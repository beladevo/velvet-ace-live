import { useEffect, useState } from "react";
import type { ActionType, RoomView, SocialKind } from "../shared/types";
import { Avatar, AvatarPicker, Board, Brand, Card, money } from "./ui";
export function Player({
  room,
  seconds,
  connected,
  onAction,
  onAvatarChange,
  onSocial,
  onShow,
  onMuck,
  sound,
  toggleSound,
}: {
  room: RoomView;
  seconds: number;
  connected: boolean;
  onAction: (type: ActionType, total?: number) => void;
  onAvatarChange: (avatar: number) => void;
  onSocial: (kind: SocialKind, content: string) => void;
  onShow: () => void;
  onMuck: () => void;
  sound: boolean;
  toggleSound: () => void;
}) {
  const game = room.game;
  const me = game?.players.find((item) => item.id === room.playerId);
  const legal = game?.legal;
  const [raise, setRaise] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [alwaysShow, setAlwaysShow] = useState(
    localStorage.getItem("va-show-cards") === "on",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
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
  const myAvatar =
    room.roster.find((item) => item.id === room.playerId)?.avatar ?? 0;
  const visibleCards = alwaysShow || peeking;
  const reactions = ["😂", "🔥", "👏", "😮", "🍀", "❤️"];
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
          <button
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Player settings"
            aria-expanded={settingsOpen}
          >
            ⚙
          </button>
        </div>
      </header>
      {settingsOpen && (
        <div className="player-settings">
          <div className="settings-title">
            <strong>YOUR TABLE SETTINGS</strong>
            <button
              onClick={() => setSettingsOpen(false)}
              aria-label="Close settings"
            >
              ×
            </button>
          </div>
          <span>YOUR CHARACTER</span>
          <AvatarPicker value={myAvatar} onChange={onAvatarChange} />
          <label className="show-cards-setting">
            <input
              type="checkbox"
              checked={alwaysShow}
              onChange={(event) => {
                setAlwaysShow(event.target.checked);
                localStorage.setItem(
                  "va-show-cards",
                  event.target.checked ? "on" : "off",
                );
              }}
            />{" "}
            Always show my hole cards
          </label>
          <small>
            On a shared screen, keep this off and hold the cards to peek.
          </small>
        </div>
      )}
      <div className="player-status">
        <span>{connected ? "● CONNECTED" : "○ RECONNECTING"}</span>
        <span>NO LIMIT HOLD’EM · 10 / 20</span>
      </div>
      <div className="phone-table">
        <div className="phone-rail">
          <div className="phone-felt">
            <div className="phone-pot" key={game?.pot ?? 0}>
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
      {game?.phase === "showdown" && game.winners.length > 0 && (
        <div className="phone-win" key={`result-${game.hand}`}>
          <strong>
            {game.winners.some((item) => item.seat === me?.seat)
              ? game.winners.length > 1
                ? "POT SPLIT!"
                : "YOU WIN!"
              : `${game.players[game.winners[0].seat]?.name} WINS`}
          </strong>
          <span>
            {game.winners
              .map((item) => `${item.name} · +${money(item.amount)}`)
              .join(" / ")}
          </span>
        </div>
      )}
      <div className="opponents">
        {opponents.map((player) => (
          <div
            className={`opponent ${game?.turn === player.seat ? "active" : ""}`}
            key={player.id}
          >
            <Avatar
              avatar={
                room.roster.find((item) => item.id === player.id)?.avatar ??
                player.seat
              }
              name={player.name}
            />
            <strong>{player.name}</strong>
            <span>◉ {money("stack" in player ? player.stack : 1500)}</span>
          </div>
        ))}
      </div>
      <section className="my-hand-panel">
        <div className="my-meta">
          <Avatar avatar={myAvatar} name={me?.name ?? "You"} />
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
        <button
          className={`hole-cards ${visibleCards ? "revealed" : "concealed"}`}
          type="button"
          aria-label="Hold to reveal your hole cards"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setPeeking(true);
          }}
          onPointerUp={() => setPeeking(false)}
          onPointerCancel={() => setPeeking(false)}
          onPointerLeave={() => setPeeking(false)}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              setPeeking(true);
            }
          }}
          onKeyUp={() => setPeeking(false)}
          onBlur={() => setPeeking(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          {me?.cards?.length ? (
            me.cards.map((card, index) => (
              <Card
                card={visibleCards ? card : undefined}
                back={!visibleCards}
                key={index}
              />
            ))
          ) : (
            <>
              <Card />
              <Card />
            </>
          )}
        </button>
        <span className="peek-hint">
          {me?.cards?.length
            ? visibleCards
              ? alwaysShow
                ? "HOLE CARDS VISIBLE"
                : "RELEASE TO HIDE"
              : "PRESS AND HOLD TO PEEK"
            : "WAITING FOR THE DEAL"}
        </span>
        {room.insight && (
          <details className="flop-insight" key={`${game?.hand}-${game?.phase}`}>
            <summary>
              <strong>VIEW PRIVATE HAND INSIGHT</strong>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div className="insight-result">
              <strong>{room.insight.hand}</strong>
              <span>
                <strong>
                  {room.insight.winOrTiePercent === 0
                    ? "<5%"
                    : room.insight.winOrTiePercent === 100
                      ? ">95%"
                      : `~${room.insight.winOrTiePercent}%`}
                </strong>
                <small>WIN OR TIE</small>
              </span>
            </div>
            <p>{room.insight.explanation}</p>
            <small className="insight-assumption">
              Estimate against {room.insight.opponents} unknown{" "}
              {room.insight.opponents === 1 ? "hand" : "hands"} if everyone stays
              to showdown. It does not predict betting or folds.
            </small>
          </details>
        )}
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
                <div className="bet-stepper">
                  <button
                    onClick={() =>
                      setRaise(Math.max(legal.minTotal, amount - 10))
                    }
                    aria-label="Decrease bet"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={legal.minTotal}
                    max={legal.maxTotal}
                    value={amount}
                    onChange={(event) => setRaise(Number(event.target.value))}
                    aria-label="Bet or raise amount"
                  />
                  <button
                    onClick={() =>
                      setRaise(Math.min(legal.maxTotal, amount + 10))
                    }
                    aria-label="Increase bet"
                  >
                    +
                  </button>
                </div>
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
                    FULL POT
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
                ? room.autoDealAt
                  ? `Next hand starts automatically in ${Math.max(0, Math.ceil((room.autoDealAt - now) / 1000))}s.`
                  : "Waiting for another player to continue."
                : "Your cards are private on this device."}
            </small>
            {game?.canShow && (
              <div className="show-muck-actions">
                <button className="show-cards-button" onClick={onShow}>
                  SHOW MY HAND
                </button>
                <button className="muck-button" onClick={onMuck}>
                  MUCK
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      <div className="social-strip">
        <div className="social-reactions">
          {reactions.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSocial("reaction", emoji)}
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim()) {
              onSocial("chat", message.trim());
              setMessage("");
            }
          }}
        >
          <input
            maxLength={72}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Say something at the table…"
            aria-label="Table message"
          />
          <button type="submit" disabled={!message.trim()}>
            SEND
          </button>
        </form>
        {room.social
          .filter(
            (item) => item.kind === "chat" && now - item.createdAt < 18000,
          )
          .slice(-2)
          .map((item) => (
            <div className="social-line" key={item.id}>
              <strong>{item.name}</strong> {item.content}
            </div>
          ))}
      </div>
    </main>
  );
}
