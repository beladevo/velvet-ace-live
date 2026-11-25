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

## Architecture

- `src/` — React, strict TypeScript, SCSS, TV and phone views.
- `shared/types.ts` — public game and room snapshots.
- `server/game.ts` and `server/cards.ts` — authoritative Hold’em rules, crypto shuffled deck and integer chip accounting.
- `server/rooms.ts` — private rooms, seats, reconnect tokens and turn deadlines.
- `server/index.ts` — HTTP, QR generation and Socket.IO transport.
- `public/assets/` — original generated casino, dealer and avatar artwork.

The browser and server ship from one repo. Their boundary makes a later mobile wrapper straightforward. Rooms and guest identities currently live in memory and disappear when the server restarts. This is a local network game; hosting it on the public internet needs TLS, persistent identities and abuse controls.

## Scope

This release covers guest joining, QR invites, a six-seat private table, blinds, no limit betting, fold/check/call/bet/raise/all in, flop/turn/river, showdown, side pots, split pots, turn timeout and reconnect. Players can choose a character, react or send a short table message, and keep their hole cards face down until they press and hold to peek. A personal setting can always reveal them. Uncontested winners can show or muck, while contested showdown cards reveal automatically. The table has card, chip, turn, all-in and win motion with optional synthesized sound. The supplied Zynga product specification guides table language and flow. Its wallet, tournaments, progression, shop and matchmaking proposals are not implemented.

See `AGENTS.md` and `.agents/skills/velvet-ace-development/SKILL.md` for project coding rules.
