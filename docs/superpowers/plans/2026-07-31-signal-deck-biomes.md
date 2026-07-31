# Signal Deck + Biome Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add run-local checkpoint cards and readable biome transitions without introducing a backend or changing the core collision route.

**Architecture:** Keep pure card definitions and biome mapping in `src/gameData.ts`; `App` owns run-local card state and pauses gameplay for card selection; `Player` consumes a compact `RunModifiers` object; `World` derives visual palette and backdrop dressing from altitude biome. Existing `main.tsx` remains the integration boundary for this small prototype.

**Tech Stack:** React, TypeScript, React Three Fiber, Drei, CSS, Vite.

---

### Task 1: Extract pure card and biome data

**Files:**
- Create: `src/gameData.ts`
- Modify: `src/main.tsx:1-12`

- [x] **Step 1: Add typed card and biome definitions**

Create `RunModifiers`, `SignalCard`, `BiomeId`, `CARD_POOL`, `getBiome`, and `getModeLabel`. `getBiome(height, courseHeight)` returns Rust Yard, Neon Underpass, Cloud Cathedral, or Signal Core using normalized height bands. `CARD_POOL` contains the five cards in the design spec and each card has explicit numeric modifier fields.

- [x] **Step 2: Import the definitions from `main.tsx`**

Replace local `RunMode` declaration with imports from `./gameData` and remove duplicate labels/constants.

- [x] **Step 3: Run the type checker**

Run `npm run build`; expected result is a successful build before behavior is wired.

- [x] **Step 4: Commit**

```bash
git add src/gameData.ts src/main.tsx
git commit -m "refactor: centralize route game data"
```

### Task 2: Add checkpoint card choice UI and run state

**Files:**
- Modify: `src/main.tsx:231-300`
- Modify: `src/styles.css`

- [x] **Step 1: Add run-local state**

Add `activeCards`, `pendingCards`, `cardOpen`, and `modifiers` state in `App`. On `onCheckpoint`, select three distinct cards from `CARD_POOL` with a deterministic rotating index, set `pendingCards`, and pause `running`. On card selection, append the card, merge its modifier fields, clear pending state, and resume.

- [x] **Step 2: Render keyboard-accessible card choice**

Render a `section` with `role="dialog"`, three buttons named `CARD 1`, `CARD 2`, and `CARD 3`, and an Escape handler that chooses card one. The dialog shows title, upside, cost, and `1 / 2 / 3` hints. Render an active-card rail while running.

- [x] **Step 3: Add visual treatment**

Add `.card-dialog`, `.card-options`, `.route-card`, `.active-cards`, and responsive rules. Cards must be readable over the canvas and use accent borders rather than color alone.

- [x] **Step 4: Run lint and build**

Run `npm run lint && npm run build`; expected result is clean lint and a successful Vite build.

- [x] **Step 5: Commit**

```bash
git add src/main.tsx src/styles.css
git commit -m "feat: add checkpoint signal deck"
```

### Task 3: Wire movement modifiers and biome presentation

**Files:**
- Modify: `src/main.tsx:70-230`
- Modify: `src/styles.css`

- [x] **Step 1: Pass modifiers into Player**

Add `modifiers: RunModifiers` to `Player`. Apply `speedMultiplier` to target movement, `windMultiplier` to crosswind, `gravityMultiplier` to falling gravity, `burstCooldownMultiplier` to cooldown, `burstLiftMultiplier` to vertical burst, and `pickupRadius` to shard collection. `anchorCharge` is consumed by the fall callback and exposed via `onAnchorCharge`.

- [x] **Step 2: Add biome palette mapping**

Pass `biome={getBiome(height, courseHeight)}` to `World`. Use a palette object for background, fog, ground, and emissive colors; render a compact biome tag in the HUD. Keep the route geometry unchanged.

- [x] **Step 3: Reset deck state correctly**

`startRun` resets cards, pending cards, and modifiers to `DEFAULT_MODIFIERS`; `R` continues to reset to origin, while a charged Anchor card prevents one retry increment when a fall occurs.

- [ ] **Step 4: Browser smoke test**

Deploy locally or use the production URL. Start a run, verify card dialog appears after the first checkpoint, select card 2, verify the active-card rail, and confirm the biome label changes after climbing. Also verify pause/resume and finish remain available.

- [x] **Step 5: Commit**

```bash
git add src/main.tsx src/styles.css
git commit -m "feat: add biome route identity and card modifiers"
```

### Task 4: Ship and verify

**Files:**
- Modify: `docs/superpowers/plans/2026-07-31-signal-deck-biomes.md`

- [ ] **Step 1: Run release gates**

Run `npm run lint && npm run build` and record the result in the final handoff.

- [ ] **Step 2: Deploy production**

Run `vercel --prod --yes`, then `vercel inspect <production-url>`; expected status is `Ready` and the stable alias is `https://summit-signal-rouge.vercel.app`.

- [ ] **Step 3: Verify live browser behavior**

Smoke-test the contract selector, card dialog, active card rail, biome tag, and reset behavior in the deployed alias. Finalize the browser tab as deliverable.

- [ ] **Step 4: Commit plan status**

Mark completed checklist items and commit the plan update with `git add docs/superpowers/plans/2026-07-31-signal-deck-biomes.md && git commit -m "docs: track signal deck implementation"`.
