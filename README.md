# Zombie Swarm

Top-down twin-stick shooter prototype. PixiJS 8, TypeScript, Vite.

```sh
npm install
npm run dev     # opens http://localhost:8080
```

## Controls

- Arrow keys or WASD: move
- Mouse: aim
- Left mouse button: fire (auto-fire while held)
- R: reload, or restart once you are down
- 1-7: swap weapon (pistol, rifle, shotgun, railgun, minigun, magnum, uzi); R: reload early
- F1-F3: music theme, F4: music off
- Walk over a crate to equip its weapon. Coins and gems drift to you when close and count in the HUD.
- Backtick: tuning panel. Edits apply instantly; "Copy ... as source" puts the table on the clipboard in the
  shape of its `src/config/*.ts` file, ready to paste over the original.
- V: AI debug overlay (wanderers tinted blue, aggro radius and gunshot noise rings, wander/chase counts in the HUD)

## How it's built

| Area      | File                          | Notes                                                                                                                                                                                                               |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tuning    | `src/config/*.ts`             | Arena size and gates, zombie defs, weapon defs. Add a new zombie or weapon here.                                                                                                                                    |
| Loop      | `src/Game.ts`                 | Builds the scene, owns the fixed-order update.                                                                                                                                                                      |
| Arena     | `src/world/Arena.ts`          | Walls, gates and the player clamp rect. Beyond the walls the floor is black.                                                                                                                                        |
| Floor     | `src/world/FloorCanvas.ts`    | Persistent render texture. Corpses and blood are stamped in and forgotten.                                                                                                                                          |
| Player    | `src/entities/Player.ts`      | Movement, aim, recoil, gun kick.                                                                                                                                                                                    |
| Horde     | `src/entities/Horde.ts`       | Pooling, gate spawning, crowd separation, wall containment, death stamping.                                                                                                                                         |
| Zombie    | `src/entities/Zombie.ts`      | Movement, knockback, hit flash. Per-instance state only; type data comes from its `ZombieDef`.                                                                                                                      |
| Brain     | `src/entities/ZombieBrain.ts` | Wander/chase per zombie: random-walk wandering with loose herding, aggro radius, gunshot noise, reaction delay. Tunables in `ZOMBIE_AI`.                                                                            |
| Hitscan   | `src/combat/raycast.ts`       | Ray vs zombie circles through the spatial hash, nearest first, capped by `pierce`.                                                                                                                                  |
| Weapon    | `src/combat/Weapon.ts`        | Fire timing, magazine and reload, feel effects per trigger pull.                                                                                                                                                    |
| Shots     | `src/combat/shots.ts`         | How a pellet reaches zombies, per `WeaponDef.shot`. `applyHit` is the one place a zombie takes damage.                                                                                                              |
| Limbs     | `src/fx/Limbs.ts`             | Dismemberment. A hit walks the shot line through the zombie in sprite space (`Zombie.partOnRay`) and rolls the part's chance in `src/config/dismember.ts`; the piece tumbles off like a casing and is stamped into the floor. The zombie and its corpse switch to the variant baked for its missing-parts mask. |
| Loot      | `src/entities/Loot.ts`        | Coins and gems. One ParticleContainer, pooled Particles, own SpatialHash for vacuum and collection, oldest-first cap. Kinds and the pinata rules in `src/config/loot.ts`, magnet numbers in `src/config/player.ts`. |
| Drops     | `src/entities/Drops.ts`       | Weapon crates and power-up orbs. Pooled sprites, per-kill chance and timed spawn in `src/config/drops.ts`.                                                                                                          |
| Power-ups | `src/entities/Powerups.ts`    | Timed multipliers from `src/config/powerups.ts`, applied to the player and weapon each frame.                                                                                                                       |
| Reticle   | `src/ui/Reticle.ts`           | Screen-space crosshair with the reload ring. Size is `RETICLE_SIZE`.                                                                                                                                                |
| Survival  | `src/ui/HealthBar.ts`, `Vignette.ts`, `GameOver.ts` | Health bar, hurt/low-health screen glow, end card. Health and contact damage numbers in `src/config/player.ts`; restart rebuilds the whole `Game` from `main.ts`. |
| Tuning    | `src/debug/TuningPanel.ts`    | Tweakpane overlay bound to the live config records. Register a table in `setupTuning`.                                                                                                                              |
| Effects   | `src/fx/Effects.ts`           | Pooled muzzle flash, tracer, blood sparks.                                                                                                                                                                          |
| Camera    | `src/fx/Camera.ts`            | Eased follow, clamped `CAMERA.edgeReveal` past the arena edge so a strip of wall shows. Zoom and rates in `src/config/camera.ts`.                                                                                   |
| Art       | `src/fx/textures.ts`          | Loads the flat vector sprites from `public/sprites` at `1 / ART_SCALE` resolution and draws the effects (splats, sparks, muzzle flash, tracer, casings) as vector shapes at full resolution. Linear filtering by default; add `?filter=nearest` to the URL to compare.                                            |

