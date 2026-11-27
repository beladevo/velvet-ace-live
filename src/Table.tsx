import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RoomView } from "../shared/types";
import { Board, Brand, Seat, money } from "./ui";
export function Table({
  room,
  seconds,
  connected,
  sound,
  toggleSound,
}: {
  room: RoomView | null;
  seconds: number;
  connected: boolean;
  sound: boolean;
  toggleSound: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [chipFx, setChipFx] = useState<{
    key: number;
    seat: number;
    amount: number;
  } | null>(null);
  const [payoutFx, setPayoutFx] = useState<
    {
      seat: number;
      amount: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
    }[]
  >([]);
  const [allInFx, setAllInFx] = useState(false);
  const [showdownCardsVisible, setShowdownCardsVisible] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastPot = useRef<{
    hand: number;
    pot: number;
    turn: number;
    phase: string;
  } | null>(null);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const payoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () => () => {
      if (chipTimer.current) clearTimeout(chipTimer.current);
      if (payoutTimer.current) clearTimeout(payoutTimer.current);
    },
    [],
  );
  useEffect(() => {
    const game = room?.game;
    const previous = lastPot.current;
    if (
      game &&
      previous &&
      game.hand === previous.hand &&
      game.pot > previous.pot
    ) {
      setChipFx({
        key: Date.now(),
        seat: previous.turn,
        amount: game.pot - previous.pot,
      });
      if (chipTimer.current) clearTimeout(chipTimer.current);
      chipTimer.current = setTimeout(() => setChipFx(null), 1050);
    }
    if (
      game?.phase === "showdown" &&
      previous &&
      game.hand === previous.hand &&
      previous.phase !== "showdown" &&
      game.winners.length > 0
    ) {
      const stage = stageRef.current;
      const pot = stage?.querySelector(".pot");
      if (stage && pot) {
        const stageRect = stage.getBoundingClientRect();
        const potRect = pot.getBoundingClientRect();
        const x = potRect.left + potRect.width / 2 - stageRect.left;
        const y = potRect.top + potRect.height / 2 - stageRect.top;
        const payouts = game.winners.flatMap(({ seat, amount }) => {
          const target = stage.querySelector(`.seat-${seat} .seat-info`);
          if (!target) return [];
          const targetRect = target.getBoundingClientRect();
          return [
            {
              seat,
              amount,
              x,
              y,
              dx: targetRect.left + targetRect.width / 2 - stageRect.left - x,
              dy: targetRect.top + targetRect.height / 2 - stageRect.top - y,
            },
          ];
        });
        setPayoutFx(payouts);
        if (payoutTimer.current) clearTimeout(payoutTimer.current);
        payoutTimer.current = setTimeout(() => setPayoutFx([]), 1500);
      }
    }
    lastPot.current = game
      ? { hand: game.hand, pot: game.pot, turn: game.turn, phase: game.phase }
      : null;
  }, [room?.game?.hand, room?.game?.pot, room?.game?.turn, room?.game?.phase]);
  useEffect(() => {
    if (!room?.game?.history[0]?.message.toLowerCase().includes("all in"))
      return;
    setAllInFx(true);
    const timer = setTimeout(() => setAllInFx(false), 2600);
    return () => clearTimeout(timer);
  }, [room?.game?.history[0]?.message]);
  const revealKey =
    room?.game?.phase === "showdown"
      ? `${room.game.hand}:${room.game.players.map((player) => player.cards?.map((card) => `${card.rank}${card.suit}`).join("") ?? "").join("|")}`
      : null;
  useEffect(() => {
    if (!revealKey) {
      setShowdownCardsVisible(false);
      return;
    }
    setShowdownCardsVisible(true);
    const timer = setTimeout(() => setShowdownCardsVisible(false), 2600);
    return () => clearTimeout(timer);
  }, [revealKey]);
  if (!room)
    return (
      <main className="loading-screen">
        <Brand />
        <span>{connected ? "Opening the table…" : "Reconnecting…"}</span>
      </main>
    );
  const game = room.game;
  const ready = room.roster.filter((item) => item.connected).length;
  const autoSeconds = room.autoDealAt
    ? Math.max(0, Math.ceil((room.autoDealAt - now) / 1000))
    : null;
  const seats = Array.from(
    { length: 6 },
    (_, index) => game?.players[index] ?? room.roster[index],
  );
  const winner = game?.winners[0];
  const split = (game?.winners.length ?? 0) > 1;
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
      {room.paused && (
        <p className="table-paused" role="status">
          Table paused by admin
        </p>
      )}
      <div className="game-stage" ref={stageRef}>
        {chipFx && (
          <div
            key={chipFx.key}
            className={`chip-flight from-${Math.max(0, chipFx.seat)}`}
            aria-hidden="true"
          >
            <i>◉</i>
            <span>+{money(chipFx.amount)}</span>
          </div>
        )}
        {payoutFx.map(({ seat, amount, x, y, dx, dy }) => (
          <div
            key={`${game?.hand}-${seat}`}
            className="payout-flight"
            style={
              {
                left: x,
                top: y,
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <span className="payout-chips">
              <i />
              <i />
              <i />
            </span>
            <strong>+{money(amount)}</strong>
          </div>
        ))}
        {allInFx && (
          <div className="allin-flare" aria-live="polite">
            <strong>ALL IN!</strong>
            <span>
              {
                room.game?.players.find(
                  (player) => player.lastAction === "ALL IN",
                )?.name
              }
            </span>
          </div>
        )}
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
                <div className={`pot ${chipFx ? "pot-pulse" : ""}`}>
                  <span>◉ &nbsp; TOTAL POT</span>
                  <strong>{money(game?.pot ?? 0)}</strong>
                </div>
                <Board game={game} />
                <span className="street">
                  {game ? game.phase.toUpperCase() : "WAITING FOR PLAYERS"}
                </span>
                {game?.phase === "showdown" && winner && (
                  <div
                    className="win-burst"
                    key={`win-${game.hand}`}
                    aria-hidden="true"
                  >
                    <span>✦</span>
                    <i>◉</i>
                    <span>✦</span>
                    <i>◉</i>
                    <span>✦</span>
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
              startingStack={room.startingStack}
              revealCards={showdownCardsVisible}
              avatar={
                room.roster.find((item) => item.id === player?.id)?.avatar ??
                index
              }
              bot={room.roster.some((item) => item.id === player?.id && item.bot)}
              bubble={
                room.social
                  .filter(
                    (item) =>
                      item.playerId === player?.id &&
                      now - item.createdAt < 6500,
                  )
                  .at(-1)?.content
              }
            />
          ))}
        </div>
        {game?.phase === "showdown" && winner && (
          <div className="showdown-ribbon" role="status">
            <span>
              {split ? "SPLIT POT" : `${game.players[winner.seat]?.name} WINS`}
            </span>
            <strong>
              {winner.name === "Uncontested"
                ? "POT WON"
                : winner.name.toUpperCase()}
            </strong>
            <b>+{money(winner.amount)}</b>
          </div>
        )}
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
          {autoSeconds !== null ? (
            <div className="auto-deal" aria-live="polite">
              <span>
                {game?.phase === "showdown" ? "NEXT HAND" : "AUTO DEAL"}
              </span>
              <strong>{autoSeconds}s</strong>
            </div>
          ) : game?.turn !== undefined && game.turn >= 0 ? (
            <span className={`countdown ${seconds <= 10 ? "urgent" : ""}`}>
              {seconds}s
            </span>
          ) : null}
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
