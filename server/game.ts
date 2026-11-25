import { freshDeck, evaluate, compareHands } from "./cards.js";
import type {
  ActionType,
  Card,
  GameView,
  HistoryEntry,
  LegalActions,
  Phase,
  Winner,
} from "../shared/types.js";

export interface GameSeat {
  id: string;
  name: string;
  stack?: number;
}
export interface GamePlayer {
  id: string;
  name: string;
  seat: number;
  stack: number;
  cards: Card[];
  bet: number;
  contributed: number;
  folded: boolean;
  acted: boolean;
  lastAction: string;
}

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

export class PokerGame {
  players: GamePlayer[];
  onChange: (game: PokerGame) => void;
  dealer: number;
  hand: number;
  phase: Phase;
  turn: number;
  board: Card[];
  deck: Card[] = [];
  pot: number;
  history: HistoryEntry[];
  winners: Winner[];
  currentBet: number;
  minRaise = BIG_BLIND;
  shownSeat: number | null = null;
  muckLocked = false;

  constructor(
    seats: GameSeat[],
    onChange: (game: PokerGame) => void = () => {},
  ) {
    if (seats.length < 2 || seats.length > 6)
      throw new Error("A table needs 2–6 players");
    this.players = seats.map((seat, index) => ({
      id: seat.id,
      name: seat.name,
      seat: index,
      stack: seat.stack ?? 1500,
      cards: [],
      bet: 0,
      contributed: 0,
      folded: false,
      acted: false,
      lastAction: "",
    }));
    this.onChange = onChange;
    this.dealer = -1;
    this.hand = 0;
    this.phase = "waiting";
    this.turn = -1;
    this.board = [];
    this.pot = 0;
    this.history = [];
    this.winners = [];
    this.shownSeat = null;
    this.muckLocked = false;
    this.currentBet = 0;
  }

  next(seat: number): number {
    return (seat + 1) % this.players.length;
  }
  findSeat(from: number, predicate: (player: GamePlayer) => boolean): number {
    let seat = from;
    for (let i = 0; i < this.players.length; i++) {
      seat = this.next(seat);
      if (predicate(this.players[seat])) return seat;
    }
    return -1;
  }
  active(player: GamePlayer): boolean {
    return !player.folded && player.stack > 0;
  }
  log(message: string, kind = "action"): void {
    this.history.unshift({ message, kind });
    this.history = this.history.slice(0, 12);
  }
  emit() {
    this.onChange(this);
  }
  commit(player: GamePlayer, amount: number): number {
    const paid = Math.min(player.stack, Math.max(0, amount));
    player.stack -= paid;
    player.bet += paid;
    player.contributed += paid;
    this.pot += paid;
    return paid;
  }

  startHand(): boolean {
    if (this.phase !== "waiting" && this.phase !== "showdown") return false;
    if (this.players.filter((player) => player.stack > 0).length < 2) {
      this.phase = "gameover";
      this.emit();
      return false;
    }
    this.hand++;
    this.deck = freshDeck();
    this.board = [];
    this.pot = 0;
    this.winners = [];
    this.phase = "preflop";
    for (const player of this.players)
      Object.assign(player, {
        cards: [],
        bet: 0,
        contributed: 0,
        folded: player.stack <= 0,
        acted: false,
        lastAction: "",
      });
    this.dealer = this.findSeat(this.dealer, (player) => player.stack > 0);
    const alive = this.players.filter((player) => player.stack > 0).length;
    const sb =
      alive === 2
        ? this.dealer
        : this.findSeat(this.dealer, (player) => player.stack > 0);
    const bb = this.findSeat(sb, (player) => player.stack > 0);
    for (let i = 0; i < 2; i++)
      for (const player of this.players)
        if (!player.folded) player.cards.push(this.deck.pop()!);
    this.commit(this.players[sb], SMALL_BLIND);
    this.commit(this.players[bb], BIG_BLIND);
    this.players[sb].lastAction = "SMALL BLIND";
    this.players[bb].lastAction = "BIG BLIND";
    this.currentBet = Math.max(this.players[sb].bet, this.players[bb].bet);
    this.minRaise = BIG_BLIND;
    this.turn = this.findSeat(bb, (player) => this.active(player));
    this.log(`Hand ${this.hand} · blinds 10 / 20`, "system");
    this.resolveAutomatic();
    this.emit();
    return true;
  }

