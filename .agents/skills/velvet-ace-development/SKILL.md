---
name: velvet-ace-development
description: Implement or review Velvet Ace Live poker features, table UI, realtime transport, or related TypeScript and SCSS code in this repository.
---

# Velvet Ace development

Start with `AGENTS.md`, then inspect the affected client, server and shared types. Treat the provided Zynga PRD as a reference for terminology and the basic hand flow. Distinguish its observed behavior from proposals; do not turn its larger feature inventory into implied scope.

Use strict TypeScript and SCSS. Put hand rules and chip transitions in `server/game.ts`, room and session behavior in `server/rooms.ts`, transport in `server/index.ts`, shared public contracts in `shared/types.ts`, and presentation in `src/`. UI actions must reflect legal actions sent by the server. Keep private hole cards visible only to their owner or at permitted showdown.

For table design, favor a strong central felt, rail, dealer and seat hierarchy like the supplied references, but use original assets and the Velvet Ace identity. Maintain readable amounts, state labels and touch targets. Respect sound toggle, safe areas and reduced motion.

Before handing off, run the build and relevant game tests. Verify the TV and phone views visually if the local browser is reachable. Explain remaining limits such as in-memory rooms and unverified network access.
