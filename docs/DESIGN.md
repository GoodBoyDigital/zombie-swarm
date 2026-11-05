# Zombie Swarm: game design

## Pillar

Individually slow, weak zombies. The threat is numbers that build up unnoticed, and a world that gets
messier the longer you last. Everything below should make that build-up the story of a run.

## The feel

Kinetic and hectic, never fast zombies. The swarm closes in from every side, guns and power-ups are
dropping everywhere, and crazy things keep happening. The moment we design for: the chopper is a
minute out, you are boxed in, and you sprint for an orb in the crowd, it blows a hole in the swarm,
and that buys you ten more seconds of shooting until the chopper lands. Random drops plus your own
picks make every one of those moments different.

## The run: hold out, then get to the chopper

- A run is a countdown to extraction (5 minutes for now, tunable per level). The spawn ramp builds the
  swarm toward its peak as the timer runs out.
- When the timer hits zero the rescue chopper lands somewhere in the arena, often far from the
  player, at the moment the swarm is biggest. Reach it to win.
- Push your luck: when it arrives the player can wave it off for more time at a coin multiplier,
  risking the whole run for a bigger haul. (After the core loop works.)
- Dying ends the run too. Either way: a results screen with the outcome, time, kills and coins
  banked. Progress is levels finished, not a score.

## Levels

- Extracting completes the level and unlocks the next one. Dying means retrying the same level.
- For now every level is the same arena with a different floor and tougher zombies (more health,
  denser spawns, new types mixed in earlier). Later levels can bring new arenas and new zombie types.
- Each level is a config entry: floor tiles/tint, zombie toughness, spawn table, run length.

## Two currencies, one job each

| Currency | Earned by                                      | Spent on                  |
| -------- | ---------------------------------------------- | ------------------------- |
| XP       | Killing zombies                                | Level-ups during the run  |
| Coins    | Picking up loot (in the crowd, and it expires) | Meta unlocks between runs |

XP comes from kills, so it scales with the swarm: more zombies, faster levels, and the player's power
climbs with the threat. Coins are the only thing a run keeps, so grabbing them is a real greed call.

## Library and run deck

- **Library**: every power-up and gun the player has unlocked. Only used to _offer_ level-up choices.
- **Run deck**: what the player has picked this run. World drops come only from the run deck.
- A run starts with a small starter deck (e.g. medkit plus one gun).
- **Level-up**: pause, offer 3 cards from the library, the player picks one. The pick triggers
  immediately (you never pay for a maybe) and joins the run deck, so it can drop again later.
- **Tiers**: picking a card you already have levels it up (Magnet II, Magnet III). A weapon level is
  a stronger version that replaces the old one in the deck and upgrades the gun in hand. Repeat
  offers are therefore never duds, and a bigger library only means more routes to a strong build.
- Offers lean toward what the deck already has (shared tags, e.g. explosive), so synergies find the
  player.
- Later, buyable between runs: rerolls and banishes for level-up offers.

## Between runs (meta)

- Coins bank at the end of every run, win or lose.
- End of run: pick one free new card to unlock (from three).
- Shop: unlock cards into the library, starting perks, more rerolls and banishes, new arenas.

## Arenas

A handful of hand-made arenas rather than a world map, introduced as levels progress. Each adds one
twist (corridors, more gates, doors that open mid-run), its own chopper landing spots, and can bring
its own zombie types.

## Build order

1. Extraction run: countdown, chopper landing and reaching it, results screen, coin banking, level
   progression (level 2 = same arena, new floor, tougher zombies).
2. XP, level-up picks from the library, run deck feeding drops, tiers.
3. Meta shop and unlocks.
4. Second arena and new zombie types. Later: wave-off push-your-luck, daily seeded run.
