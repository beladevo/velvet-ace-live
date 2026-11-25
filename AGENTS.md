# Velvet Ace Live — working rules

This repository is a local first, real time, private Texas Hold’em game. Keep one repository with a browser client and an authoritative Node server. Use the supplied `zynga-poker-spec.zip` as product reference for the basic table experience. Its proposed larger systems are outside the current scope.

## Code

- Write application code in strict TypeScript and styles in SCSS. Keep shared wire types in `shared/`.
- Keep poker rules, random dealing, chip accounting, deadlines and legal action validation on the server. The browser renders server snapshots and sends player intent only.
- Keep TV/table and phone/player flows distinct while reusing card, seat and avatar components. Aim for a later mobile wrapper without assuming it exists today.
- Prefer small modules with clear ownership over generic frameworks. Follow the repository's existing names and contracts when changing behavior.
- New visuals should evoke the supplied casino table references using original assets and custom styling. Do not ship screenshots, Zynga marks or copied art.
- Poker terms should match the product reference where they describe implemented behavior: blinds, pot, stack, dealer, preflop, flop, turn, river, showdown, fold, check, call, bet, raise and all in.
- Keep controls legible on TV and usable on touch screens, with sound optional and reduced motion respected.

## Product boundaries

- The current mode is a private 2–6 player no limit Hold’em table with fictional chips, QR joining and guest names.
- Do not imply the app has a wallet, cash out, tournament, XP, store, persistent account or internet matchmaking until it actually does.
- Keep the room URL and host key private; never expose hole cards in the TV or another player's snapshot.

## Verification

- Run `npm run build`, `npm test` and `npm run test:e2e` after relevant changes. For visual changes, inspect the TV and phone layouts when a browser preview is reachable.
- Check chip conservation, legal turns, private cards, reconnect behavior and QR join flow when changing game or transport code.
- Record any unverified visual or network behavior plainly in the handoff.

Read [the local coding skill](.agents/skills/velvet-ace-development/SKILL.md) when implementing or reviewing this project.
