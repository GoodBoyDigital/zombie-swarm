# Zombie Swarm

Top-down twin-stick shooter prototype. PixiJS 8, TypeScript, Vite.

## The game

Survive a swarm of slow, weak zombies until the rescue chopper comes, then get to it. The threat is
numbers: the swarm builds until it fills the arena, while random guns and power-ups drop everywhere.
Kills give XP, and each level-up lets you pick a power-up or gun that fires straight away and joins
your run's drop pool (repeat picks level it up). Coins bank between runs for unlocks. Extracting
finishes the level and unlocks the next, with tougher zombies. Kinetic and hectic, never fast.

The full plan everyone works from is [docs/DESIGN.md](docs/DESIGN.md).

```sh
npm install
npm run dev     # opens http://localhost:8080
```

## Sprite assets

AssetPack runs automatically before Vite serves or builds the game. During development it
watches the source artwork and repacks changes. Run `npm run assets` to pack it manually.

- Edit or add sprite PNGs in `assets/sprites{tps}/`. The `{tps}` tag packs zombies, corpses,
  detached heads, player art, weapons, pickups, power-up icons, and the plane into one atlas.
- Repeating tiles live in `assets/tiles/` and remain separate textures. Audio stays in `public/audio/`.
- `.assetpack.js` writes generated files to `public/assets/`. Do not edit these outputs;
  they and the build cache are ignored by Git and regenerated for development and deployment.
- Sprite frames retain their original dimensions and orientation at 2x resolution. Existing
  `/sprites/<filename>.png` config values are logical atlas keys, not individual image URLs.
- Procedural effects and dismembered zombie variants are still generated at startup. Loot uses
  the shared atlas directly instead of creating another texture at runtime.

Play online: https://goodboydigital.github.io/zombie-swarm/ (rebuilt from `main` on every push by `.github/workflows/pages.yml`).

Busy-arena profiling: see [perf/README.md](perf/README.md), then run `node perf/stress.mjs`
against the perf-labeled development server. This opens an isolated headed Chrome.

## Controls

- Arrow keys or WASD: move
- Mouse: aim
- Left mouse button: fire (auto-fire while held)
- R: reload, or retry the level from the results card; N: next level after extracting
- Hold out until the countdown hits zero, then get to the chopper's landing pad (follow the H arrow) and
  stand on it to board. Extracting unlocks the next level; dying retries the same one. Coins bank either way.
- 1-8: swap weapon (pistol, rifle, shotgun, railgun, minigun, magnum, uzi, rocket launcher); R: reload early
- F1-F3: music theme, F4: music off
- Walk over an orb to pick it up: blue is a weapon, pink helps you out, red hurts everything around you.
  Coins and gems drift to you once they land, when you are close, and count in the HUD.
- P: drop the next power-up orb in front of you, cycling through `POWERUPS`, to try any of them.
- Dev builds: a bar of buttons along the bottom drops any power-up or gun in front of you; O hides it.
- Backtick: tuning panel. Edits apply instantly; "Copy ... as source" puts the table on the clipboard in the
  shape of its `src/config/*.ts` file, ready to paste over the original.
- X (dev server only): jump the countdown to 10 seconds left; press again to skip the chopper's flight in, straight to its descent onto the pad.
- V: AI debug overlay (wanderers tinted blue, aggro radius and gunshot noise rings, wander/chase counts in the HUD)

## How it's built

