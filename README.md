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

| Area      | File                                                              | Notes                                                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tuning    | `src/config/*.ts`                                                 | Arena size and gates, zombie defs, weapon defs. Add a new zombie or weapon here.                                                                                                                                    |
| Loop      | `src/Game.ts`                                                     | Builds the scene, owns the fixed-order update.                                                                                                                                                                      |
| Arena     | `src/world/Arena.ts`                                              | Walls, gates and the player clamp rect.                                                                                                                                                                             |
| Floor     | `src/world/FloorCanvas.ts`                                        | Persistent render texture. Corpses and blood are stamped in and forgotten.                                                                                                                                          |
| Player    | `src/entities/Player.ts`                                          | Movement, aim, recoil, gun kick.                                                                                                                                                                                    |
| Horde     | `src/entities/Horde.ts`                                           | Pooling, gate spawning, crowd separation, wall containment, death stamping.                                                                                                                                         |
| Zombie    | `src/entities/Zombie.ts`                                          | Movement, knockback, hit flash. Per-instance state only; type data comes from its `ZombieDef`.                                                                                                                      |
| Brain     | `src/entities/ZombieBrain.ts`                                     | Wander/chase per zombie: random-walk wandering with loose herding, aggro radius, gunshot noise, reaction delay. Tunables in `ZOMBIE_AI`.                                                                            |
| Hitscan   | `src/combat/raycast.ts`                                           | Ray vs zombie circles through the spatial hash, nearest first, capped by `pierce`.                                                                                                                                  |
| Weapon    | `src/combat/Weapon.ts`                                            | Fire timing, magazine and reload, feel effects per trigger pull.                                                                                                                                                    |
| Shots     | `src/combat/shots.ts`                                             | How a pellet reaches zombies, per `WeaponDef.shot`. `applyHit` is the one place a zombie takes damage.                                                                                                              |
| Loot      | `src/entities/Loot.ts`                                            | Coins and gems. One ParticleContainer, pooled Particles, own SpatialHash for vacuum and collection, oldest-first cap. Kinds and the pinata rules in `src/config/loot.ts`, magnet numbers in `src/config/player.ts`. |
| Drops     | `src/entities/Drops.ts`                                           | Weapon crates and power-up orbs. Pooled sprites, per-kill chance and timed spawn in `src/config/drops.ts`.                                                                                                          |
| Power-ups | `src/entities/Powerups.ts`                                        | Timed multipliers from `src/config/powerups.ts`, applied to the player and weapon each frame.                                                                                                                       |
| Reticle   | `src/ui/Reticle.ts`                                               | Screen-space crosshair with the reload ring and timer. Size is `RETICLE_SIZE`.                                                                                                                                      |
| Survival  | `src/ui/HealthBar.ts`, `src/ui/Vignette.ts`, `src/ui/GameOver.ts` | Health bar, hurt/low-health screen glow, end card. Health and contact damage numbers in `src/config/player.ts`; restart rebuilds the whole `Game` from `main.ts`.                                                   |
| Tuning    | `src/debug/TuningPanel.ts`                                        | Tweakpane overlay bound to the live config records. Register a table in `setupTuning`.                                                                                                                              |
| Effects   | `src/fx/Effects.ts`                                               | Pooled muzzle flash, tracer, blood sparks.                                                                                                                                                                          |
| Camera    | `src/fx/Camera.ts`                                                | Fit-to-window, trauma shake, directional kick.                                                                                                                                                                      |
| Art       | `src/fx/textures.ts`                                              | Loads the pixel sprites from `public/sprites` and generates the rest (splats, flash, sparks) at low resolution. Nearest filtering by default; add `?filter=linear` to the URL to compare smoothed sampling.         |

## Art pipeline

Character art is 8-bit pixel art generated with the "Zombie Swarm 8-bit" Style Pack. Full-size concepts live in
`concepts/`; the game loads downscaled copies from `public/sprites`. To make a sprite from a concept:

```sh
magick concepts/foo.png -trim +repage -filter Point -resize 44x public/sprites/foo.png
```

Pick the width so the character's head is about twice its collision radius (walker 44 px wide for radius 12,
runner 64 for radius 10, brute 96 for radius 20, player 36 px for radius 14). Each zombie type needs three files
named by its `art.key`: `zombie-<key>.png`, `zombie-<key>-corpse.png` and a white hit-flash silhouette made with

````sh
magick public/sprites/zombie-foo.png -channel RGB -fill white -colorize 100 +channel public/sprites/zombie-foo-flash.png
``` Anchors and the player's hand point are fractions of the sprite set in
`src/config/zombies.ts` and `src/entities/Player.ts`.

Characters are drawn without weapons, hands empty and reaching forward. Each weapon is its own sprite
(`sprite` in `src/config/weapons.ts`): `grip` is the fraction of the weapon image pinned to the player's
hand point, `muzzle` is the barrel tip where shots, flash and tracer start. Weapon concepts are drawn strictly
top-down with dumpy proportions, barrel pointing right, about 30 px wide in game. The walker (`concepts/styleA-walker-1.png`)
and its corpse are the style reference; link them as references when generating new characters, and
generate on a flat magenta background then key it out rather than asking for transparency, which eats
the black outline:

```sh
magick in.png -fuzz 18% -transparent "#FF00FF" -channel RGB -fx "(r>0.35&&b>0.35&&g<0.25)?0:u" +channel -trim +repage concepts/foo.png
````

## Adding things

- **Zombie type**: add an entry to `ZOMBIES` in `src/config/zombies.ts` (art key, radius, speed, health, mass, brain overrides, groans) and give it a column in `SPAWN_TABLE`, which ramps the mix by elapsed time. Behaviour lives in `ZombieBrain.steer`; shared numbers in `ZOMBIE_AI`.
- **Weapon**: add an entry to `WEAPONS` in `src/config/weapons.ts`. Set `pierce: Infinity` for a shot that goes through everything on the line. `noiseRadius` is how far a shot wakes wandering zombies. `spread` is the base miss angle; `spreadBloom` grows it per second of held trigger up to `spreadMax`.
- **Shot type** (rocket, grenade, flame): add the name to `ShotType` and a handler to `SHOT_HANDLERS` in `src/combat/shots.ts`. `fire` launches one pellet; projectile types move and detonate in the optional `update`, then call `ctx.applyHit` for each zombie found with `horde.hash.queryBox` around the impact.
- **Loot kind**: add an entry to `LOOT` in `src/config/loot.ts` with a `counter`, `value` and `weight`, plus its sprite in `LOOT_SPRITES` (`src/fx/textures.ts`); all loot is packed into one atlas at load.
- **Drop kind**: `DROPS` in `src/config/drops.ts`, either a weapon on a crate or a power-up on an orb.
- **Power-up**: add an entry to `POWERUPS` in `src/config/powerups.ts` with its seconds and a `modifiers` record of multipliers (move speed, fire interval, damage, magnet radius and pull, spread), plus an icon in `POWERUP_ICON_SPRITES` and a `DROPS` entry so it can spawn. Active ones stack multiplicatively; picking one up again refreshes its timer. The HUD lists them with seconds left.
