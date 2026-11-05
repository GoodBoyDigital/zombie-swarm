---
name: weapon
description: Throw up an editable card for one weapon (or all) from src/config/weapons.ts, with its sprite and a save button. Use for /weapon <id>, "show me the shotgun", or any request to view or tweak a gun's numbers in chat.
---

# Weapon card

Shows one weapon from `src/config/weapons.ts` as an inline panel: the gun's sprite scaled up, every
numeric field editable, draggable bars and derived damage rates, and a save button that writes the numbers
back into the file. With no argument it shows a picker over every weapon.

## Steps

1. Answer with this fence, with the weapon id the user asked for after `weapon=` (`pistol`, `rifle`,
   `shotgun`, `railgun`, `minigun`, `magnum`, `uzi`, or whatever ids exist in the config). Leave out
   `?weapon=…` for "all". Match loosely: "the uzi" → `uzi`. Do not read or paste the HTML.

   ```inline-panel
   weapon/assets/weapon-card.html?weapon=<id>
   ```

2. Say in one line which weapon it shows and that Save rewrites `src/config/weapons.ts`.

## Notes

- Keep the panel compact. Only the property list scrolls, capped at 230 px; the weapon picker,
  sprite, summary and Save button stay outside it. Bars span the panel width beneath the preview.
- Use actual range sliders alongside number inputs. Update their values, fills and derived stats
  in place during edits so dragging, focus and scroll position survive. Retain unlimited options
  for magazine count and piercing; writes happen only when the user clicks Save.
- Put ammunition controls first: rounds per magazine, reloads per pickup and reload seconds.
  The reloads control displays and edits spare magazines, so map it to `magazines - 1` on read
  and `reloads + 1` on save. Zero reloads means just the loaded magazine. Keep the ammo summary
  visible above the scrolling properties; do not add a separate reload-count config field.
- Show the pistol's reload count as a read-only ∞, not a finite slider or number input.
  Preserve its `magazines: Infinity` on save. Its per-magazine round capacity is separate.
- The panel reads the config through the Playbot SDK, so it always reflects the file on disk in this
  workspace, not a worktree branch. If the weapon isn't found, the panel says so; check the id with
  `grep -n "^  \w\+: {" src/config/weapons.ts`.
- The sprite comes from the weapon's `sprite.path`, read from the atlas source folder `assets/sprites{tps}/`.
- Save only touches the numeric lines inside that weapon's block and refuses if the file changed
  underneath; the user presses Reload and redoes the edit.
- The main dev server on port 8080 hot-reloads the config on save.