| Area      | File                                         | Notes                                                                                                                                                                                                                                                                                                                                                        |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tuning    | `src/config/*.ts`                            | Arena size and gates, zombie defs, weapon defs. Add a new zombie or weapon here.                                                                                                                                                                                                                                                                             |
| Loop      | `src/Game.ts`                                | Builds the scene, owns the fixed-order update.                                                                                                                                                                                                                                                                                                               |
| Arena     | `src/world/Arena.ts`                         | Walls, gates and the player clamp rect. Beyond the walls the floor is black.                                                                                                                                                                                                                                                                                 |
| Floor     | `src/world/FloorCanvas.ts`                   | Persistent render texture. Corpses and blood are stamped in and forgotten.                                                                                                                                                                                                                                                                                   |
| Player    | `src/entities/Player.ts`                     | Movement, aim, recoil, gun kick.                                                                                                                                                                                                                                                                                                                             |
| Horde     | `src/entities/Horde.ts`                      | Pooling, gate spawning, crowd separation, wall containment, death stamping.                                                                                                                                                                                                                                                                                  |
| Zombie    | `src/entities/Zombie.ts`                     | Movement, knockback, hit flash. Per-instance state only; type data comes from its `ZombieDef`.                                                                                                                                                                                                                                                               |
| Brain     | `src/entities/ZombieBrain.ts`                | Wander/chase per zombie: random-walk wandering with loose herding, aggro radius, gunshot noise, reaction delay. Steers by a `ZombieTarget` Horde fills each frame: the player, or `Horde.lure` (a decoy) for zombies its call front has reached (`Horde.capture`). Tunables in `ZOMBIE_AI`.                                                                  |
| Hitscan   | `src/combat/raycast.ts`                      | Ray vs zombie circles through the spatial hash, nearest first, capped by `pierce`.                                                                                                                                                                                                                                                                           |
| Weapon    | `src/combat/Weapon.ts`                       | Fire timing, magazine and reload, feel effects per trigger pull.                                                                                                                                                                                                                                                                                             |
| Combat    | `src/combat/CombatContext.ts`                | Horde, fx, floor, camera and audio in one object. `applyHit` is the one place a zombie takes damage. The weapon owns one, power-ups another.                                                                                                                                                                                                                 |
| Shots     | `src/combat/shots.ts`                        | How a pellet reaches zombies, per `WeaponDef.shot`.                                                                                                                                                                                                                                                                                                          |
| Explosion | `src/combat/explosion.ts`                    | `explode(ctx, x, y, def)`: damage and knockback through the spatial hash, fireball, shockwave, debris, scorch, shake, noise, sound. Defs in `src/config/explosions.ts`.                                                                                                                                                                                      |
| Limbs     | `src/fx/Limbs.ts`                            | Dismemberment. A hit (shot, blast or power-up, all through `applyHit`) walks its line through the zombie in sprite space (`Zombie.partOnRay`) and rolls the part's chance in `src/config/dismember.ts`; the piece tumbles off like a casing and is stamped into the floor. The zombie and its corpse switch to the variant baked for its missing-parts mask. |
| Loot      | `src/entities/Loot.ts`                       | Coins and gems. One ParticleContainer, pooled Particles, own SpatialHash for vacuum and collection, oldest-first cap. Kinds and the pinata rules in `src/config/loot.ts`, magnet numbers in `src/config/player.ts`.                                                                                                                                          |
| Drops     | `src/entities/Drops.ts`                      | Power-up orbs in their category colour with the icon on top. Weighted pick over `POWERUPS`; per-kill chances, per-action caps and orb looks in `src/config/drops.ts`. Orbs only come from kills.                                                                                                                                                             |
| Power-ups | `src/powerups/`                              | `Powerups.ts` runs each pickup through its handler in `registry.ts` (`POWERUP_EFFECTS`, one file per effect in `effects/`). `PowerupContext.ts` is what handlers get. Defs and category colours in `src/config/powerups.ts`.                                                                                                                                 |
| Reticle   | `src/ui/Reticle.ts`                          | Screen-space crosshair with the reload ring. Size is `RETICLE_SIZE`.                                                                                                                                                                                                                                                                                         |
| Survival  | `src/ui/HealthBar.ts`, `Vignette.ts`         | Health bar and hurt/low-health screen glow. Health and contact damage numbers in `src/config/player.ts`.                                                                                                                                                                                                                                                     |
| Run       | `src/run/`, `src/ui/RunHud.ts`, `Results.ts` | Extraction run: countdown on real time, then the chopper (`Chopper.ts`) lands far from the player; stand on the pad to board. `LEVELS` and `RUN` in `src/config/run.ts`. Results card banks coins and unlocks the next level in the save (`src/meta/save.ts`); restart rebuilds the whole `Game` from `main.ts` on a level.                                  |
| Tuning    | `src/debug/TuningPanel.ts`                   | Tweakpane overlay bound to the live config records. Register a table in `setupTuning`.                                                                                                                                                                                                                                                                       |
| Effects   | `src/fx/Effects.ts`                          | Pooled muzzle flash, tracer, blood sparks.                                                                                                                                                                                                                                                                                                                   |
| Camera    | `src/fx/Camera.ts`                           | Eased follow, clamped `CAMERA.edgeReveal` past the arena edge so a strip of wall shows. Zoom and rates in `src/config/camera.ts`.                                                                                                                                                                                                                            |
| Art       | `src/fx/textures.ts`                         | Loads flat vector sprites from the AssetPack atlas at `1 / ART_SCALE` resolution and draws the effects (splats, sparks, muzzle flash, tracer, casings) as vector shapes at full resolution. Linear filtering by default; add `?filter=nearest` to the URL to compare.                                                                                        |

