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

## How it's built

| Area | File | Notes |
| --- | --- | --- |
| Tuning | `src/config/*.ts` | Arena size and gates, zombie defs, weapon defs. Add a new zombie or weapon here. |
| Loop | `src/Game.ts` | Builds the scene, owns the fixed-order update. |
| Arena | `src/world/Arena.ts` | Walls, gates and the player clamp rect. |
| Floor | `src/world/FloorCanvas.ts` | Persistent render texture. Corpses and blood are stamped in and forgotten. |
| Player | `src/entities/Player.ts` | Movement, aim, recoil, gun kick. |
| Horde | `src/entities/Horde.ts` | Pooling, gate spawning, crowd separation, wall containment, death stamping. |
| Zombie | `src/entities/Zombie.ts` | Chase, knockback, hit flash. Per-instance state only. |
| Hitscan | `src/combat/raycast.ts` | Ray vs zombie circles through the spatial hash, nearest first, capped by `pierce`. |
| Weapon | `src/combat/Weapon.ts` | Fire timing, applies hits and triggers feel effects. |
| Effects | `src/fx/Effects.ts` | Pooled muzzle flash, tracer, blood sparks. |
| Camera | `src/fx/Camera.ts` | Fit-to-window, trauma shake, directional kick. |
| Art | `src/fx/textures.ts` | Loads the pixel sprites from `public/sprites` and generates the rest (splats, flash, sparks) at low resolution with nearest filtering. |

## Art pipeline

Character art is 8-bit pixel art generated with the "Zombie Swarm 8-bit" Style Pack. Full-size concepts live in
`concepts/`; the game loads downscaled copies from `public/sprites`. To make a sprite from a concept:

```sh
magick concepts/foo.png -trim +repage -filter Point -resize 44x public/sprites/foo.png
```

Pick the width so the character's body matches its collision radius (walker is 44 px wide for radius 12,
player 56 px for radius 14). Anchors and the player's muzzle point are fractions of the sprite set in
`src/config/zombies.ts` and `src/entities/Player.ts`.

## Adding things

- **Zombie type**: add an entry to `ZOMBIES` in `src/config/zombies.ts`, then pick it in `Horde.spawnWave`. Behaviour variations go in `Zombie.update`.
- **Weapon**: add an entry to `WEAPONS` in `src/config/weapons.ts`. Set `pierce: Infinity` for a shot that goes through everything on the line.
- **Power-ups**: not started. Planned as timed modifiers over the player and weapon defs.
