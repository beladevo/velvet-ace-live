export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function freshDeck() {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank, index) => ({ suit, rank, value: index + 2 })));
  for (let i = cards.length - 1; i > 0; i--) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const j = random[0] % (i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

const LABELS = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

function compareValues(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

function scoreFive(cards) {
  const sorted = cards.map((card) => card.value).sort((a, b) => b - a);
  const groups = [...new Set(sorted)].map((value) => ({ value, count: sorted.filter((v) => v === value).length })).sort((a, b) => b.count - a.count || b.value - a.value);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const unique = [...new Set(sorted)];
  if (unique.includes(14)) unique.push(1);
  let straightHigh = 0;
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) { straightHigh = unique[i]; break; }
  }
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0].count === 4) return [7, groups[0].value, groups[1].value];
  if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].value, groups[1].value];
  if (flush) return [5, ...sorted];
  if (straightHigh) return [4, straightHigh];
  if (groups[0].count === 3) return [3, groups[0].value, ...groups.slice(1).map((g) => g.value).sort((a, b) => b - a)];
  if (groups[0].count === 2 && groups[1].count === 2) return [2, Math.max(groups[0].value, groups[1].value), Math.min(groups[0].value, groups[1].value), groups[2].value];
  if (groups[0].count === 2) return [1, groups[0].value, ...groups.slice(1).map((g) => g.value).sort((a, b) => b - a)];
  return [0, ...sorted];
}

export function evaluate(cards) {
  if (cards.length < 5) return { score: [0], name: 'Waiting for board' };
  let best = null;
  for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++)
        for (let d = c + 1; d < cards.length - 1; d++)
          for (let e = d + 1; e < cards.length; e++) {
            const score = scoreFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareValues(score, best) > 0) best = score;
          }
  return { score: best, name: LABELS[best[0]] };
}

export function compareHands(a, b) { return compareValues(a.score, b.score); }

export function startingHandName(cards) {
  if (cards.length < 2) return 'Waiting for cards';
  if (cards[0].value === cards[1].value) return `Pocket ${cards[0].rank}s`;
  return `${cards[0].rank}-${cards[1].rank}${cards[0].suit === cards[1].suit ? ' suited' : ' offsuit'}`;
}