## Art pipeline

The look is flat vector cartoon: clean shapes, a bold even dark outline (`#151a15`), flat fills with one
cel-shade tone per shape, no gradients or texture. The four `concepts/vectorA-*.png` images are the style
reference; link them as style references on every generation, plus the existing sprite it replaces as the
content reference. Generate on a flat magenta background rather than asking for transparency (use light grey
`#C8C8C8` for purple or red subjects). Characters face right; weapons are drawn strictly top-down, barrel
pointing right. If the generator returns a side profile with a hanging grip, crop to the band a top-down
view would show (see `weapon-*-topdown.png`).

Full-size keyed sources live in `concepts/vector/` (raw generations in `concepts/vector/raw/`). The game
loads the atlas built from `assets/sprites{tps}/`, authored at **2x world size**: textures load at resolution
`1 / ART_SCALE` (`src/fx/textures.ts`), so `texture.width` is already in world px and every anchor, hand
point, grip and muzzle stays a plain fraction of the sprite. `concepts/vector/ship.sh` does the whole trip:

```sh
concepts/vector/ship.sh key  concepts/vector/raw/foo.png concepts/vector/foo.png   # key magenta, trim
concepts/vector/ship.sh ship concepts/vector/foo.png "assets/sprites{tps}/foo.png" 40 2.5 0.7
concepts/vector/ship.sh flash "assets/sprites{tps}/zombie-foo.png" "assets/sprites{tps}/zombie-foo-flash.png"
```

`ship` takes the art width in world px, then the outline it adds around the silhouette and the extra weight
on interior ink lines (both world px), and downscales to 2x with Lanczos. Generated outlines vanish at game
size, so the weight is added here: 2.5 for walkers, corpses and the player, 2 for the runner, 3 for the brute,
1.5 for weapons and pickups. Each zombie type needs `zombie-<key>.png`, `zombie-<key>-flash.png` and its
corpses `zombie-<key>-corpse-<n>.png` (sprawled, curled on its side, face down). `art.radius` in
`src/config/zombies.ts` is the body radius in world px the art was drawn for, and `art.anchor` the body
centre as fractions; the player's hand point is in `src/entities/Player.ts`.

Characters are drawn without weapons, hands empty and reaching forward. Each weapon is its own sprite
(`sprite` in `src/config/weapons.ts`): `grip` is the fraction of the weapon image pinned to the player's
hand point, `muzzle` is the barrel tip where shots, flash and tracer start, `eject` the port casings leave
from. Weapons are about 30 world px long; a weapon orb shows the held sprite as its icon.

## Live config while the dev server runs

Every table in `src/config/` (except the arena layout) hot-reloads: save the file, or use the
backtick tuning panel or the `/weapon` card, and the running game picks up the new numbers on the
next frame without a page reload (`src/debug/hotConfig.ts`). Adding or removing an entry, or
changing a value's type, falls back to a normal reload. Dev only; production builds don't include it.

## Adding things