  legalActions(seat = this.turn): LegalActions | null {
    if (
      seat !== this.turn ||
      !["preflop", "flop", "turn", "river"].includes(this.phase)
    )
      return null;
    const player = this.players[seat];
    if (!player || !this.active(player)) return null;
    const toCall = Math.min(
      player.stack,
      Math.max(0, this.currentBet - player.bet),
    );
    const maxTotal = player.bet + player.stack;
    const minTotal = Math.min(maxTotal, this.currentBet + this.minRaise);
    // An all-in below the minimum raise does not reopen betting for players who already acted.
    return {
      toCall,
      canCheck: toCall === 0,
      canRaise: maxTotal > this.currentBet && !player.acted,
      minTotal,
      maxTotal,
    };
  }

  act(seat: number, type: ActionType, total?: number): boolean {
    const legal = this.legalActions(seat);
    if (!legal) return false;
    const player = this.players[seat];
    if (type === "fold") {
      player.folded = true;
      player.lastAction = "FOLD";
      this.log(`${player.name} folds`);
    } else if (type === "check" && legal.canCheck) {
      player.lastAction = "CHECK";
      this.log(`${player.name} checks`);
    } else if (type === "call") {
      const paid = this.commit(player, legal.toCall);
      player.lastAction =
        player.stack === 0 ? "ALL IN" : legal.canCheck ? "CHECK" : "CALL";
      this.log(
        legal.canCheck
          ? `${player.name} checks`
          : `${player.name} calls ${paid}${player.stack === 0 ? " · all in" : ""}`,
      );
    } else if (type === "raise" && legal.canRaise && Number.isFinite(total)) {
      const target = Math.max(
        legal.minTotal,
        Math.min(legal.maxTotal, Math.floor(total!)),
      );
      const raiseSize = target - this.currentBet;
      this.commit(player, target - player.bet);
      this.currentBet = target;
      if (raiseSize >= this.minRaise) {
        this.minRaise = raiseSize;
        for (const other of this.players)
          if (other !== player && this.active(other)) other.acted = false;
      }
      player.lastAction = player.stack === 0 ? "ALL IN" : "RAISE";
      this.log(
        `${player.name} ${player.stack === 0 ? "is all in for" : "raises to"} ${target}`,
      );
    } else return false;
    player.acted = true;
    this.advance();
    this.emit();
    return true;
  }

  advance() {
    const survivors = this.players.filter(
      (player) => !player.folded && player.cards.length,
    );
    if (survivors.length === 1) {
      this.awardUncontested(survivors[0]);
      return;
    }
    const movers = this.players.filter((player) => this.active(player));
    if (
      movers.every(
        (player) => player.acted && player.bet === this.currentBet,
      ) ||
      movers.length === 0
    ) {
      this.nextRound();
      return;
    }
    this.turn = this.findSeat(this.turn, (player) => this.active(player));
  }

  nextRound() {
    if (this.phase === "river") {
      this.showdown();
      return;
    }
    for (const player of this.players) {
      player.bet = 0;
      player.acted = false;
      if (!player.folded) player.lastAction = "";
    }
    this.currentBet = 0;
    this.minRaise = BIG_BLIND;
    this.deck.pop();
    if (this.phase === "preflop") {
      this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
      this.phase = "flop";
    } else if (this.phase === "flop") {
      this.board.push(this.deck.pop()!);
      this.phase = "turn";
    } else {
      this.board.push(this.deck.pop()!);
      this.phase = "river";
    }
    this.log(this.phase.toUpperCase(), "street");
    this.turn = this.findSeat(this.dealer, (player) => this.active(player));
    this.resolveAutomatic();
  }

  resolveAutomatic() {
    const movers = this.players.filter((player) => this.active(player));
    if (this.turn >= 0 && movers.length >= 2) return;
    if (movers.length === 1 && movers[0].bet < this.currentBet) return;
    while (this.phase !== "river") {
      this.deck.pop();
      if (this.phase === "preflop") {
        this.board.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
        this.phase = "flop";
      } else if (this.phase === "flop") {
        this.board.push(this.deck.pop()!);
        this.phase = "turn";
      } else {
        this.board.push(this.deck.pop()!);
        this.phase = "river";
      }
    }
    this.showdown();
  }

