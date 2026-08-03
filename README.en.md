# SECONDS

**[中文](README.md)**

A 2D greybox action **speedrunning** prototype built around one idea: time is the only currency.

**You have no health bar.** Getting hit doesn't kill you — it just adds seconds to your clock. Upgrades cost seconds, shortcuts cost seconds, even patching yourself up costs seconds. **The clock keeps running even while you're standing on the map or in the shop, thinking.**

> Every decision boils down to the same question: **can you go faster?**

Full design spec in [DESIGN.md](DESIGN.md) (Chinese).

## Run it

```bash
npm install
npm run dev        # dev server
npm run build      # outputs dist/index.html — still a single file, double-click to play
npm test           # pricing invariant + seed reproducibility + boot smoke tests
```

The build output is **one self-contained HTML file** (~50 KB). Adopting a build toolchain didn't cost the prototype its most important distribution property: zero dependencies, double-click to play.

## Controls

| Key | Action |
|---|---|
| `W A S D` / arrow keys | Move |
| Mouse | Aim |
| Left click | Slash (hold-to-charge instead, once you have "Charge Slash") |
| `Space` / right click | Dash **toward the cursor**, 0.17s full invulnerability |
| `1` `2` `3` `4` | Pick a card |
| Left click | Pick the next node on the map |
| `ESC` | Pause (opaque: clock stops, but the battlefield is fully hidden) |

Dash direction **only follows the cursor, never the movement keys**, and locks in on the frame you press it — no turning mid-dash. Want to dodge somewhere? Flick the cursor there first, including behind you.

Getting hit causes **0.18s of hitstun**: you can't move or attack, but it can be **cancelled by dashing once it's more than half over**. Once you're 3+ hits into a combo, hitstun is halved so you don't get locked into an inescapable beatdown.

## The rules

**Total time = game time + hit penalty + spending − kill refunds**

A run is an **8-floor branching map** (Slay the Spire style), generated once at the start and laid out in full from the beginning:

- **Combat / Elite rooms** — free upgrades (the game time you spend clearing them is the tuition)
- **Seconds Shop** — buy upgrades with seconds; you can always afford it because the cost is charged straight to your final score
- **Shortcut Gate** — spend 9s to skip a whole floor; drawn on the map as a visible cross-floor edge
- **Time Mend** — spend 12s to wipe 40% of your accumulated hit penalty

Floor 1 is always a combat room, the second-to-last floor is always a rest stop (shop or mend), and the top floor is the boss.

**Enemy strength has nothing to do with your elapsed time.** This is pure speedrunning: every purchase is the same kind of direct bet — spend 14 seconds on this upgrade, will it save you more than 14 seconds over the rest of the run? You can always do the math, but you can never be sure of the answer, because how much you save depends on how well you play from here on out.

## Seed

Every run is fully determined by a **seed**: map topology, room types, wall layouts, enemy spawn points, upgrade draw order, boss move sequence. Type one in on the title screen; the result screen lets you copy it, or rerun the exact same seed with one click.

Randomness is split into two independent streams:

| Stream | Derived when | Drives |
|---|---|---|
| `mapRng` | Once, at the start of the run | The whole map + all room types — **fixed before you take a single step** |
| `combatRng` | Independently per node, from `hash(seed, nodeId)` | That room's walls, enemy spawn points, boss move choices |

The split matters: with a single stream, one extra random roll inside a fight would change every room downstream of it — two people running the same seed would end up in different runs, and speedrunning stops being comparable at all.

**`seed + total time` is what makes a result verifiable and comparable.**

## Language

The **`EN` / `中文`** button in the top-right corner switches the interface language at any time — it defaults to your browser's language and remembers your choice locally. Switching is live: upgrades you've already picked up, whatever shop or result screen is currently open, all retranslate immediately, no restart needed. It even works while paused (the clock stays stopped).

English copy lives in [src/i18n/strings.ts](src/i18n/strings.ts); both dictionaries share the exact same key set — a missing translation is a compile error, not a runtime blank.

## Combo tax

Getting hit grants 0.4s of invulnerability, but **don't treat it as a free pass to stand in things**.

Every additional hit within a 5-second window multiplies the price by 1.3 — 2.0s, then 2.6s, then 3.4s. Go 5 seconds without getting hit and it resets.

## Reading the price tags

Everything on screen that's about to cost you money carries a live price tag — **the number is exactly how many seconds you'll be charged if it connects right now**, upgrades and combo tax already baked in:

- **Red** — the standard price
- **Bold orange** — combo tax is active and climbing
- **Nothing at all** — you're currently invulnerable; for this instant, the whole battlefield is genuinely free

Incoming projectiles carry price tags too, fading in as they get closer. The boss prices each move separately: the triple-ring windup is `+3.0s`, the collapsing-circle windup is `+2.5s`, a charge on contact is `+5.0s`.

**Projectiles can't be destroyed** — the only way out is positioning and dashing.

## Reading enemies

Red = about to charge you. The number shown is the base price with no upgrades and no combo tax.

- **Triangle (Charger, +2.0s)** — telegraphs a locked red line, then dashes at high speed. Direction locks in the moment the windup starts, so a single sidestep is enough
- **Square (Shooter, +1.5s)** — locks on with a red dashed line, then fires one projectile
- **Hexagon (Brute, +4.0s)** — a red ring expands from its feet; full damage the instant it finishes expanding
- **Octagon (Boss)** — thick red line = triple charge / collapsing circle = 12-shot ring burst / three concentric rings = triple shockwave, weave through the gaps

## Code layout

```
src/
  core/      rng (seed splitting) · timeline (game clock) · input · math
  game/      config (every tunable number) · pricing (the single source of truth for prices)
             ledger (the time ledger) · world (the combat world) · player
             enemies/ (one file per enemy type) · map · room · run
  i18n/      strings (zh/en dictionaries) · i18n (current-language state + change broadcast)
  render/    renderer · drawWorld · drawMap        — read-only views of the world, never mutate it
  scenes/    title · mapScene · combat · reward · shop · result
  ui/        hud · overlay
```

**Balance tuning only touches [src/game/config.ts](src/game/config.ts)** — no logic code involved.

### Four hard invariants (enforced by tests)

1. **Price === actual charge** — every `+X.Xs` on screen and every ledger deduction goes through the same `penaltyFor()` and the same `formatSeconds()`. Nothing is drawn during invulnerability.
2. **All game timing runs on the game clock** — no `setTimeout`. Hitstop, time-slow, and pause correctly affect every scheduled callback (this is what keeps the boss's three-stage shockwave honest).
3. **`Math.random()` is banned project-wide** — all randomness is derived from the seed. One stray call would silently break the entire speedrunning mode and be brutal to track down, so a test enforces it like a lint rule.
4. **Fixed timestep** — logic advances in 1/120s steps; frame rate never affects hit detection or feel.
