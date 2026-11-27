import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { RoomManager } from "./rooms.js";
import { PostgresRoomStore } from "./persistence.js";
import { handleAdmin } from "./admin.js";
import { clientIp } from "./client-ip.js";

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const root = resolve("dist/client");
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter(
    (item) => item !== undefined && item.family === "IPv4" && !item.internal,
  );
const lan =
  addresses.find(
    (item) =>
      item && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address),
  )?.address ||
  addresses[0]?.address ||
  "127.0.0.1";
const renderUrl = process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, "");
const baseUrl =
  process.env.PUBLIC_BASE_URL ||
  (renderUrl === "https://poker-q84f.onrender.com"
    ? "https://poker.torly.co"
    : renderUrl) ||
  `http://${lan}:${PORT}`;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

let rooms: RoomManager;
const limits = new Map<string, { count: number; until: number }>();
function allowed(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const previous = limits.get(key);
  const next =
    previous && previous.until > now
      ? { count: previous.count + 1, until: previous.until }
      : { count: 1, until: now + windowMs };
  limits.set(key, next);
  if (limits.size > 10_000)
    for (const [id, entry] of limits) if (entry.until <= now) limits.delete(id);
  while (limits.size > 10_000) limits.delete(limits.keys().next().value!);
  return next.count <= max;
}
const server = http.createServer(async (request, response) => {
  if (await handleAdmin(request, response, rooms)) return;
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host || "localhost"}`,
  );
  const sendJson = (status: number, value: unknown) => {
    response.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(value));
  };
  if (url.pathname === "/api/health") return sendJson(200, { ok: true });
  if (url.pathname === "/api/rooms" && request.method === "POST") {
    const ip = clientIp(request.headers, request.socket.remoteAddress);
    if (!allowed(`create:${ip}`, 10, 60 * 60_000))
      return sendJson(429, { error: "Too many tables created. Try later." });
    if (rooms.count() >= 200)
      return sendJson(503, { error: "Table capacity reached." });
    const room = rooms.create();
    return sendJson(201, {
      code: room.id,
      tableUrl: rooms.tableUrl(room),
      joinUrl: rooms.joinUrl(room),
    });
  }
  const qrMatch = /^\/api\/rooms\/([A-Z2-9]{6})\/qr\.svg$/.exec(url.pathname);
  if (qrMatch) {
    const room = rooms.get(qrMatch[1]);
    if (!room) return sendJson(404, { error: "Room not found" });
    const svg = await QRCode.toString(rooms.joinUrl(room), {
      type: "svg",
      margin: 1,
      width: 280,
      color: { dark: "#172823", light: "#fffaf0" },
    });
    response.writeHead(200, {
      "content-type": "image/svg+xml",
      "cache-control": "no-store",
    });
    response.end(svg);
    return;
  }
  try {
    const relative = url.pathname === "/" ? "/index.html" : url.pathname;
    const path = resolve(root, `.${relative}`);
    if (!path.startsWith(root)) throw new Error("Invalid path");
    const body = await readFile(path);
    response.writeHead(200, {
      "content-type": types[extname(path)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    sendJson(404, { error: "Not found" });
  }
});

const io = new Server(server, {
  serveClient: true,
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 1e5,
});
rooms = new RoomManager(
  baseUrl,
  process.env.DATABASE_URL
    ? new PostgresRoomStore(process.env.DATABASE_URL)
    : undefined,
);
await rooms.restore();
io.on("connection", (socket) => {
  socket.on("host:watch", ({ code, key } = {}, ack = () => {}) =>
    ack(rooms.bindHost(socket, code, key)),
  );
  socket.on(
    "player:join",
    ({ code, name, token, avatar } = {}, ack = () => {}) => {
      const ip = clientIp(socket.handshake.headers, socket.handshake.address);
      if (!allowed(`join:${ip}`, 60, 10 * 60_000))
        return ack({ error: "Too many join attempts. Try later." });
      ack(rooms.joinPlayer(socket, code, name, token, avatar));
    },
  );
  socket.on("player:avatar", ({ avatar } = {}, ack = () => {}) =>
    ack(rooms.setAvatar(socket, avatar)),
  );
  socket.on("player:show", (_payload = {}, ack = () => {}) =>
    ack(rooms.show(socket)),
  );
  socket.on("player:muck", (_payload = {}, ack = () => {}) =>
    ack(rooms.muck(socket)),
  );
  socket.on("player:social", ({ kind, content } = {}, ack = () => {}) =>
    ack(rooms.social(socket, kind, content)),
  );
  socket.on("player:action", ({ type, total } = {}, ack = () => {}) =>
    ack(rooms.act(socket, type, total)),
  );
  socket.on("host:deal", ({ fresh } = {}, ack = () => {}) =>
    ack(rooms.start(socket, !!fresh)),
  );
  socket.on("disconnect", () => rooms.detach(socket));
});
setInterval(() => rooms.cleanup(), 60 * 60 * 1000).unref();
server.listen(PORT, HOST, () => {
  console.log(`\nVELVET ACE LIVE`);
  console.log(`Open on TV: ${baseUrl}`);
  console.log(
    `Phones must be on the same Wi-Fi. Set PUBLIC_BASE_URL if this address is not reachable.\n`,
  );
});
process.once("SIGTERM", () => {
  const forceExit = setTimeout(() => process.exit(0), 6000);
  io.close(() => {
    void rooms.drain(5000).finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
});
