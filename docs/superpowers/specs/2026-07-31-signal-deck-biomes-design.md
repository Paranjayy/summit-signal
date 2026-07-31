# Signal Deck + Biome Route Design

## Intent

Summit Signal should feel like a run-based climbing game with a recognizable world and meaningful decisions. The next layer combines a local, run-only modifier deck with authored biome pockets. Movement remains the primary skill; the deck adds route planning and the biomes add memory, atmosphere, and landmarks.

## Player loop

1. Start a contract and climb through the current platform route.
2. On a checkpoint, briefly pause input and present three randomly selected modifier cards.
3. Choose one card, resume immediately, and show the active effect in the HUD.
4. Use the effect to route through the next biome pocket, collect shards, and reach the next checkpoint.
5. Stack up to three cards per run. Cards are discarded on reset/retry so every attempt is a fresh build.

## Card system

Cards are data objects with an id, title, short description, positive effect, cost, and accent color. The first slice ships five cards:

- `GHOST STEP`: one additional air correction per jump; costs slightly lower horizontal steering.
- `REDLINE`: movement speed increases; crosswind increases by the same percentage.
- `MAGNET`: shard pickup radius increases; shard captures are worth no extra score yet.
- `ANCHOR`: the next fall returns to the latest checkpoint without incrementing the retry counter.
- `OVERCHARGE`: Signal Burst cooldown is shorter; burst vertical lift is reduced.

The selection modal must be keyboard-friendly (1/2/3 and mouse), pause only gameplay, and never cover the route progress or core telemetry for longer than necessary. A small active-card rail shows title, icon-like initial, and remaining one-shot charges.

## Biome pockets

The existing procedural route remains the source of truth for collision. A biome is a visual layer keyed by height bands and does not add a second physics system.

- **Rust Yard** (start through ~25m): warm industrial palette, scaffold silhouettes, cable clusters, orange signal lights.
- **Neon Underpass** (~25m through ~60m): cooler blue-violet fog, emissive guide strips, dark tower shells, pulsing gate rings.
- **Cloud Cathedral** (~60m through ~90m): pale sky, larger cloud forms, floating window frames, quieter contrast around the route.
- **Signal Core** (final ~10m): high-contrast red/cream lighting, denser shard glow, summit landmark.

Biome changes are based on player altitude and apply to the canvas palette, backdrop materials, and a small HUD location tag. They must remain legible under all three run contracts.

## State and boundaries

Run-local state lives in `App`: active cards, pending card choice, and selected biome tag. `Player` receives a compact `RunModifiers` object and uses it only for movement, burst, pickup radius, and checkpoint behavior. `World` receives the biome tag and renders the visual layer. No persistent service is introduced.

## Failure handling and accessibility

If the card choice is not made, gameplay remains paused. Escape chooses the first card and resumes, preventing a soft lock. Effects are shown in plain language, with color never being the only indicator. Reset clears the deck and pending choice.

## Verification

- Unit-like pure helpers should cover card selection and biome mapping where practical.
- Browser smoke test: choose a non-default card, verify the active-card rail, reach a checkpoint, and verify the biome tag changes.
- Regression smoke test: mouse look, WASD, jump, burst, checkpoint return, pause/resume, finish panel.
- Required gates: `npm run lint`, `npm run build`, production Vercel deployment reports Ready.
