import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { Server } from "socket.io";
import QRCode from "qrcode";
import { RoomManager } from "./rooms.js";

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
const baseUrl = process.env.PUBLIC_BASE_URL || `http://${lan}:${PORT}`;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

let rooms: RoomManager;
const server = http.createServer(async (request, response) => {
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
rooms = new RoomManager(baseUrl);
io.on("connection", (socket) => {
  socket.on("host:watch", ({ code, key } = {}, ack = () => {}) =>
    ack(rooms.bindHost(socket, code, key)),
  );
  socket.on("player:join", ({ code, name, token } = {}, ack = () => {}) =>
    ack(rooms.joinPlayer(socket, code, name, token)),
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
