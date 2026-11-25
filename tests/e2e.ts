import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { io } from "socket.io-client";

const port = 43000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["dist/server/index.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    PUBLIC_BASE_URL: base,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const sockets = [];
const state = new Map();
const waitFor = async (predicate, label, timeout = 5000) => {
  const until = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
const connect = async (name) => {
  const socket = io(base, { transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  socket.on("room:state", (value) => state.set(name, value));
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
};

try {
  await waitFor(async () => {
    try {
      return (await fetch(`${base}/api/health`)).ok;
    } catch {
      return false;
    }
  }, "server");
  const response = await fetch(`${base}/api/rooms`, { method: "POST" });
  assert.equal(response.status, 201);
  const room = await response.json();
  assert.match(room.joinUrl, new RegExp(`join=${room.code}`));
  const qr = await fetch(`${base}/api/rooms/${room.code}/qr.svg`);
  assert.equal(qr.status, 200);
  assert.match(await qr.text(), /<svg/);
  const host = await connect("host");
  assert.deepEqual(
    await host.emitWithAck("host:watch", {
      code: room.code,
      key: new URL(room.tableUrl).searchParams.get("key"),
    }),
    { ok: true },
  );
  const alex = await connect("alex");
  const sam = await connect("sam");
  const a = await alex.emitWithAck("player:join", {
    code: room.code,
    name: "Alex",
    avatar: 4,
  });
  const b = await sam.emitWithAck("player:join", {
    code: room.code,
    name: "Sam",
    avatar: 2,
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  await waitFor(
    () => state.get("host")?.roster.length === 2,
    "two joined players",
  );
  assert.equal(state.get("host").roster[0].avatar, 4);
  assert.deepEqual(await alex.emitWithAck("player:avatar", { avatar: 5 }), {
    ok: true,
  });
  await waitFor(
    () => state.get("host")?.roster[0].avatar === 5,
    "avatar update",
  );
  assert.ok((await alex.emitWithAck("player:avatar", { avatar: 8 })).error);
  assert.deepEqual(
    await alex.emitWithAck("player:social", {
      kind: "chat",
      content: "Good luck!",
    }),
    { ok: true },
  );
  assert.deepEqual(
    await sam.emitWithAck("player:social", { kind: "reaction", content: "👏" }),
    { ok: true },
  );
  await waitFor(
    () => state.get("host")?.social.length === 2,
    "table reactions",
  );
  assert.equal(state.get("host").social[0].content, "Good luck!");
  assert.ok(
    (await alex.emitWithAck("player:social", { kind: "chat", content: "spam" }))
      .error,
  );
  assert.ok(
    (await host.emitWithAck("player:social", { kind: "chat", content: "host" }))
      .error,
  );
  await waitFor(
    () => state.get("host")?.game?.phase === "preflop",
    "first hand dealt automatically",
  );
  const table = state.get("host").game;
  const aView = state.get("alex").game;
  const bView = state.get("sam").game;
  assert.ok(
    table.players.every((player) => player.cards === null),
    "TV must not receive private cards",
  );
  assert.equal(aView.players[0].cards.length, 2);
  assert.equal(aView.players[1].cards, null);
  assert.equal(bView.players[0].cards, null);
  assert.equal(bView.players[1].cards.length, 2);
  assert.deepEqual(await sam.emitWithAck("player:action", { type: "fold" }), {
    error: "That action is not available now.",
  });
  assert.deepEqual(await alex.emitWithAck("player:action", { type: "call" }), {
    ok: true,
  });
  await waitFor(() => state.get("host")?.game?.turn === 1, "next player turn");
  const kim = await connect("kim");
  assert.equal(
    (await kim.emitWithAck("player:join", { code: room.code, name: "Kim" })).ok,
    true,
  );
  await waitFor(() => state.get("host")?.roster.length === 3, "late join");
  assert.equal(
    state.get("kim").game.players.some((player) => player.name === "Kim"),
    false,
  );
  assert.deepEqual(await sam.emitWithAck("player:action", { type: "fold" }), {
    ok: true,
  });
  await waitFor(
    () => state.get("host")?.game?.phase === "showdown",
    "showdown",
  );
  assert.equal(state.get("host").game.players[0].cards, null);
  assert.equal(
    state.get("host").game.players[1].cards,
    null,
    "uncontested winner should be mucked by default",
  );
  assert.equal(state.get("alex").game.canShow, true);
  assert.ok((await sam.emitWithAck("player:show", {})).error);
  assert.deepEqual(await alex.emitWithAck("player:show", {}), { ok: true });
  await waitFor(
    () => state.get("host")?.game?.players[0].cards?.length === 2,
    "winner chose Show",
  );
  assert.ok((await alex.emitWithAck("player:muck", {})).error);
  assert.ok(state.get("host").autoDealAt > Date.now());
  await waitFor(
    () =>
      state.get("host")?.game?.hand === 2 &&
      state.get("host")?.game?.players.length === 3,
    "next hand dealt automatically with late player",
    10000,
  );
  const nextHand = state.get("host").game;
  assert.ok(nextHand.players.every((player) => player.cards === null));
  assert.equal(state.get("host").autoDealAt, null);
  assert.equal(
    nextHand.players.reduce((sum, player) => sum + player.stack, 0) +
      nextHand.pot,
    4500,
  );
  console.log(
    "E2E passed: QR, real-time joins, private cards, turn enforcement, automatic hands and late seating.",
  );
} finally {
  sockets.forEach((socket) => socket.disconnect());
  child.kill();
}
