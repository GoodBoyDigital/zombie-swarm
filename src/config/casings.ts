/** Spent shell casings, one shape per ammunition family. Sizes are in world pixels. */
export interface CasingDef {
  id: string;
  width: number;
  height: number;
  /** Body colour; the base (rim) is drawn a shade darker. */
  color: number;
  /** Separate base colour, used for shotgun shells where the hull isn't brass. */
  baseColor: number;
}

export const CASINGS = {
  rifle: {
    id: "rifle",
    width: 7,
    height: 3,
    color: 0xd8a84a,
    baseColor: 0x9c7430,
  },
  pistol: {
    id: "pistol",
    width: 5,
    height: 3,
    color: 0xd8a84a,
    baseColor: 0x9c7430,
  },
  shotgun: {
    id: "shotgun",
    width: 9,
    height: 4,
    color: 0xc43a2e,
    baseColor: 0xd8a84a,
  },
} as const satisfies Record<string, CasingDef>;

export type CasingId = keyof typeof CASINGS;
