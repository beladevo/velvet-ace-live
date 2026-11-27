import assert from "node:assert/strict";
import test from "node:test";
import type { Socket } from "socket.io";
import { RoomManager } from "../server/rooms.js";
import type { Ban, RoomStore, SavedRoom } from "../server/persistence.js";

class MemoryStore implements RoomStore {
  rooms = new Map<string, SavedRoom>();
  fail = false;
  bans: Ban[] = [];

  async load(): Promise<SavedRoom[]> {
    if (this.fail) throw new Error("offline");
    return [...this.rooms.values()].map((room) => structuredClone(room));
  }
  async save(room: SavedRoom): Promise<void> {
    if (this.fail) throw new Error("offline");
    this.rooms.set(room.id, structuredClone(room));
  }
  async delete(id: string): Promise<void> {
    this.rooms.delete(id);
  }
  async loadBans(): Promise<Ban[]> {
    if (this.fail) throw new Error("offline");
    return structuredClone(this.bans);
  }
  async saveBans(bans: Ban[]): Promise<void> {
    if (this.fail) throw new Error("offline");
    this.bans = structuredClone(bans);
  }
}

function socket(): Socket {
  return {
    id: crypto.randomUUID(),
    data: {},
    join() {},
    leave() {},
    emit() {},
  } as unknown as Socket;
}