## Art pipeline

The look is flat vector cartoon: clean shapes, a bold even dark outline (`#151a15`), flat fills with one
cel-shade tone per shape, no gradients or texture. The four `concepts/vectorA-*.png` images are the style
reference; link them as style references on every generation, plus the existing sprite it replaces as the
content reference. Generate on a flat magenta background rather than asking for transparency (use light grey
`#C8C8C8` for purple or red subjects). Characters face right; weapons are drawn strictly top-down, barrel
pointing right. If the generator returns a side profile with a hanging grip, crop to the band a top-down
view would show (see `weapon-*-topdown.png`).

Full-size keyed sources live in `concepts/vector/` (raw generations in `concepts/vector/raw/`). The game
loads copies from `public/sprites` authored at **2x world size**: textures load at resolution
`1 / ART_SCALE` (`src/fx/textures.ts`), so `texture.width` is already in world px and every anchor, hand
point, grip and muzzle stays a plain fraction of the sprite. `concepts/vector/ship.sh` does the whole trip:

```sh
concepts/vector/ship.sh key  concepts/vector/raw/foo.png concepts/vector/foo.png   # key magenta, trim
concepts/vector/ship.sh ship concepts/vector/foo.png public/sprites/foo.png 40 2.5 0.7
concepts/vector/ship.sh flash public/sprites/zombie-foo.png public/sprites/zombie-foo-flash.png
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
from. Weapons are about 30 world px long; crate icons are the same art shipped 26 px wide.

## Adding things

- **Zombie type**: add an entry to `ZOMBIES` in `src/config/zombies.ts` (art key, radius, speed, health, mass, brain overrides, groans) and give it a column in `SPAWN_TABLE`, which ramps the mix by elapsed time. Behaviour lives in `ZombieBrain.steer`; shared numbers in `ZOMBIE_AI`.
- **Severable parts**: give the type's art a `parts` record (`leftArm`, `rightArm`, `head`), each a polygon or circle in the body sprite's source pixels plus one per corpse pose. List a polygon's tear edges first and set `cut` to their count; only those get the red stump. A part with `neck` leaves a neck stump instead (with `back` filling the shoulders the head hid on the standing body), and `pieces` throws its own sprites instead of a cut-out. With `DISMEMBER.headKills`, losing the head is a kill. `textures.ts` bakes every combination at load. Check shapes against the sprite, as in `concepts/dismember/captures/walker-part-shapes.png`.
- **Weapon**: add an entry to `WEAPONS` in `src/config/weapons.ts`. Set `pierce: Infinity` for a shot that goes through everything on the line. `noiseRadius` is how far a shot wakes wandering zombies. `spread` is the base miss angle; `spreadBloom` grows it per second of held trigger up to `spreadMax`.
- **Shot type** (rocket, grenade, flame): add the name to `ShotType` and a handler to `SHOT_HANDLERS` in `src/combat/shots.ts`. `fire` launches one pellet; projectile types move and detonate in the optional `update`, then call `ctx.applyHit` for each zombie found with `horde.hash.queryBox` around the impact.
- **Loot kind**: add an entry to `LOOT` in `src/config/loot.ts` with a `counter`, `value` and `weight`, plus its sprite in `LOOT_SPRITES` (`src/fx/textures.ts`); all loot is packed into one atlas at load.
- **Drop kind**: `DROPS` in `src/config/drops.ts`, either a weapon on a crate or a power-up on an orb.
- **Power-up**: add an entry to `POWERUPS` in `src/config/powerups.ts` with its seconds and a `modifiers` record of multipliers (move speed, fire interval, damage, magnet radius and pull, spread), plus an icon in `POWERUP_ICON_SPRITES` and a `DROPS` entry so it can spawn. Active ones stack multiplicatively; picking one up again refreshes its timer. The HUD lists them with seconds left.
