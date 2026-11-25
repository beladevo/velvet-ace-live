# Velvet Ace Live

A local network Texas Hold'em game for a TV and 2–6 real players. The TV owns a room and shows the table and joining QR code. Each player scans the code, chooses a name and plays privately from their phone. The server owns the deck, turn order, betting and payouts; private cards are sent only to the matching player.

## Run

```bash
npm install
npm start
```

Open the printed **table URL** on the TV or computer. Phones must be on the same network and able to reach the server's IP and port. Scan the QR code shown on the TV. Two players are enough to start; up to six can join. Set `PORT` and optionally `PUBLIC_BASE_URL` when the detected LAN address is not reachable from phones.

Example: `PUBLIC_BASE_URL=http://192.168.1.25:4173 npm start`.

## Architecture

`server/game.js` contains the poker state machine and hand evaluation. `server/rooms.js` owns room membership and sessions. `server/index.js` provides HTTP and Socket.IO transport. `public/app.js` renders separate TV and phone views. The design uses custom CSS and inline SVG, with no frontend build step. The server process is the current source of truth; rooms live in memory and disappear on restart. This separation makes a mobile wrapper or hosted deployment possible later.

## Rules and safety

No-limit Texas Hold'em with 10/20 blinds, 1,500 fictional starting chips, side pots, split pots, all-ins and 35-second turns. Disconnected players are checked or folded when their turn expires. No accounts, payment or real money. For internet exposure beyond a trusted local network, add TLS, persistent storage, identity and rate limiting before deployment.
