import type { Container } from "pixi.js";
import type { Audio, LoopVoice } from "../audio/Audio";
import { ARENA } from "../config/arena";
import { LEVELS, RUN, type LevelDef } from "../config/run";
import type { Horde } from "../entities/Horde";
import type { GameTextures } from "../fx/textures";
import { Chopper } from "./Chopper";

/**
 * countdown: holding out. inbound: the chopper is flying in and setting down. landed: get to the pad.
 * boarded: aboard and lifting off. over: the results card is up.
 */
export type RunPhase = "countdown" | "inbound" | "landed" | "boarded" | "over";

interface Target {
  x: number;
  y: number;
  alive: boolean;
}

/**
 * One extraction run: the countdown on real time, then the chopper on world time, and boarding.
 * Game feeds it the player each frame and reacts to `onBoard` (hide the player) and `onExtracted`
 * (show results). The swarm's ramp reads `progress`.
 */
export class Run {
  readonly level: LevelDef;
  phase: RunPhase = "countdown";
  /** Real seconds survived; stops once the player is down or aboard. */
  elapsed = 0;
  chopper: Chopper | null = null;
  onBoard: (() => void) | null = null;
  onExtracted: (() => void) | null = null;
  private board = 0;
  private departLeft = 0;
  private rotor: LoopVoice | null = null;

  constructor(
    readonly levelIndex: number,
    private readonly tex: GameTextures,
    private readonly horde: Horde,
    private readonly audio: Audio,
    private readonly layers: {
      ground: Container;
      world: Container;
      sky: Container;
    },
  ) {
    this.level = LEVELS[levelIndex];
  }

  /** Read live, so tuning a level's length mid-run takes effect at once. */
  get remaining(): number {
    return Math.max(0, this.level.seconds - this.elapsed);
  }

  /** Share of the countdown gone, 0 to 1. */
  get progress(): number {
    return Math.min(1, this.elapsed / this.level.seconds);
  }

  /** The player can no longer be hurt or act: aboard, or the run is done. */
  get aboard(): boolean {
    return this.phase === "boarded" || this.phase === "over";
  }

  /** Dev shortcut: jump the countdown to `seconds` left. */
  skipTo(seconds: number): void {
    if (this.phase === "countdown")
      this.elapsed = Math.max(this.elapsed, this.level.seconds - seconds);
  }

  update(dt: number, worldDt: number, player: Target): void {
    if (player.alive && !this.aboard) this.elapsed += dt;
    if (this.phase === "countdown" && this.remaining <= RUN.rotorLeadSeconds)
      this.rotor ??= this.audio.loopVoice("chopperLoop", 0);
    if (this.phase === "countdown" && this.remaining <= 0) this.call(player);
    this.chopper?.update(worldDt);
    if (this.phase === "inbound" && this.chopper?.landed) this.phase = "landed";
    if (this.phase === "landed") this.boarding(dt, player);
    if (this.phase === "boarded") {
      this.departLeft -= dt;
      if (this.departLeft <= 0) {
        this.phase = "over";
        this.onExtracted?.();
      }
    }
    this.rotor?.volume(this.rotorVolume(player));
  }

  destroy(): void {
    this.rotor?.stop();
    this.chopper?.destroy();
  }

  /** Time's up: pick a pad, weighted toward the far ones, and send the chopper in. */
  private call(player: Target): void {
    const spots = RUN.landingSpots.map((s) => {
      const x = s.x * ARENA.width;
      const y = s.y * ARENA.height;
      const weight = Math.hypot(x - player.x, y - player.y) ** RUN.farBias;
      return { x, y, weight };
    });
    let r = Math.random() * spots.reduce((sum, s) => sum + s.weight, 0);
    const zone = spots.find((s) => (r -= s.weight) < 0) ?? spots[0];
    this.chopper = new Chopper(this.tex, this.horde, zone, this.layers);
    this.phase = "inbound";
  }

  /** Stand on the pad for `boardSeconds` to climb aboard; stepping off drains it again. */
  private boarding(dt: number, player: Target): void {
    const chopper = this.chopper!;
    const zone = chopper.zone;
    const inside =
      player.alive &&
      Math.hypot(player.x - zone.x, player.y - zone.y) < RUN.zoneRadius;
    this.board = Math.max(0, this.board + (inside ? dt : -2 * dt));
    chopper.boardProgress = Math.min(1, this.board / RUN.boardSeconds);
    if (this.board < RUN.boardSeconds) return;
    this.phase = "boarded";
    this.departLeft = RUN.departSeconds;
    chopper.boardProgress = 0;
    chopper.depart();
    this.audio.play("extracted", { volume: 0.9 });
    this.onBoard?.();
  }

  /** Distant before the call, then by distance to the chopper; the player rides along once aboard. */
  private rotorVolume(player: Target): number {
    const max = RUN.rotorVolume;
    if (!this.chopper)
      return max * 0.25 * (1 - this.remaining / RUN.rotorLeadSeconds);
    if (this.aboard)
      return max * Math.max(0, this.departLeft / RUN.departSeconds);
    const d = Math.hypot(this.chopper.x - player.x, this.chopper.y - player.y);
    return max * Math.max(0.2, 1 - d / RUN.rotorHearing);
  }
}
