import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clientIp } from "./client-ip.js";
import type { RoomManager } from "./rooms.js";

const password = process.env.ADMIN_PASSWORD;
const username = process.env.ADMIN_USER || "admin";
const attempts = new Map<string, { count: number; until: number }>();
const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const equal = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const csrf = password
  ? createHmac("sha256", password).update("velvet-ace-admin-form").digest("hex")
  : "";
const field = (name: string, value: unknown) =>
  `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
const date = (value: number) =>
  value
    ? new Date(value).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "—";

function auth(request: IncomingMessage, response: ServerResponse): boolean {
  const ip = clientIp(request.headers, request.socket.remoteAddress);
  const failed = attempts.get(ip);
  if (failed && failed.count >= 10 && failed.until > Date.now()) {
    response.writeHead(429, { "retry-after": "900" }).end("Too many attempts");
    return false;
  }
  const header = request.headers.authorization ?? "";
  let supplied = "";
  if (header.startsWith("Basic ") && header.length < 2048) {
    try {
      supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
      supplied = "";
    }
  }
  if (password && equal(supplied, `${username}:${password}`)) {
    attempts.delete(ip);
    return true;
  }
  attempts.set(ip, {
    count: (failed?.until && failed.until > Date.now() ? failed.count : 0) + 1,
    until: Date.now() + 15 * 60_000,
  });
  if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value!);
  response
    .writeHead(401, {
      "www-authenticate": 'Basic realm="Velvet Ace Admin", charset="UTF-8"',
    })
    .end("Sign in required");
  return false;
}

function render(rooms: RoomManager): string {
  const data = rooms.adminData();
  const action = (name: string, body: string, label: string, extra = "") =>
    `<form action="/admin/action" method="post">${field("csrf", csrf)}${field("action", name)}${body}<button type="submit" ${extra}>${label}</button></form>`;
  const roomRows = data.rooms
    .map(
      (room) =>
        `<tr><th scope="row"><a href="#room-${escapeHtml(room.code)}">${escapeHtml(room.code)}</a></th><td>${room.players.filter((p) => p.connected).length}/${room.players.length}</td><td>${escapeHtml(room.phase)} · hand ${room.hand}</td><td>${room.pot}</td><td>${room.config.paused ? "Paused" : "Live"}${room.config.locked ? " · Locked" : ""}</td></tr>`,
    )
    .join("");
  const detail = data.rooms
    .map((room) => {
      const guests = room.players
        .map(
          (player) =>
            `<tr><th scope="row">${escapeHtml(player.name)}</th><td>${player.seat + 1}</td><td>${player.stack ?? "—"}</td><td>${player.connected ? "Online" : "Offline"}</td><td><code>${escapeHtml(player.ip)}</code></td><td title="${escapeHtml(player.userAgent)}">${escapeHtml(player.userAgent || "—")}</td><td>${date(player.firstSeenAt)}</td><td>${date(player.lastSeenAt)}</td><td class="actions">${action("kick", field("code", room.code) + field("playerId", player.id), "Kick")}${action("ban-guest", field("code", room.code) + field("playerId", player.id), "Ban guest")}${player.ip !== "unknown" ? action("ban-ip", field("ip", player.ip), "Ban IP") : ""}</td></tr>`,
        )
        .join("");
      const config = room.config;
      return `<section class="panel room" id="room-${escapeHtml(room.code)}">
      <div class="panel-heading"><div><p class="eyebrow">TABLE</p><h2>${escapeHtml(room.code)}</h2><p>Opened ${date(room.createdAt)} · ${room.phase} · pot ${room.pot}</p></div>
      ${action("close", field("code", room.code) + '<label class="confirm"><input type="checkbox" name="confirm" value="close" required> Confirm close</label>', "Close table", 'class="danger"')}</div>
      <div class="table-wrap" role="region" aria-label="Guests at table ${escapeHtml(room.code)}" tabindex="0">
      <table><thead><tr><th>Guest</th><th>Seat</th><th>Stack</th><th>Status</th><th>Last IP</th><th>Browser</th><th>First seen</th><th>Last seen</th><th>Controls</th></tr></thead><tbody>${guests || '<tr><td colspan="9">No guests yet.</td></tr>'}</tbody></table></div>
      <form class="config" action="/admin/action" method="post" aria-label="Settings for table ${escapeHtml(room.code)}">
        ${field("csrf", csrf)}${field("action", "config")}${field("code", room.code)}
        <label><input type="checkbox" name="paused" ${config.paused ? "checked" : ""}> Pause play</label>
        <label><input type="checkbox" name="locked" ${config.locked ? "checked" : ""}> Lock new guests</label>
        <label><input type="checkbox" name="autoDeal" ${config.autoDeal ? "checked" : ""}> Auto deal</label>
        <label>Turn time (seconds)<input type="number" name="turnSeconds" min="15" max="120" required value="${config.turnSeconds}"></label>
        <label>Starting stack for fresh games<input type="number" name="startingStack" min="500" max="10000" required value="${config.startingStack}"></label>
        <button type="submit">Save settings</button>
      </form>
    </section>`;
    })
    .join("");
  const banRows = data.bans
    .map(
      (ban) =>
        `<tr><th scope="row">${escapeHtml(ban.kind)}</th><td><code>${escapeHtml(ban.kind === "guest" ? `${ban.label ?? "Guest"} (${ban.value.slice(0, 8)}…)` : ban.value)}</code></td><td>${escapeHtml(ban.reason || "—")}</td><td>${date(ban.createdAt)}</td><td>${action("unban", field("kind", ban.kind) + field("value", ban.value), "Remove ban")}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Velvet Ace Admin</title><link rel="stylesheet" href="/admin.css"></head>
  <body><main class="admin"><header><div><p class="eyebrow">VELVET ACE</p><h1>Table control</h1></div><div class="header-meta"><span>Database: ${escapeHtml(data.database)}</span><a href="/">Game home</a></div></header>
  <p class="notice" role="status">Changes apply immediately. Starting stack affects fresh games only. IP bans rely on the address supplied by the hosting proxy.</p>
  <section class="panel"><h2>Tables <span>${data.rooms.length}</span></h2><div class="table-wrap" role="region" aria-label="Table overview" tabindex="0"><table><thead><tr><th>Code</th><th>Guests</th><th>Hand</th><th>Pot</th><th>Status</th></tr></thead><tbody>${roomRows || '<tr><td colspan="5">No tables yet.</td></tr>'}</tbody></table></div></section>
  ${detail}
  <section class="panel"><h2>Bans <span>${data.bans.length}</span></h2>
    <form class="ban-form" action="/admin/action" method="post" aria-label="Ban an IP address">${field("csrf", csrf)}${field("action", "ban-ip")}
    <label>IP address<input name="ip" required autocomplete="off" spellcheck="false"></label><label>Reason<input name="reason" maxlength="120"></label><button type="submit">Ban IP</button></form>
    <div class="table-wrap" role="region" aria-label="Active bans" tabindex="0"><table><thead><tr><th>Type</th><th>Value</th><th>Reason</th><th>Added</th><th>Control</th></tr></thead><tbody>${banRows || '<tr><td colspan="5">No bans.</td></tr>'}</tbody></table></div>
  </section></main></body></html>`;
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams> {
  if (
    request.headers["content-type"]?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw new Error("Invalid form");
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 8192) throw new Error("Form is too large");
  }
  return new URLSearchParams(body);
}

export async function handleAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  rooms: RoomManager,
): Promise<boolean> {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path !== "/admin" && path !== "/admin/action") return false;
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader(
    "content-security-policy",
    "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  );
  if (!password) {
    response.writeHead(404).end("Admin panel disabled");
    return true;
  }
  if (!auth(request, response)) return true;
  if (path === "/admin" && request.method === "GET") {
    response
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(render(rooms));
    return true;
  }
  if (path !== "/admin/action" || request.method !== "POST") {
    response
      .writeHead(405, { allow: path === "/admin" ? "GET" : "POST" })
      .end();
    return true;
  }
  try {
    const form = await readForm(request);
    if (!equal(form.get("csrf") ?? "", csrf)) throw new Error("Invalid form");
    const action = form.get("action");
    const code = form.get("code") ?? "";
    const reason = form.get("reason") ?? "";
    const value = form.get("value") ?? "";
    const playerId = form.get("playerId") ?? "";
    const success =
      action === "config"
        ? rooms.adminSetConfig(code, {
            paused: form.has("paused"),
            locked: form.has("locked"),
            autoDeal: form.has("autoDeal"),
            turnSeconds: Number(form.get("turnSeconds")),
            startingStack: Number(form.get("startingStack")),
          })
        : action === "kick"
          ? rooms.adminKick(code, playerId)
          : action === "ban-guest"
            ? rooms.adminBanGuest(code, playerId, reason)
            : action === "ban-ip"
              ? rooms.adminBanIp(form.get("ip") ?? "", reason)
              : action === "unban"
                ? rooms.adminUnban(form.get("kind") ?? "", value)
                : action === "close" && form.get("confirm") === "close"
                  ? rooms.adminClose(code)
                  : false;
    if (!success) throw new Error("Invalid action");
    response
      .writeHead(303, {
        location:
          code && action !== "close"
            ? `/admin#room-${encodeURIComponent(code)}`
            : "/admin",
      })
      .end();
  } catch {
    response.writeHead(400).end("Invalid admin request");
  }
  return true;
}
