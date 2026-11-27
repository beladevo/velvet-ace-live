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
    RENDER_EXTERNAL_URL: "https://poker-q84f.onrender.com",
    ADMIN_PASSWORD: "e2e-admin-password",
    PUBLIC_BASE_URL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverError = "";
child.stderr.on("data", (chunk) => {
  serverError += String(chunk);
});
const sockets = [];
const state = new Map();
const waitFor = async (predicate, label, timeout = 5000) => {
  const until = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() > until)
      throw new Error(`Timed out waiting for ${label}${serverError ? `: ${serverError}` : ""}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};
const connect = async (name, extraHeaders) => {
  const socket = io(base, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders,
  });
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
  assert.equal(new URL(room.joinUrl).origin, "https://poker.torly.co");
  assert.equal(new URL(room.tableUrl).origin, "https://poker.torly.co");
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
    name: "beladev",
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
  assert.equal(state.get("host").insight, null);
  assert.equal(state.get("alex").insight, null);
  assert.equal(state.get("sam").insight, null);
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
  assert.deepEqual(await sam.emitWithAck("player:action", { type: "check" }), {
    ok: true,
  });
  await waitFor(
    () => state.get("alex")?.game?.phase === "flop",
    "flop insight",
  );
  assert.ok(state.get("alex").insight);
  assert.equal(state.get("alex").insight.opponents, 1);
  assert.equal(state.get("host").insight, null);
  assert.equal(state.get("sam").insight, null);
  assert.equal(state.get("kim").insight, null);
  const reconnected = await connect("reconnected");
  assert.equal(
    (await reconnected.emitWithAck("player:join", {
      code: room.code,
      name: "Someone else",
      token: a.token,
    })).ok,
    true,
  );
  await waitFor(() => state.get("reconnected")?.insight, "VIP reconnect");
  assert.deepEqual(state.get("reconnected").insight, state.get("alex").insight);
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
  const unsafe = await connect("unsafe", {
    "user-agent": "<script>alert(1)</script>",
  });
  assert.equal(
    (
      await unsafe.emitWithAck("player:join", {
        code: room.code,
        name: "Visitor",
      })
    ).ok,
    true,
  );
  const deniedAdmin = await fetch(`${base}/admin`);
  assert.equal(deniedAdmin.status, 401);
  const authorization = `Basic ${Buffer.from("admin:e2e-admin-password").toString("base64")}`;
  const adminPage = await fetch(`${base}/admin`, {
    headers: { authorization },
  });
  assert.equal(adminPage.status, 200);
  const adminHtml = await adminPage.text();
  assert.match(adminHtml, new RegExp(room.code));
  assert.match(adminHtml, /beladev/);
  assert.match(adminHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(adminHtml.includes("<script>alert(1)</script>"), false);
  const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(adminHtml)?.[1];
  assert.ok(csrf);
  const adminAction = (fields) =>
    fetch(`${base}/admin/action`, {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf, ...fields }),
    });
  assert.equal(
    (
      await fetch(`${base}/admin/action`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          action: "close",
          code: room.code,
          confirm: "close",
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await adminAction({
        action: "config",
        code: room.code,
        paused: "on",
        autoDeal: "on",
        turnSeconds: "45",
        startingStack: "2000",
      })
    ).status,
    303,
  );
  await waitFor(() => state.get("host")?.paused === true, "admin pause");
  assert.equal(state.get("host").startingStack, 2000);
  assert.equal(state.get("host").game.legal, null);
  assert.deepEqual(await host.emitWithAck("host:deal", {}), {
    error: "This table is paused.",
  });
  const samId = state
    .get("host")
    .roster.find((player) => player.name === "Sam").id;
  assert.equal(
    (
      await adminAction({
        action: "ban-guest",
        code: room.code,
        playerId: samId,
      })
    ).status,
    303,
  );
  const bannedGuest = await connect("banned-guest");
  assert.ok(
    (
      await bannedGuest.emitWithAck("player:join", {
        code: room.code,
        name: "Sam",
        token: b.token,
      })
    ).error,
  );
  assert.equal(
    (await adminAction({ action: "ban-ip", ip: "127.0.0.1" })).status,
    303,
  );
  const bannedIp = await connect("banned-ip");
  assert.ok(
    (
      await bannedIp.emitWithAck("player:join", {
        code: room.code,
        name: "Pat",
      })
    ).error,
  );
  assert.equal(
    (await adminAction({ action: "unban", kind: "ip", value: "127.0.0.1" }))
      .status,
    303,
  );
  assert.equal(
    (await adminAction({ action: "close", code: room.code, confirm: "close" }))
      .status,
    303,
  );
  assert.equal(
    (await fetch(`${base}/api/rooms/${room.code}/qr.svg`)).status,
    404,
  );
  console.log(
    "E2E passed: game flow, private cards and insight, admin access, controls and bans.",
  );
} finally {
  sockets.forEach((socket) => socket.disconnect());
  child.kill();
}
