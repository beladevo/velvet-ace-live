import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Socket } from "socket.io";
import type {
  ActionType,
  FlopInsight,
  RoomView,
  SocialEvent,
  SocialKind,
} from "../shared/types.js";
import { PokerGame } from "./game.js";
import { clientIp } from "./client-ip.js";
import {
  secretHash,
  type Ban,
  type RoomStore,
  type SavedRoom,
} from "./persistence.js";
import { createFlopInsight, insightKey } from "./insight.js";

interface RosterPlayer {
  id: string;
  tokenHash: string;
  name: string;
  connected: boolean;
  seat: number;
  avatar: number;
  lastSocialAt: number;
  ip: string;
  userAgent: string;
  firstSeenAt: number;
  lastSeenAt: number;
}
type RoomConfig = SavedRoom["config"];
const defaultConfig = (): RoomConfig => ({
  paused: false,
  locked: false,
  autoDeal: true,
  turnSeconds: 35,
  startingStack: 1500,
});
interface Room {
  id: string;
  hostKey: string | null;
  hostKeyHash: string;
  roster: RosterPlayer[];
  sockets: Map<string, Socket>;
  game: PokerGame | null;
  deadline: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  turnKey: string | null;
  autoTimer: ReturnType<typeof setTimeout> | null;
  autoKey: string | null;
  autoDealAt: number | null;
  createdAt: number;
  lastActiveAt: number;
  social: SocialEvent[];
  recoveryUntil: number | null;
  config: RoomConfig;
  insightCache: Map<string, { key: string; insight: FlopInsight }>;
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
const reactions = new Set(["😂", "🔥", "👏", "😮", "🍀", "❤️"]);
const validAvatar = (value: unknown): number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) < 6
    ? Number(value)
    : 0;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private publicBaseUrl: string;
  private pending = new Map<string, SavedRoom>();
  private pendingDeletes = new Set<string>();
  private flushing = false;
  private databaseOnline = true;
  private restorePending = false;
  private bans = new Map<string, Ban>();
  private bansDirty = false;
  private bansVersion = 0;
  private insightEnabled = process.env.VIP_FLOP_INSIGHT_ENABLED === "true";
  constructor(
    publicBaseUrl: string,
    private store?: RoomStore,
  ) {
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
    if (store) setInterval(() => void this.flush(), 5000).unref();
  }

  async restore(): Promise<void> {
    if (!this.store) return;
    try {
      this.restoreRooms(await this.store.load());
      this.bans = new Map(
        (await this.store.loadBans()).map((ban) => [
          `${ban.kind}:${ban.value}`,
          ban,
        ]),
      );
      this.databaseOnline = true;
    } catch (error) {
      this.databaseOnline = false;
      this.restorePending = true;
      console.warn("Database unavailable; using in-memory rooms:", error);
    }
  }

  private restoreRooms(savedRooms: SavedRoom[]): void {
    for (const saved of savedRooms) {
      if (saved.version !== 1 || this.rooms.has(saved.id)) continue;
      const room: Room = {
        id: saved.id,
        hostKey: null,
        hostKeyHash: saved.hostKeyHash,
        roster: saved.roster.map((player) => ({
          ...player,
          connected: false,
          lastSocialAt: 0,
        })),
        sockets: new Map(),
        game: null,
        deadline: null,
        timer: null,
        turnKey: null,
        autoTimer: null,
        autoKey: null,
        autoDealAt: null,
        createdAt: saved.createdAt,
        lastActiveAt: saved.lastActiveAt ?? saved.createdAt,
        social: [],
        recoveryUntil: saved.game ? Date.now() + 60_000 : null,
        config: saved.config ?? defaultConfig(),
        insightCache: new Map(),
      };
      room.game = saved.game
        ? PokerGame.restore(saved.game, () => this.send(room))
        : null;
      this.rooms.set(room.id, room);
    }
  }

  private checkpoint(room: Room): SavedRoom {
    return {
      version: 1,
      id: room.id,
      hostKeyHash: room.hostKeyHash,
      createdAt: room.createdAt,
      lastActiveAt: room.lastActiveAt,
      roster: room.roster.map(
        ({
          id,
          tokenHash,
          name,
          seat,
          avatar,
          ip,
          userAgent,
          firstSeenAt,
          lastSeenAt,
        }) => ({
          id,
          tokenHash,
          name,
          seat,
          avatar,
          ip,
          userAgent,
          firstSeenAt,
          lastSeenAt,
        }),
      ),
      game: room.game?.checkpoint() ?? null,
      config: room.config,
    };
  }

  private save(room: Room): void {
    room.lastActiveAt = Date.now();
    if (!this.store) return;
    this.pending.set(room.id, structuredClone(this.checkpoint(room)));
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (!this.store || this.flushing) return;
    this.flushing = true;
    try {
      if (this.restorePending) {
        this.restoreRooms(await this.store.load());
        const savedBans = await this.store.loadBans();
        this.bans = new Map([
          ...savedBans.map((ban) => [`${ban.kind}:${ban.value}`, ban] as const),
          ...this.bans,
        ]);
        this.restorePending = false;
      }
      if (this.bansDirty) {
        const version = this.bansVersion;
        await this.store.saveBans([...this.bans.values()]);
        if (this.bansVersion === version) this.bansDirty = false;
      }
      while (this.pending.size || this.pendingDeletes.size) {
        const entry = this.pending.entries().next().value;
        if (entry) {
          const [id, snapshot] = entry;
          await this.store.save(snapshot);
          if (this.pending.get(id) === snapshot) this.pending.delete(id);
        } else {
          const id = this.pendingDeletes.values().next().value!;
          await this.store.delete(id);
          this.pendingDeletes.delete(id);
        }
      }
      if (!this.databaseOnline) console.info("Database connection restored.");
      this.databaseOnline = true;
    } catch (error) {
      if (this.databaseOnline)
        console.warn("Database unavailable; continuing in memory:", error);
      this.databaseOnline = false;
    } finally {
      this.flushing = false;
      if (
        this.databaseOnline &&
        (this.pending.size || this.pendingDeletes.size || this.bansDirty)
      )
        void this.flush();
    }
  }

  async drain(timeoutMs = 5000): Promise<boolean> {
    if (!this.store) return true;
    const until = Date.now() + timeoutMs;
    do {
      await this.flush();
      if (
        !this.flushing &&
        !this.pending.size &&
        !this.pendingDeletes.size &&
        !this.bansDirty
      )
        return true;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < until);
    return false;
  }

  create(): Room {
    let id: string;
    do {
      id = code();
    } while (this.rooms.has(id));
    const hostKey = token();
    const room: Room = {
      id,
      hostKey,
      hostKeyHash: secretHash(hostKey),
      roster: [],
      sockets: new Map(),
      game: null,
      deadline: null,
      timer: null,
      turnKey: null,
      autoTimer: null,
      autoKey: null,
      autoDealAt: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      social: [],
      recoveryUntil: null,
      config: defaultConfig(),
      insightCache: new Map(),
    };
    this.rooms.set(id, room);
    this.save(room);
    return room;
  }

  get(id: unknown): Room | undefined {
    return this.rooms.get(String(id ?? "").toUpperCase());
  }
  count(): number {
    return this.rooms.size;
  }
  joinUrl(room: Room): string {
    return `${this.publicBaseUrl}/?join=${room.id}`;
  }
  tableUrl(room: Room): string {
    return `${this.publicBaseUrl}/?table=${room.id}&key=${room.hostKey}`;
  }

  bindHost(socket: Socket, id: unknown, key: unknown) {
    const room = this.get(id);
    if (
      !room ||
      typeof key !== "string" ||
      room.hostKeyHash !== secretHash(key)
    )
      return { error: "Invalid table link." };
    this.attach(socket, room, "host", null);
    this.send(room);
    return { ok: true };
  }

  joinPlayer(
    socket: Socket,
    id: unknown,
    name: unknown,
    existingToken?: unknown,
    avatar?: unknown,
  ) {
    const room = this.get(id);
    if (!room) return { error: "Table not found. Check the code on the TV." };
    const ip = clientIp(
      socket.handshake?.headers ?? {},
      socket.handshake?.address,
    );
    if (this.bans.has(`ip:${ip}`))
      return { error: "Access to this table is unavailable." };
    if (
      typeof existingToken === "string" &&
      this.bans.has(`guest:${secretHash(existingToken)}`)
    )
      return { error: "Access to this table is unavailable." };
    let player =
      typeof existingToken === "string"
        ? room.roster.find(
            (item) => item.tokenHash === secretHash(existingToken),
          )
        : undefined;
    let newToken: string | null = null;
    if (!player) {
      if (room.config.locked)
        return { error: "This table is locked to new guests." };
      if (room.roster.length >= 6) return { error: "This table is full." };
      const displayName = cleanName(name);
      if (displayName.length < 2)
        return { error: "Enter a name with at least two characters." };
      newToken = token();
      player = {
        id: randomUUID(),
        tokenHash: secretHash(newToken),
        name: displayName,
        connected: false,
        seat: room.roster.length,
        avatar: validAvatar(avatar),
        lastSocialAt: 0,
        ip,
        userAgent: String(socket.handshake?.headers["user-agent"] ?? "").slice(
          0,
          200,
        ),
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
      };
      room.roster.push(player);
      this.save(room);
    }
    player.connected = true;
    player.ip = ip;
    player.userAgent = String(
      socket.handshake?.headers["user-agent"] ?? "",
    ).slice(0, 200);
    player.lastSeenAt = Date.now();
    this.attach(socket, room, "player", player.id);
    this.send(room);
    return {
      ok: true,
      token: newToken ?? existingToken,
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
    return this.deal(room, fresh);
  }

  private deal(room: Room, fresh = false) {
    if (room.config.paused) return { error: "This table is paused." };
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
              ? room.config.startingStack
              : (stacks.get(player.id) ?? room.config.startingStack),
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
    this.save(room);
    this.send(room);
    return { ok: true };
  }

  act(socket: Socket, type: unknown, total: unknown) {
    const room = this.get(socket.data.roomId);
    if (!room || socket.data.role !== "player" || !room.game)
      return { error: "Join a table first." };
    if (room.config.paused) return { error: "This table is paused." };
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

  setAvatar(socket: Socket, choice: unknown) {
    const room = this.get(socket.data.roomId);
    const player = room?.roster.find(
      (item) => item.id === socket.data.playerId,
    );
    if (
      !room ||
      !player ||
      socket.data.role !== "player" ||
      !Number.isInteger(choice) ||
      Number(choice) < 0 ||
      Number(choice) > 5
    )
      return { error: "Choose one of the available characters." };
    player.avatar = Number(choice);
    this.save(room);
    this.send(room);
    return { ok: true };
  }

  show(socket: Socket) {
    const room = this.get(socket.data.roomId);
    if (
      !room?.game ||
      socket.data.role !== "player" ||
      !room.game.showUncontested(socket.data.playerId)
    )
      return { error: "You cannot show cards now." };
    return { ok: true };
  }

  muck(socket: Socket) {
    const room = this.get(socket.data.roomId);
    if (
      !room?.game ||
      socket.data.role !== "player" ||
      !room.game.muckUncontested(socket.data.playerId)
    )
      return { error: "You cannot muck cards now." };
    return { ok: true };
  }

  social(socket: Socket, kind: unknown, content: unknown) {
    const room = this.get(socket.data.roomId);
    const player = room?.roster.find(
      (item) => item.id === socket.data.playerId,
    );
    if (!room || !player || socket.data.role !== "player")
      return { error: "Join a table first." };
    const now = Date.now();
    if (now - player.lastSocialAt < 1200)
      return { error: "Give everyone a moment between messages." };
    if (kind !== "chat" && kind !== "reaction")
      return { error: "Invalid message." };
    const text = String(content ?? "")
      .trim()
      .replace(/[<>\u0000-\u001f\u007f]/g, "")
      .slice(0, kind === "chat" ? 72 : 4);
    if (!text || (kind === "reaction" && !reactions.has(text)))
      return { error: "Choose a reaction or enter a short message." };
    player.lastSocialAt = now;
    room.social.push({
      id: randomUUID(),
      playerId: player.id,
      name: player.name,
      seat: player.seat,
      kind: kind as SocialKind,
      content: text,
      createdAt: now,
    });
    room.social = room.social.slice(-12);
    this.send(room);
    return { ok: true };
  }

  adminData() {
    return {
      rooms: [...this.rooms.values()].map((room) => ({
        code: room.id,
        createdAt: room.createdAt,
        config: room.config,
        phase: room.game?.phase ?? "waiting",
        hand: room.game?.hand ?? 0,
        pot: room.game?.pot ?? 0,
        players: room.roster.map((player) => ({
          id: player.id,
          name: player.name,
          seat: player.seat,
          connected: player.connected,
          avatar: player.avatar,
          ip: player.ip,
          userAgent: player.userAgent,
          firstSeenAt: player.firstSeenAt,
          lastSeenAt: player.lastSeenAt,
          stack:
            room.game?.players.find((seat) => seat.id === player.id)?.stack ??
            null,
        })),
      })),
      bans: [...this.bans.values()],
      database: this.store
        ? this.databaseOnline
          ? "connected"
          : "offline"
        : "memory",
    };
  }

  adminSetConfig(code: string, config: RoomConfig): boolean {
    const room = this.get(code);
    if (
      !room ||
      !Number.isInteger(config.turnSeconds) ||
      config.turnSeconds < 15 ||
      config.turnSeconds > 120 ||
      !Number.isInteger(config.startingStack) ||
      config.startingStack < 500 ||
      config.startingStack > 10_000
    )
      return false;
    room.config = config;
    room.turnKey = null;
    this.send(room);
    return true;
  }

  adminBanIp(ip: string, reason: string): boolean {
    if (!isIP(ip)) return false;
    this.addBan({
      kind: "ip",
      value: ip,
      reason: reason.slice(0, 120),
      createdAt: Date.now(),
    });
    for (const room of this.rooms.values())
      for (const socket of room.sockets.values())
        if (
          socket.data.role === "player" &&
          room.roster.find((player) => player.id === socket.data.playerId)
            ?.ip === ip
        )
          socket.disconnect(true);
    return true;
  }

  adminBanGuest(code: string, playerId: string, reason: string): boolean {
    const room = this.get(code);
    const player = room?.roster.find((guest) => guest.id === playerId);
    if (!room || !player) return false;
    this.addBan({
      kind: "guest",
      value: player.tokenHash,
      label: `${player.name} · ${room.id}`,
      reason: reason.slice(0, 120),
      createdAt: Date.now(),
    });
    for (const socket of room.sockets.values())
      if (socket.data.playerId === playerId) socket.disconnect(true);
    return true;
  }

  adminKick(code: string, playerId: string): boolean {
    const room = this.get(code);
    if (!room?.roster.some((guest) => guest.id === playerId)) return false;
    for (const socket of room.sockets.values())
      if (socket.data.playerId === playerId) socket.disconnect(true);
    return true;
  }

  adminUnban(kind: string, value: string): boolean {
    if (kind !== "ip" && kind !== "guest") return false;
    const removed = this.bans.delete(`${kind}:${value}`);
    if (removed) this.saveBans();
    return removed;
  }

  private addBan(ban: Ban): void {
    this.bans.set(`${ban.kind}:${ban.value}`, ban);
    this.saveBans();
  }

  private saveBans(): void {
    this.bansDirty = true;
    this.bansVersion++;
    void this.flush();
  }

  adminClose(code: string): boolean {
    const room = this.get(code);
    if (!room) return false;
    if (room.timer) clearTimeout(room.timer);
    if (room.autoTimer) clearTimeout(room.autoTimer);
    this.rooms.delete(room.id);
    for (const socket of room.sockets.values()) socket.disconnect(true);
    this.pending.delete(room.id);
    this.pendingDeletes.add(room.id);
    void this.flush();
    return true;
  }

  send(room: Room): void {
    this.save(room);
    this.scheduleTurn(room);
    this.scheduleAutoDeal(room);
    const game = room.game;
    const roster = room.roster.map(({ id, name, connected, seat, avatar }) => ({
      id,
      name,
      connected,
      seat,
      avatar,
    }));
    for (const socket of room.sockets.values()) {
      const viewerId =
        socket.data.role === "player" ? socket.data.playerId : null;
      const gameView = game?.snapshot(viewerId) ?? null;
      if (room.config.paused && gameView) gameView.legal = null;
      const vip = room.roster.find((player) => player.id === viewerId);
      let insight: FlopInsight | null = null;
      if (this.insightEnabled && vip?.name === "beladev" && gameView) {
        const key = insightKey(gameView, vip.id);
        const cached = room.insightCache.get(vip.id);
        insight = cached?.key === key ? cached.insight : createFlopInsight(gameView, vip.id);
        if (insight && cached?.key !== key)
          room.insightCache.set(vip.id, { key, insight });
      }
      const view: RoomView = {
        code: room.id,
        paused: room.config.paused,
        startingStack: room.config.startingStack,
        role: socket.data.role,
        playerId: viewerId,
        roster,
        social: room.social,
        joinUrl: this.joinUrl(room),
        game: gameView,
        insight,
        deadline: room.deadline,
        autoDealAt: room.autoDealAt,
      };
      socket.emit("room:state", view);
    }
  }

  private scheduleAutoDeal(room: Room): void {
    const game = room.game;
    const phase = game?.phase;
    const ready = room.roster.filter((player) => player.connected);
    const eligible =
      game?.players.filter((player) => player.stack > 0).length ?? 0;
    const canDeal =
      room.config.autoDeal &&
      !room.config.paused &&
      ready.length >= 2 &&
      (!game ||
        phase === "waiting" ||
        phase === "showdown" ||
        phase === "gameover");
    const key = canDeal
      ? `${phase ?? "waiting"}:${game?.hand ?? 0}:${ready.map((player) => player.id).join(",")}`
      : null;
    if (room.autoKey === key) return;
    if (room.autoTimer) clearTimeout(room.autoTimer);
    room.autoKey = key;
    room.autoTimer = null;
    const delay =
      phase === "showdown"
        ? eligible < 2
          ? 10000
          : 7000
        : phase === "gameover"
          ? 10000
          : 2500;
    room.autoDealAt = key ? Date.now() + delay : null;
    if (!key) return;
    room.autoTimer = setTimeout(() => {
      if (room.autoKey !== key) return;
      room.autoKey = null;
      room.autoTimer = null;
      room.autoDealAt = null;
      this.deal(
        room,
        phase === "gameover" || (phase === "showdown" && eligible < 2),
      );
    }, delay);
    room.autoTimer.unref();
    for (const socket of room.sockets.values())
      socket.emit("room:auto-deal", room.autoDealAt);
  }

  scheduleTurn(room: Room): void {
    const game = room.game;
    if (room.config.paused) {
      if (room.timer) clearTimeout(room.timer);
      room.timer = null;
      room.turnKey = null;
      room.deadline = null;
      return;
    }
    if (room.recoveryUntil) {
      const allBack = game?.players.every((player) =>
        room.roster.some((guest) => guest.id === player.id && guest.connected),
      );
      if (allBack || Date.now() >= room.recoveryUntil) {
        room.recoveryUntil = null;
      } else {
        if (room.timer) clearTimeout(room.timer);
        room.turnKey = null;
        room.deadline = room.recoveryUntil;
        room.timer = setTimeout(() => {
          room.recoveryUntil = null;
          this.send(room);
        }, room.recoveryUntil - Date.now());
        room.timer.unref();
        return;
      }
    }
    const key =
      game && game.turn >= 0
        ? `${game.hand}:${game.phase}:${game.turn}:${game.history.length}`
        : null;
    if (room.turnKey === key) return;
    if (room.timer) clearTimeout(room.timer);
    room.turnKey = key;
    room.deadline = key ? Date.now() + room.config.turnSeconds * 1000 : null;
    if (!key || !game) return;
    const player = game.players[game.turn];
    const connected = room.roster.find(
      (item) => item.id === player.id,
    )?.connected;
    const wait = connected ? room.config.turnSeconds * 1000 : 2500;
    room.deadline = Date.now() + wait;
    room.timer = setTimeout(() => {
      if (room.turnKey !== key) return;
      const legal = game.legalActions(game.turn);
      if (legal) game.act(game.turn, legal.canCheck ? "check" : "fold");
    }, wait);
    room.timer.unref();
    for (const socket of room.sockets.values())
      socket.emit("room:deadline", room.deadline);
  }

  cleanup(): void {
    for (const [id, room] of this.rooms)
      if (
        !room.sockets.size &&
        Date.now() - room.lastActiveAt > 8 * 60 * 60 * 1000
      ) {
        if (room.timer) clearTimeout(room.timer);
        if (room.autoTimer) clearTimeout(room.autoTimer);
        this.rooms.delete(id);
        this.pending.delete(id);
        this.pendingDeletes.add(id);
        void this.flush();
      }
  }
}
