import type {
  Card as PlayingCard,
  GameView,
  PlayerView,
  RosterView,
} from "../shared/types";

export const money = (amount = 0) =>
  new Intl.NumberFormat("en-US").format(amount);

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">♠</span>
      <span>
        VELVET <b>ACE</b>
      </span>
    </span>
  );
}

export function Card({
  card,
  back = false,
  small = false,
}: {
  card?: PlayingCard;
  back?: boolean;
  small?: boolean;
}) {
  const red = card?.suit === "♥" || card?.suit === "♦";
  return (
    <div
      className={`playing-card ${small ? "small" : ""} ${red ? "red" : ""} ${back ? "back" : ""} ${!card && !back ? "empty" : ""}`}
      aria-label={
        card
          ? `${card.rank} of ${card.suit}`
          : back
            ? "Face-down card"
            : "Empty card position"
      }
    >
      {card && (
        <>
          <span className="card-corner">
            {card.rank}
            <small>{card.suit}</small>
          </span>
          <span className="card-pip">{card.suit}</span>
          <span className="card-corner bottom">
            {card.rank}
            <small>{card.suit}</small>
          </span>
        </>
      )}
      {back && <span className="back-mark">♠</span>}
    </div>
  );
}

export function Avatar({
  seat,
  name,
  active = false,
}: {
  seat: number;
  name: string;
  active?: boolean;
}) {
  return (
    <div
      className={`avatar ${active ? "active" : ""}`}
      style={
        {
          "--avatar-x": `${(seat % 3) * 50}%`,
          "--avatar-y": `${Math.floor(seat / 3) * 100}%`,
        } as React.CSSProperties
      }
      aria-label={name}
      role="img"
    />
  );
}

type SeatPlayer = PlayerView | RosterView;
export function Seat({
  player,
  seat,
  game,
}: {
  player?: SeatPlayer;
  seat: number;
  game: GameView | null;
}) {
  const inGame = player && "stack" in player ? player : undefined;
  const isTurn = game?.turn === seat;
  const winner = game?.winners.some((item) => item.seat === seat);
  return (
    <div
      className={`seat seat-${seat} ${isTurn ? "turn" : ""} ${winner ? "winner" : ""} ${inGame?.folded ? "folded" : ""}`}
    >
      {player ? (
        <>
          <Avatar seat={seat} name={player.name} active={isTurn || winner} />
          {game?.dealer === seat && (
            <span className="dealer-chip" aria-label="Dealer button">
              D
            </span>
          )}
          <div className="seat-info">
            <strong>{player.name}</strong>
            <span>◉ {money(inGame?.stack ?? 1500)}</span>
          </div>
          {inGame?.bet ? (
            <span className="seat-bet">
              <i />
              {money(inGame.bet)}
            </span>
          ) : null}
          {inGame?.lastAction ? (
            <span className="seat-action">{inGame.lastAction}</span>
          ) : null}
          {inGame?.cards?.length && game?.phase === "showdown" ? (
            <div className="seat-cards">
              {inGame.cards.map((card, index) => (
                <Card key={index} card={card} small />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="empty-avatar">+</div>
          <span className="empty-label">OPEN SEAT</span>
        </>
      )}
    </div>
  );
}

export function Board({
  game,
  compact = false,
}: {
  game: GameView | null;
  compact?: boolean;
}) {
  return (
    <div className={`board ${compact ? "compact" : ""}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} card={game?.board[index]} small={compact} />
      ))}
    </div>
  );
}