  awardUncontested(player: GamePlayer): void {
    player.stack += this.pot;
    this.winners = [
      { seat: player.seat, amount: this.pot, name: "Uncontested" },
    ];
    this.log(`${player.name} wins ${this.pot}`, "win");
    this.phase = "showdown";
    this.turn = -1;
  }

  showUncontested(playerId: string): boolean {
    const winner = this.winners[0];
    if (
      this.phase !== "showdown" ||
      winner?.name !== "Uncontested" ||
      this.players[winner.seat]?.id !== playerId ||
      this.shownSeat !== null ||
      this.muckLocked
    )
      return false;
    this.shownSeat = winner.seat;
    this.emit();
    return true;
  }

  muckUncontested(playerId: string): boolean {
    const winner = this.winners[0];
    if (
      this.phase !== "showdown" ||
      winner?.name !== "Uncontested" ||
      this.players[winner.seat]?.id !== playerId ||
      this.shownSeat !== null ||
      this.muckLocked
    )
      return false;
    this.muckLocked = true;
    this.emit();
    return true;
  }

  showdown() {
    const contenders = this.players.filter(
      (player) => !player.folded && player.cards.length,
    );
    const hands = new Map(
      contenders.map(
        (player) =>
          [player.seat, evaluate([...player.cards, ...this.board])] as const,
      ),
    );
    const levels = [
      ...new Set(
        this.players.map((player) => player.contributed).filter(Boolean),
      ),
    ].sort((a, b) => a - b);
    let previous = 0;
    const payouts = new Map<number, number>();
    for (const level of levels) {
      const participants = this.players.filter(
        (player) => player.contributed >= level,
      );
      const eligible = participants.filter((player) => !player.folded);
      const amount = (level - previous) * participants.length;
      previous = level;
      if (!eligible.length) continue;
      eligible.sort((a, b) =>
        compareHands(hands.get(b.seat)!, hands.get(a.seat)!),
      );
      const tied = eligible.filter(
        (player) =>
          compareHands(
            hands.get(player.seat)!,
            hands.get(eligible[0].seat)!,
          ) === 0,
      );
      const share = Math.floor(amount / tied.length);
      let remainder = amount % tied.length;
      for (const player of tied)
        payouts.set(
          player.seat,
          (payouts.get(player.seat) ?? 0) + share + (remainder-- > 0 ? 1 : 0),
        );
    }
    this.winners = [...payouts].map(([seat, amount]) => ({
      seat,
      amount,
      name: hands.get(seat)!.name,
    }));
    for (const win of this.winners) this.players[win.seat].stack += win.amount;
    this.log(
      this.winners
        .map(
          (win) =>
            `${this.players[win.seat].name} wins ${win.amount} · ${win.name}`,
        )
        .join(" · "),
      "win",
    );
    this.phase = "showdown";
    this.turn = -1;
  }

  snapshot(viewerId: string | null = null): GameView {
    const reveal =
      this.phase === "showdown" && this.winners[0]?.name !== "Uncontested";
    const muckedSeat =
      this.phase === "showdown" &&
      this.winners[0]?.name === "Uncontested" &&
      this.shownSeat === null
        ? this.winners[0].seat
        : -1;
    return {
      phase: this.phase,
      hand: this.hand,
      board: this.board,
      pot: this.pot,
      dealer: this.dealer,
      turn: this.turn,
      currentBet: this.currentBet,
      winners: this.winners,
      history: this.history,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        seat: player.seat,
        stack: player.stack,
        bet: player.bet,
        folded: player.folded,
        lastAction: player.lastAction,
        cardCount: player.cards.length,
        mucked: player.seat === muckedSeat,
        cards:
          viewerId === player.id ||
          (reveal && !player.folded) ||
          this.shownSeat === player.seat
            ? player.cards
            : null,
      })),
      legal:
        viewerId == null
          ? null
          : this.legalActions(
              this.players.findIndex((player) => player.id === viewerId),
            ),
      canShow:
        viewerId !== null &&
        muckedSeat >= 0 &&
        this.players[muckedSeat].id === viewerId &&
        !this.muckLocked,
    };
  }
}