async function waitFor(
  predicate: () => boolean,
  timeout = 1000,
): Promise<void> {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("Checkpoint was not saved");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("restores an active hand, stacks, and guest access without storing raw keys", async () => {
  const store = new MemoryStore();
  const rooms = new RoomManager("http://localhost:4173", store);
  const room = rooms.create();
  const key = new URL(rooms.tableUrl(room)).searchParams.get("key");
  const host = socket();
  assert.deepEqual(rooms.bindHost(host, room.id, key), { ok: true });
  const alex = socket();
  const sam = socket();
  const a = rooms.joinPlayer(alex, room.id, "Alex");
  const b = rooms.joinPlayer(sam, room.id, "Sam");
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.ok(room.autoTimer);
  assert.equal(
    rooms.adminSetConfig(room.id, {
      paused: true,
      locked: false,
      autoDeal: true,
      turnSeconds: 35,
      startingStack: 1500,
    }),
    true,
  );
  assert.equal(room.autoTimer, null);
  assert.equal(
    rooms.adminSetConfig(room.id, {
      paused: false,
      locked: false,
      autoDeal: true,
      turnSeconds: 35,
      startingStack: 1500,
    }),
    true,
  );
  assert.deepEqual(rooms.start(host), { ok: true });
  const game = room.game!;
  const actor = game.players[game.turn];
  const actorSocket = actor.id === alex.data.playerId ? alex : sam;
  assert.deepEqual(rooms.act(actorSocket, "call", 0), { ok: true });
  assert.equal(
    rooms.adminSetConfig(room.id, {
      paused: true,
      locked: true,
      autoDeal: false,
      turnSeconds: 45,
      startingStack: 2000,
    }),
    true,
  );
  assert.equal(rooms.adminBanIp("127.0.0.1", "test"), true);
  await waitFor(
    () =>
      store.rooms.get(room.id)?.game?.history.length === game.history.length,
  );
  await waitFor(() => store.bans.length === 1);

  const saved = store.rooms.get(room.id)!;
  assert.equal(JSON.stringify(saved).includes(key!), false);
  assert.equal(JSON.stringify(saved).includes(a.token as string), false);
  assert.equal(saved.game?.pot, game.pot);

  const recovered = new RoomManager("http://localhost:4173", store);
  await recovered.restore();
  const restored = recovered.get(room.id)!;
  assert.ok(restored);
  assert.deepEqual(recovered.bindHost(socket(), room.id, key), { ok: true });
  const reconnect = recovered.joinPlayer(socket(), room.id, "Alex", a.token);
  assert.equal(reconnect.ok, true);
  assert.equal(reconnect.seat, 0);
  assert.deepEqual(
    restored.game?.players.map((player) => player.stack),
    game.players.map((player) => player.stack),
  );
  assert.deepEqual(restored.game?.deck, game.deck);
  assert.deepEqual(
    restored.game?.players.map((player) => player.cards),
    game.players.map((player) => player.cards),
  );
  assert.ok(
    restored.game?.snapshot().players.every((player) => player.cards === null),
  );
  assert.equal(recovered.adminData().rooms[0].config.turnSeconds, 45);
  assert.equal(recovered.adminData().bans[0].value, "127.0.0.1");
});

test("a database outage does not stop in-memory play", async () => {
  const store = new MemoryStore();
  const earlier = new RoomManager("http://localhost:4173", store);
  const oldRoom = earlier.create();
  await waitFor(() => store.rooms.has(oldRoom.id));
  store.fail = true;
  const rooms = new RoomManager("http://localhost:4173", store);
  await rooms.restore();
  const room = rooms.create();
  const host = socket();
  assert.deepEqual(
    rooms.bindHost(
      host,
      room.id,
      new URL(rooms.tableUrl(room)).searchParams.get("key"),
    ),
    { ok: true },
  );
  assert.equal(rooms.joinPlayer(socket(), room.id, "Alex").ok, true);
  assert.equal(rooms.joinPlayer(socket(), room.id, "Sam").ok, true);
  assert.deepEqual(rooms.start(host), { ok: true });
  assert.ok(room.game);
  store.fail = false;
  rooms.send(room);
  await waitFor(() => store.rooms.get(room.id)?.game?.hand === 1, 6000);
  assert.equal(store.rooms.get(room.id)?.game?.players.length, 2);
  assert.ok(rooms.get(oldRoom.id));
});

test("quick play adds persistent bots that take legal turns without revealing cards", async () => {
  const store = new MemoryStore();
  const rooms = new RoomManager("http://localhost:4173", store);
  const human = socket();
  const joined = rooms.quickJoin(human, "Alex");
  assert.equal(joined.ok, true);
  if (!("code" in joined)) throw new Error("Quick join did not return a code");
  const room = rooms.get(joined.code)!;
  const bots = room.roster.filter((player) => player.bot);
  assert.ok(bots.length === 2 || bots.length === 3);
  assert.equal(room.roster.filter((player) => !player.bot).length, 1);
  const host = socket();
  rooms.bindHost(host, room.id, new URL(rooms.tableUrl(room)).searchParams.get("key"));
  assert.deepEqual(rooms.start(host), { ok: true });
  const game = room.game!;
  assert.ok(game.snapshot().players.every((player) => player.cards === null));
  assert.ok(
    game.snapshot(human.data.playerId).players.every((player) =>
      player.id === human.data.playerId ? player.cards?.length === 2 : player.cards === null,
    ),
  );
  if (game.players[game.turn]?.id === human.data.playerId)
    assert.deepEqual(rooms.act(human, "call", 0), { ok: true });
  const botTurn = game.players[game.turn]?.id;
  assert.ok(bots.some((bot) => bot.id === botTurn));
  const historyLength = game.history.length;
  await waitFor(() => game.history.length > historyLength, 4000);
  assert.equal(
    game.players.reduce((sum, player) => sum + player.stack, 0) + game.pot,
    room.roster.length * room.config.startingStack,
  );
  await waitFor(() => store.rooms.get(room.id)?.roster.some((player) => player.bot));
  const restored = new RoomManager("http://localhost:4173", store);
  await restored.restore();
  assert.equal(restored.get(room.id)?.roster.filter((player) => player.bot).length, bots.length);
  rooms.detach(human);
  assert.equal(room.autoTimer, null);
});

test("quick play chooses an available human table before a bot table", () => {
  const rooms = new RoomManager("http://localhost:4173");
  const botTable = rooms.quickJoin(socket(), "Alex");
  assert.ok("code" in botTable);
  const humanTable = rooms.create(true);
  assert.equal(rooms.joinPlayer(socket(), humanTable.id, "Sam").ok, true);
  const joined = rooms.quickJoin(socket(), "Kim");
  assert.equal("code" in joined && joined.code, humanTable.id);
});
