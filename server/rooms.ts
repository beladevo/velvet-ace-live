import { randomBytes, randomUUID } from "node:crypto";
import type { Socket } from "socket.io";
import type { ActionType, RoomView } from "../shared/types.js";
import { PokerGame } from "./game.js";

interface RosterPlayer {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  seat: number;
}
interface Room {
  id: string;
  hostKey: string;
  roster: RosterPlayer[];
  sockets: Map<string, Socket>;
  game: PokerGame | null;
  deadline: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  turnKey: string | null;
  createdAt: number;
}

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () =>
  Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join(
    "",
  );
const token = () => randomBytes(24).toString("hex");
const cleanName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/[<>\u0000-\u001f]/g, "")
    .slice(0, 18);

export class RoomManager {
  private rooms = new Map<string, Room>();
  private publicBaseUrl: string;
  constructor(publicBaseUrl: string) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  create(): Room {
    let id: string;
    do {
      id = code();
    } while (this.rooms.has(id));
    const room: Room = {
      id,
      hostKey: token(),
      roster: [],
      sockets: new Map(),
      game: null,
      deadline: null,
      timer: null,
      turnKey: null,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    return room;
  }

  get(id: unknown): Room | undefined {
    return this.rooms.get(String(id ?? "").toUpperCase());
  }
  joinUrl(room: Room): string {
    return `${this.publicBaseUrl}/?join=${room.id}`;
  }
  tableUrl(room: Room): string {
    return `${this.publicBaseUrl}/?table=${room.id}&key=${room.hostKey}`;
  }

  bindHost(socket: Socket, id: unknown, key: unknown) {
    const room = this.get(id);
    if (!room || room.hostKey !== key) return { error: "Invalid table link." };
    this.attach(socket, room, "host", null);
    this.send(room);
    return { ok: true };
  }

  joinPlayer(
    socket: Socket,
    id: unknown,
    name: unknown,
    existingToken?: unknown,
  ) {
    const room = this.get(id);
    if (!room) return { error: "Table not found. Check the code on the TV." };
    let player =
      typeof existingToken === "string"
        ? room.roster.find((item) => item.token === existingToken)
        : undefined;
    if (!player) {
      if (room.roster.length >= 6) return { error: "This table is full." };
      const displayName = cleanName(name);
      if (displayName.length < 2)
        return { error: "Enter a name with at least two characters." };
      player = {
        id: randomUUID(),
        token: token(),
        name: displayName,
        connected: false,
        seat: room.roster.length,
      };
      room.roster.push(player);
    }
    player.connected = true;
    this.attach(socket, room, "player", player.id);
    this.send(room);
    return {
      ok: true,
      token: player.token,
      name: player.name,
      seat: player.seat,
    };
  }

  attach(
    socket: Socket,
    room: Room,
    role: "host" | "player",
    playerId: string | null,
  ): void {
    this.detach(socket);
    socket.data.roomId = room.id;
    socket.data.role = role;
    socket.data.playerId = playerId;
    room.sockets.set(socket.id, socket);
    socket.join(room.id);
  }

  detach(socket: Socket): void {
    const room = this.get(socket.data.roomId);
    if (!room) return;
    room.sockets.delete(socket.id);
    if (socket.data.role === "player") {
      const player = room.roster.find(
        (item) => item.id === socket.data.playerId,
      );
      if (player)
        player.connected = [...room.sockets.values()].some(
          (other) => other.data.playerId === player.id,
        );
    }
    socket.leave(room.id);
    socket.data.roomId = null;
    this.send(room);
  }

  start(socket: Socket, fresh = false) {
    const room = this.get(socket.data.roomId);
    if (!room || socket.data.role !== "host")
      return { error: "Only the table host can deal." };
    const ready = room.roster.filter((player) => player.connected);
    if (ready.length < 2)
      return { error: "At least two connected players are needed." };
    if (
      room.game &&
      !fresh &&
      !["showdown", "waiting", "gameover"].includes(room.game.phase)
    )
      return { error: "A hand is already in progress." };
    const previous = room.game;
    const previousIds = previous?.players.map((player) => player.id) ?? [];
    const readyIds = ready.map((player) => player.id);
    const seatsChanged =
      previousIds.length !== readyIds.length ||
      previousIds.some((id, index) => id !== readyIds[index]);
    if (fresh || !previous || previous.phase === "gameover" || seatsChanged) {
      const stacks = new Map(
        previous?.players.map((player) => [player.id, player.stack]) ?? [],
      );
      room.game = new PokerGame(
        ready.map((player) => ({
          id: player.id,
          name: player.name,
          stack:
            fresh || previous?.phase === "gameover"
              ? 1500
              : (stacks.get(player.id) ?? 1500),
        })),
        () => this.send(room),
      );
      if (!fresh && previous && previous.phase !== "gameover") {
        room.game.hand = previous.hand;
        const dealerId = previous.players[previous.dealer]?.id;
        room.game.dealer = ready.findIndex((player) => player.id === dealerId);
      }
    }
    if (!room.game?.startHand())
      return { error: "This table has a winner. Start a new game." };
    this.send(room);
    return { ok: true };
  }

  act(socket: Socket, type: unknown, total: unknown) {
    const room = this.get(socket.data.roomId);
    if (!room || socket.data.role !== "player" || !room.game)
      return { error: "Join a table first." };
    const seat = room.game.players.findIndex(
      (player) => player.id === socket.data.playerId,
    );
    if (
      seat < 0 ||
      !["fold", "check", "call", "raise"].includes(String(type)) ||
      !room.game.act(seat, type as ActionType, Number(total))
    )
      return { error: "That action is not available now." };
    return { ok: true };
  }

  send(room: Room): void {
    const game = room.game;
    const roster = room.roster.map(({ id, name, connected, seat }) => ({
      id,
      name,
      connected,
      seat,
    }));
    for (const socket of room.sockets.values()) {
      const viewerId =
        socket.data.role === "player" ? socket.data.playerId : null;
      const view: RoomView = {
        code: room.id,
        role: socket.data.role,
        playerId: viewerId,
        roster,
        joinUrl: this.joinUrl(room),
        game: game?.snapshot(viewerId) ?? null,
        deadline: room.deadline,
      };
      socket.emit("room:state", view);
    }
    this.scheduleTurn(room);
  }

  scheduleTurn(room: Room): void {
    const game = room.game;
    const key =
      game && game.turn >= 0
        ? `${game.hand}:${game.phase}:${game.turn}:${game.history.length}`
        : null;
    if (room.turnKey === key) return;
    if (room.timer) clearTimeout(room.timer);
    room.turnKey = key;
    room.deadline = key ? Date.now() + 35000 : null;
    if (!key || !game) return;
    const player = game.players[game.turn];
    const connected = room.roster.find(
      (item) => item.id === player.id,
    )?.connected;
    const wait = connected ? 35000 : 2500;
    room.deadline = Date.now() + wait;
    room.timer = setTimeout(() => {
      if (room.turnKey !== key) return;
      const legal = game.legalActions(game.turn);
      if (legal) game.act(game.turn, legal.canCheck ? "check" : "fold");
    }, wait);
    for (const socket of room.sockets.values())
      socket.emit("room:deadline", room.deadline);
  }

  cleanup(): void {
    for (const [id, room] of this.rooms)
      if (
        !room.sockets.size &&
        Date.now() - room.createdAt > 8 * 60 * 60 * 1000
      ) {
        if (room.timer) clearTimeout(room.timer);
        this.rooms.delete(id);
      }
  }
}
