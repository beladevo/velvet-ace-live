import test from "node:test";
import assert from "node:assert/strict";
import { PokerGame } from "../server/game.js";
import { evaluate, freshDeck } from "../server/cards.js";

const seats = (n = 4) =>
  Array.from({ length: n }, (_, index) => ({
    id: `player-${index}`,
    name: `Player ${index}`,
  }));
const c = (rank, suit) => ({
  rank,
  suit,
  value: "23456789TJQKA".indexOf(rank) + 2,
});

test("deck is unique and hand ranks cover the wheel", () => {
  const deck = freshDeck();
  assert.equal(deck.length, 52);
  assert.equal(
    new Set(deck.map((card) => `${card.rank}${card.suit}`)).size,
    52,
  );
  assert.deepEqual(
    evaluate([c("A", "♠"), c("2", "♥"), c("3", "♣"), c("4", "♦"), c("5", "♠")])
      .score,
    [4, 5],
  );
});

test("private cards never enter the table or another player snapshot", () => {
  const game = new PokerGame(seats(3));
  game.startHand();
  const table = game.snapshot();
  const viewer = game.snapshot("player-0");
  assert.ok(table.players.every((player) => player.cards === null));
  assert.equal(viewer.players[0].cards.length, 2);
  assert.ok(viewer.players.slice(1).every((player) => player.cards === null));
});

test("uncontested hands stay mucked unless the winner chooses Show", () => {
  const game = new PokerGame(seats(2));
  game.startHand();
  assert.equal(game.turn, 0);
  game.act(0, "fold");
  assert.equal(game.phase, "showdown");
  assert.ok(game.snapshot().players.every((player) => player.cards === null));
  assert.equal(game.snapshot("player-1").canShow, true);
  assert.equal(game.muckUncontested("player-1"), true);
  assert.equal(game.snapshot("player-1").canShow, false);
  assert.equal(game.showUncontested("player-1"), false);
});

test("random legal games conserve all chips", () => {
  for (let simulation = 0; simulation < 40; simulation++) {
    const game = new PokerGame(seats(2 + (simulation % 5)));
    game.startHand();
    const total = game.players.length * 1500;
    for (let step = 0; step < 400; step++) {
      assert.equal(
        game.players.reduce((sum, player) => sum + player.stack, 0) +
          (game.phase === "showdown" || game.phase === "gameover"
            ? 0
            : game.pot),
        total,
      );
      if (game.phase === "gameover") break;
      if (game.phase === "showdown") {
        game.startHand();
        continue;
      }
      const legal = game.legalActions();
      assert.ok(legal, `Expected an action during ${game.phase}`);
      const roll = Math.random();
      if (roll < 0.12 && legal.toCall) game.act(game.turn, "fold");
      else if (roll < 0.36 && legal.canRaise)
        game.act(
          game.turn,
          "raise",
          Math.min(legal.maxTotal, legal.minTotal + 20),
        );
      else game.act(game.turn, legal.canCheck ? "check" : "call");
    }
  }
});