- **Zombie type**: add an entry to `ZOMBIES` in `src/config/zombies.ts` (art key, radius, speed, health, mass, brain overrides, groans) and give it a column in `SPAWN_TABLE`, which ramps the mix by elapsed time. Behaviour lives in `ZombieBrain.steer`; shared numbers in `ZOMBIE_AI`.
- **Severable parts**: give the type's art a `parts` record (`leftArm`, `rightArm`, `head`), each a polygon or circle in the body sprite's source pixels plus one per corpse pose. List a polygon's tear edges first and set `cut` to their count; only those get the red stump. A part with `neck` leaves a neck stump instead (with `back` filling the shoulders the head hid on the standing body), and `pieces` throws its own sprites instead of a cut-out. With `DISMEMBER.headKills`, losing the head is a kill. `textures.ts` bakes every combination at load. Check shapes against the sprite, as in `concepts/dismember/captures/walker-part-shapes.png`.
- **Weapon**: add an entry to `WEAPONS` in `src/config/weapons.ts`. Set `pierce: Infinity` for a shot that goes through everything on the line. `noiseRadius` is how far a shot wakes wandering zombies. `spread` is the base miss angle; `spreadBloom` grows it per second of held trigger up to `spreadMax`.
- **Shot type** (rocket, grenade, flame): add the name to `ShotType` and a handler to `SHOT_HANDLERS` in `src/combat/shots.ts`. `fire` launches one pellet; projectile types move and detonate in the optional `update`, then call `ctx.applyHit` for each zombie found with `horde.hash.queryBox` around the impact.
- **Loot kind**: add an entry to `LOOT` in `src/config/loot.ts` with a `counter`, `value` and `weight`, plus its sprite in `LOOT_SPRITES` (`src/fx/textures.ts`); all loot is packed into one atlas at load.
- **Explosion**: add an entry to `EXPLOSIONS` in `src/config/explosions.ts` (radius, damage, knockback, falloff, flash, ring, debris, shake, scorch, noise, sound) and call `explode(ctx, x, y, EXPLOSIONS.yours)` with any `CombatContext`: a shot handler's on impact, a power-up's from its `start` or `update`. Damage 0 pushes only; knockback 0 hurts only. Optional `visualRadius` keeps the art a different size from damage and knockback.
- **Power-up**: one `POWERUPS` entry in `src/config/powerups.ts`, one handler file, one icon.
  1. Entry: `id`, `name`, `category` (`weapon` blue, `support` pink, `destructive` red), `mode` (`timed` with `seconds`, or `instant`), `icon` (a sprite path; ship it 40 world px wide with `ship.sh ship ... 40 1.5 0.5`), `weight` (drop chance, 0 never drops) and `effect` plus its params. A new effect also adds its member to the `PowerupDef` union in the same file.
  2. Handler: `src/powerups/effects/<effect>.ts` exporting a `PowerupEffect<EffectDef<"yours">, State>` with any of `start(ctx, def, active)`, `update(ctx, def, dt, active)`, `end(ctx, def, active)`, registered in `POWERUP_EFFECTS` (`src/powerups/registry.ts`). Timed: start on first pickup, update each frame, end on expiry; a repeat pickup refreshes the timer. Instant: start on every pickup, then end straight away unless start sets `active.left` to keep running (the nuke does, for its screen flash). Keep per-pickup things in `active.state`.
  3. `ctx` (`PowerupContext`) is a `CombatContext` (horde and its `hash`, `applyHit`, fx, floor, camera, audio; pass it to `explode`) plus `player`, `weapon`, `world` (world-space layer over the horde), `screen` and `screenRect` (screen-space layer under the HUD) and `modifiers` (stat multipliers, reset each frame).
     Stat boosts: give the def a `modifiers` record of multipliers (move speed, fire interval, damage, magnet radius and pull, spread) and call `applyModifiers(ctx, def.modifiers)` from the handler's `update` (see `effects/magnet.ts`, `speed.ts`, `power.ts`); they stack multiplicatively. Every active power-up should show something on or around the player.
