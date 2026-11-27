# Velvet Ace Live

A private, real time Texas Hold’em table for a TV and 2–6 phones. The TV shows the table and a QR code; each player sees private hole cards and betting controls on their phone. All chips are fictional.

## Run locally

Requires Node.js 22 or later. In the repository:

```bash
npm ci
npm start
```

Open the address printed by the server on the TV, then create a table. Players on the same Wi-Fi scan the QR code. If the detected LAN address is wrong, set `PUBLIC_BASE_URL` to the address the phones can reach. `PORT` defaults to `4173`.

For active development, use `npm run dev`. To verify changes, run `npm run build`, `npm test` and `npm run test:e2e`.

## Optional PostgreSQL persistence

Set `DATABASE_URL` to a PostgreSQL connection string before starting the server. The server creates `velvet_ace_rooms` and `velvet_ace_moderation` tables automatically and saves a private checkpoint after room and game changes. It restores rooms active within the last eight hours on startup, including chip stacks, reconnect identities, and hands in progress. Existing table and phone links continue to work after a restart. A recovered hand gives players up to one minute to reconnect before turn timeouts resume.

Without `DATABASE_URL`, rooms remain in memory. If PostgreSQL is unavailable, play continues in memory and the server retries saving the latest checkpoint every five seconds. A restart during an outage can recover only the last checkpoint that reached PostgreSQL. Use one server process for a given database; this implementation does not coordinate multiple game servers.

The database contains the full private game checkpoint, including hole cards and the remaining deck. Restrict access to it. Host keys and guest reconnect tokens are stored as hashes, while the original links and tokens stay with the host and players. Chat, online status, sockets, and timers are not saved.

## Render hosting

Deploy this repository as a **single-instance Node web service**. The included `render.yaml` uses `npm ci && npm run build`, starts `node dist/server/index.js`, and checks `/api/health`. For an existing Render service, use those same build and start commands. The server binds Render's `PORT` on `0.0.0.0` and uses `RENDER_EXTERNAL_URL` for QR and table links. Set `PUBLIC_BASE_URL` to your HTTPS custom domain if you use one.

Set `DATABASE_URL` as a secret on the Render web service to connect PostgreSQL. For Supabase, copy the **Session pooler** connection string from the project's Connect dialog (port 5432), add `?uselibpqcompat=true&sslmode=require`, and use that as `DATABASE_URL`. This requires encrypted transport with node-postgres; for certificate verification, use Supabase's CA certificate and `sslmode=verify-full` instead. The direct `db.<project>.supabase.co` address is IPv6-only unless the project has the IPv4 add-on, so it cannot be reached from Render by default. The Supabase URL, publishable key, secret key, and JavaScript SDK are not needed for this server-side connection. The database is optional, but without it every restart or idle spin-down loses rooms. Set a strong `ADMIN_PASSWORD` secret in Render to enable `/admin`; the username defaults to `admin` and can be changed with `ADMIN_USER`. The admin page uses HTTPS Basic authentication. Keep this password private.

The admin page shows tables, guests, stacks, last IP and browser details. It can pause play, lock new joins, toggle auto-deal, change turn seconds and the starting stack for fresh games, kick or ban a guest, ban an IP, and close a table. Room configuration and bans are saved with PostgreSQL when available. A guest ban blocks that reconnect identity; a person can create a new guest identity. IP bans are best effort because clients are behind Render's proxy and some players share an IP.

Render's Free web services can sleep after 15 minutes without inbound traffic, and Free PostgreSQL databases expire after 30 days. Use a persistent PostgreSQL plan if room recovery matters beyond that period. This game runs in one server process; do not enable horizontal scaling. A deploy interrupts live WebSocket connections, and clients reconnect to the saved room checkpoint. A database outage or an abrupt process stop can leave the latest in-memory action unsaved.

## Optional private hand insight

Set `VIP_FLOP_INSIGHT_ENABLED=true` on the server to show a private flop, turn and river hand insight to the guest named exactly `beladev`. It estimates the chance to win or tie at showdown against unknown hands; it never uses opponents' dealt cards or the actual remaining deck. Guest names are self-entered, so this is a trial flag rather than secure VIP authentication.

## Architecture

- `src/` — React, strict TypeScript, SCSS, TV and phone views.
- `shared/types.ts` — public game and room snapshots.
- `server/game.ts` and `server/cards.ts` — authoritative Hold’em rules, crypto shuffled deck and integer chip accounting.
- `server/rooms.ts` — private rooms, seats, reconnect tokens and turn deadlines.
- `server/index.ts` — HTTP, QR generation and Socket.IO transport.
- `public/assets/` — original generated casino, dealer and avatar artwork.

The browser and server ship from one repo. Their boundary makes a later mobile wrapper straightforward. Rooms and guest identities live in memory unless optional PostgreSQL persistence is configured. Public hosting uses guest identities and private room links; it is intended for small private games rather than open matchmaking.

## Scope

This release covers guest joining, QR invites, a six-seat private table, blinds, no limit betting, fold/check/call/bet/raise/all in, flop/turn/river, showdown, side pots, split pots, turn timeout and reconnect. The server automatically deals the first hand after two players connect and every following hand after a short showdown pause; if one player holds all the chips, it starts a fresh fictional-chip game. Players can choose a character, react or send a short table message, and keep their hole cards face down until they press and hold to peek. A personal setting can always reveal them. Uncontested winners can show or muck, while contested showdown cards reveal automatically. The table has card, chip, turn, all-in and win motion with optional synthesized sound. The supplied Zynga product specification guides table language and flow. Its wallet, tournaments, progression, shop and matchmaking proposals are not implemented.

See `AGENTS.md` and `.agents/skills/velvet-ace-development/SKILL.md` for project coding rules.
