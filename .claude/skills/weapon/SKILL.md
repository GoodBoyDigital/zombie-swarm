---
name: weapon
description: Throw up an editable card for one weapon (or all) from src/config/weapons.ts, with its sprite and a save button. Use for /weapon <id>, "show me the shotgun", or any request to view or tweak a gun's numbers in chat.
---

# Weapon card

Shows one weapon from `src/config/weapons.ts` as an inline page: the gun's sprite scaled up, every
numeric field editable, live bars and derived damage rates, and a save button that writes the numbers
back into the file. With no argument it shows a picker over every weapon.

## Steps

1. Read `assets/weapon-card.html` from this skill's folder.
2. Replace the single token `__WEAPON__` with the weapon id the user asked for (`pistol`, `rifle`,
   `shotgun`, `railgun`, `minigun`, `magnum`, `uzi`, or whatever ids exist in the config). Use an
   empty string for "all". Match loosely: "the uzi" → `uzi`.
3. Put the whole file in an ```html fence in the final answer. Do not write it anywhere in the project.
4. Say in one line which weapon it shows and that Save rewrites `src/config/weapons.ts`.

## Notes

- The page reads the config through the Playbot SDK, so it always reflects the file on disk in this
  workspace, not a worktree branch. If the weapon isn't found, the page says so; check the id with
  `grep -n "^  \w\+: {" src/config/weapons.ts`.
- The sprite comes from the weapon's `sprite.path` under `public/`, rendered with nearest filtering.
- Save only touches the numeric lines inside that weapon's block and refuses if the file changed
  underneath; the user presses Reload and redoes the edit.
- The main dev server on port 8080 hot-reloads the config on save.
