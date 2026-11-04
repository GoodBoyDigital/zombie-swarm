import type { EffectDef, EffectId } from "../config/powerups";
import { equip } from "./effects/equip";
import { heal } from "./effects/heal";
import { modifiers } from "./effects/modifiers";
import { nuke } from "./effects/nuke";
import type { PowerupEffect } from "./PowerupContext";

/** One handler per PowerupDef `effect`, like SHOT_HANDLERS. Add a new power-up's handler here. */
export const POWERUP_EFFECTS: { [K in EffectId]: PowerupEffect<EffectDef<K>> } =
  {
    modifiers,
    equip,
    heal,
    nuke,
  };
