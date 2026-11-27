import { compareHands, evaluate, RANKS, SUITS } from "./cards.js";
import type { Card, FlopInsight, GameView } from "../shared/types.js";

const TRIALS = 1200;
const allCards: Card[] = SUITS.flatMap((suit) =>
  RANKS.map((rank, index) => ({ suit, rank, value: index + 2 })),
);
const cardKey = (card: Card) => `${card.value}${card.suit}`;

function randomSeed(value: string): () => number {
  let seed = 2166136261;
  for (let i = 0; i < value.length; i++) {
    seed ^= value.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let next = seed;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function insightKey(game: GameView, viewerId: string): string {
  const player = game.players.find((seat) => seat.id === viewerId);
  const opponents = game.players.filter(
    (player) =>
      player.id !== viewerId && !player.folded && player.cardCount === 2,
  ).length;
  return JSON.stringify([
    game.hand,
    game.phase,
    player?.cards?.map(cardKey),
    player?.folded,
    game.board.map(cardKey),
    opponents,
  ]);
}

export function createFlopInsight(
  game: GameView,
  viewerId: string,
): FlopInsight | null {
  if (!["flop", "turn", "river"].includes(game.phase)) return null;
  const player = game.players.find((seat) => seat.id === viewerId);
  if (!player?.cards || player.cards.length !== 2 || player.folded) return null;
  const opponents = game.players.filter(
    (seat) => seat.id !== viewerId && !seat.folded && seat.cardCount === 2,
  ).length;
  if (opponents < 1) return null;

  const known = [...player.cards, ...game.board];
  const knownKeys = new Set(known.map(cardKey));
  const unknown = allCards.filter((card) => !knownKeys.has(cardKey(card)));
  const remainingBoard = 5 - game.board.length;
  const random = randomSeed(insightKey(game, viewerId));
  let winsOrTies = 0;

  for (let trial = 0; trial < TRIALS; trial++) {
    const deck = [...unknown];
    const drawn: Card[] = [];
    for (let i = 0; i < remainingBoard + opponents * 2; i++) {
      const pick = i + Math.floor(random() * (deck.length - i));
      [deck[i], deck[pick]] = [deck[pick], deck[i]];
      drawn.push(deck[i]);
    }
    const board = [...game.board, ...drawn.slice(0, remainingBoard)];
    const ownHand = evaluate([...player.cards, ...board]);
    let best = true;
    for (let seat = 0; seat < opponents; seat++) {
      const start = remainingBoard + seat * 2;
      const opponentHand = evaluate([drawn[start], drawn[start + 1], ...board]);
      if (compareHands(ownHand, opponentHand) < 0) {
        best = false;
        break;
      }
    }
    if (best) winsOrTies++;
  }

  const hand = evaluate(known).name;
  const suitCounts = SUITS.map((suit) => ({
    suit,
    count: known.filter((card) => card.suit === suit).length,
  }));
  const flushDraw =
    remainingBoard > 0 && hand !== "Flush" && hand !== "Straight flush"
      ? suitCounts.find(({ count }) => count === 4)
      : undefined;
  const explanation = flushDraw
    ? `Four ${flushDraw.suit} cards are visible in your hand and on the board. Another ${flushDraw.suit} could complete a flush.`
    : remainingBoard === 2
      ? "Two community cards remain. They can improve your hand or an opponent's hand."
      : remainingBoard === 1
        ? "One community card remains. It can change the best hand."
        : "All community cards are visible. Opponents' hole cards are still unknown.";

  return {
    hand,
    explanation,
    winOrTiePercent: Math.round((winsOrTies / TRIALS) * 20) * 5,
    opponents,
  };
}
