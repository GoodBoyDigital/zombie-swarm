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
    width: 10,
    height: 4.5,
    color: 0xc9a048,
    baseColor: 0x8a6a2c,
  },
  pistol: {
    id: "pistol",
    width: 7.5,
    height: 4.5,
    color: 0xc9a048,
    baseColor: 0x8a6a2c,
  },
  shotgun: {
    id: "shotgun",
    width: 12,
    height: 6,
    color: 0xc43a2e,
    baseColor: 0xc9a048,
  },
} as const satisfies Record<string, CasingDef>;

export type CasingId = keyof typeof CASINGS;
