export type Suit = "♠" | "♥" | "♦" | "♣";
export interface Card {
  suit: Suit;
  rank: string;
  value: number;
}
export type Phase =
  "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "gameover";
export type ActionType = "fold" | "check" | "call" | "raise";
export interface LegalActions {
  toCall: number;
  canCheck: boolean;
  canRaise: boolean;
  minTotal: number;
  maxTotal: number;
}
export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  stack: number;
  bet: number;
  folded: boolean;
  lastAction: string;
  cardCount: number;
  cards: Card[] | null;
  mucked: boolean;
}
export interface HistoryEntry {
  message: string;
  kind: string;
}
export interface Winner {
  seat: number;
  amount: number;
  name: string;
}
export interface GameView {
  phase: Phase;
  hand: number;
  board: Card[];
  pot: number;
  dealer: number;
  turn: number;
  currentBet: number;
  winners: Winner[];
  history: HistoryEntry[];
  players: PlayerView[];
  legal: LegalActions | null;
  canShow: boolean;
}
export interface RosterView {
  id: string;
  name: string;
  connected: boolean;
  seat: number;
  avatar: number;
}
export type SocialKind = "chat" | "reaction";
export interface SocialEvent {
  id: string;
  playerId: string;
  name: string;
  seat: number;
  kind: SocialKind;
  content: string;
  createdAt: number;
}
export interface RoomView {
  code: string;
  paused: boolean;
  startingStack: number;
  role: "host" | "player";
  playerId: string | null;
  roster: RosterView[];
  social: SocialEvent[];
  joinUrl: string;
  game: GameView | null;
  deadline: number | null;
  autoDealAt: number | null;
}
export type Result = { ok: true } | { error: string };
