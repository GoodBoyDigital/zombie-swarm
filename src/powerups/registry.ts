import type { EffectDef, EffectId } from "../config/powerups";
import { airstrike } from "./effects/airstrike";
import { equip } from "./effects/equip";
import { heal } from "./effects/heal";
import { magnet } from "./effects/magnet";
import { nuke } from "./effects/nuke";
import { power } from "./effects/power";
import { portal } from "./effects/portal";
import { shield } from "./effects/shield";
import { speed } from "./effects/speed";
import type { PowerupEffect } from "./PowerupContext";

/** One handler per PowerupDef `effect`, like SHOT_HANDLERS. Add a new power-up's handler here. */
export const POWERUP_EFFECTS: { [K in EffectId]: PowerupEffect<EffectDef<K>> } =
  {
    magnet,
    speed,
    power,
    equip,
    heal,
    nuke,
    shield,
    portal,
    airstrike,
  };
