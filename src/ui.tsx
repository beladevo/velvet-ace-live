import type {
  Card as PlayingCard,
  GameView,
  PlayerView,
  RosterView,
  Suit,
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

function SuitMark({ suit }: { suit: Suit }) {
  const shape = {
    "♥": "M50 91 C43 84 7 58 7 31 C7 10 31 8 50 31 C69 8 93 10 93 31 C93 58 57 84 50 91Z",
    "♦": "M50 5 91 50 50 95 9 50Z",
    "♣": "M50 7 C34 7 28 20 32 31 C18 24 5 34 8 49 C11 65 28 69 40 58 C39 70 33 83 25 91 H75 C67 83 61 70 60 58 C72 69 89 65 92 49 C95 34 82 24 68 31 C72 20 66 7 50 7Z",
    "♠": "M50 5 C39 23 7 39 7 59 C7 77 31 83 43 68 C42 78 35 88 27 94 H73 C65 88 58 78 57 68 C69 83 93 77 93 59 C93 39 61 23 50 5Z",
  }[suit];
  return (
    <svg className="suit-mark" viewBox="0 0 100 100" aria-hidden="true">
      <path d={shape} fill="currentColor" />
    </svg>
  );
}

function CourtArt({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <svg className="court-art" viewBox="0 0 100 125" aria-hidden="true">
      <path
        d="M16 112 Q16 81 34 70 L50 82 66 70 Q84 81 84 112Z"
        fill="#20304b"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M36 75 50 87 64 75 59 114 H41Z"
        fill={suit === "♥" || suit === "♦" ? "#bd322d" : "#d4aa5d"}
      />
      <circle
        cx="50"
        cy="54"
        r="19"
        fill="#f5d7ab"
        stroke="#6c4b38"
        strokeWidth="2"
      />
      <path
        d="M28 42 34 18 45 29 50 13 56 29 68 18 73 43Z"
        fill="#e5ba62"
        stroke="#583d38"
        strokeWidth="3"
      />
      <path
        d="M35 42 H66 M42 52 H45 M55 52 H58 M44 63 Q50 68 56 63"
        fill="none"
        stroke="#4e3442"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 112 H84 M23 96 36 104 M77 96 64 104"
        stroke="#e0b768"
        strokeWidth="3"
      />
      <text
        x="50"
        y="113"
        textAnchor="middle"
        fontSize="23"
        fontFamily="Georgia"
        fill="#f6ddb0"
      >
        {rank}
      </text>
    </svg>
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
  const court = card && ["J", "Q", "K"].includes(card.rank);
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
            <SuitMark suit={card.suit} />
          </span>
          {court ? (
            <CourtArt rank={card.rank} suit={card.suit} />
          ) : (
            <span className="card-pip">
              <SuitMark suit={card.suit} />
            </span>
          )}
          <span className="card-corner bottom">
            {card.rank}
            <SuitMark suit={card.suit} />
          </span>
        </>
      )}
      {back && <span className="back-mark">♠</span>}
    </div>
  );
}

export function Avatar({
  avatar,
  name,
  active = false,
}: {
  avatar: number;
  name: string;
  active?: boolean;
}) {
  return (
    <div
      className={`avatar ${active ? "active" : ""}`}
      style={
        {
          "--avatar-x": `${(avatar % 3) * 50}%`,
          "--avatar-y": `${Math.floor(avatar / 3) * 100}%`,
        } as React.CSSProperties
      }
      aria-label={name}
      role="img"
    />
  );
}

export function AvatarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (avatar: number) => void;
}) {
  return (
    <div
      className="avatar-picker"
      role="group"
      aria-label="Choose your character"
    >
      {Array.from({ length: 6 }, (_, avatar) => (
        <button
          key={avatar}
          type="button"
          className={value === avatar ? "selected" : ""}
          onClick={() => onChange(avatar)}
          aria-label={`Character ${avatar + 1}`}
          aria-pressed={value === avatar}
        >
          <Avatar avatar={avatar} name={`Character ${avatar + 1}`} />
        </button>
      ))}
    </div>
  );
}

type SeatPlayer = PlayerView | RosterView;
export function Seat({
  player,
  seat,
  game,
  avatar,
  bubble,
}: {
  player?: SeatPlayer;
  seat: number;
  game: GameView | null;
  avatar?: number;
  bubble?: string;
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
          <Avatar
            avatar={avatar ?? seat}
            name={player.name}
            active={isTurn || winner}
          />
          {bubble && (
            <div
              className={`seat-bubble ${bubble.length <= 4 ? "emoji" : ""}`}
              key={bubble}
            >
              {bubble}
            </div>
          )}
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
          {inGame?.mucked || inGame?.lastAction ? (
            <span className="seat-action">
              {inGame.mucked ? "MUCKED" : inGame.lastAction}
            </span>
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
