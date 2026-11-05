import { assetUrl } from "../core/assetUrl";
/** Web Audio playback: pooled one-shots with pitch variation, a looping bed, and switchable music. */

const SFX = {
  rocketLaunch: "/audio/sfx/rocket_launch.mp3",
  shotPistol: "/audio/sfx/shot-pistol.mp3",
  shotRifle: "/audio/sfx/gunshot.mp3",
  shotShotgun: "/audio/sfx/shot-shotgun.mp3",
  shotRailgun: "/audio/sfx/rail_charged_zap.mp3",
  shotMinigun: "/audio/sfx/shot-minigun.mp3",
  minigunSpinUp: "/audio/sfx/minigun-spinup.mp3",
  shotMagnum: "/audio/sfx/shot-magnum.mp3",
  shotUzi: "/audio/sfx/shot-uzi.mp3",
  reload: "/audio/sfx/reload.mp3",
  pickupCoin: "/audio/sfx/pickup-coin.mp3",
  pickupGem: "/audio/sfx/pickup-gem.mp3",
  pickupWeapon: "/audio/sfx/pickup-weapon.mp3",
  pickupHealth: "/audio/sfx/pickup-health.mp3",
  playerHurt: "/audio/sfx/player-hurt.mp3",
  powerupPickup: "/audio/sfx/powerup-pickup.mp3",
  powerupEnd: "/audio/sfx/powerup-end.mp3",
  shieldHum: "/audio/sfx/shield-hum.mp3",
  shieldZap: "/audio/sfx/shield-zap.mp3",
  shieldOpen: "/audio/sfx/shield-open.mp3",
  shieldClose: "/audio/sfx/shield-close.mp3",
  decoyArm: "/audio/sfx/decoy-arm.mp3",
  decoyPump: "/audio/sfx/decoy-pump.mp3",
  decoyDeploy: "/audio/sfx/decoy-deploy.mp3",
  decoyHum: "/audio/sfx/decoy-hum.mp3",
  decoySqueak: "/audio/sfx/decoy-squeak.mp3",
  decoyPop: "/audio/sfx/decoy-pop.mp3",
  explosion: "/audio/sfx/explosion.mp3",
  airstrikeWarning: "/audio/sfx/airstrike-warning.mp3",
  airstrikeRoar: "/audio/sfx/airstrike-roar.mp3",
  hypnoSpinUp: "/audio/sfx/hypno-spinup.mp3",
  hypnoShing: "/audio/sfx/hypno-shing.mp3",
  hypnoSlice: "/audio/sfx/hypno-slice.mp3",
  chopperLoop: "/audio/sfx/chopper-loop.mp3",
  rotorChop: "/audio/sfx/rotor-chop.mp3",
  extracted: "/audio/sfx/extracted.mp3",
  zombieHit: "/audio/sfx/zombie-hit.mp3",
  zombieDeath: "/audio/sfx/zombie-death.mp3",
  zombieTear: "/audio/sfx/zombie-tear.mp3",
  zombieHeadPop: "/audio/sfx/zombie-head-pop.mp3",
  groan1: "/audio/sfx/zombie-groan-1.mp3",
  groan2: "/audio/sfx/zombie-groan-2.mp3",
  bruteGroan: "/audio/sfx/zombie-groan-brute.mp3",
  runnerShriek: "/audio/sfx/zombie-shriek-runner.mp3",
  hordeAmbience: "/audio/sfx/horde-ambience.mp3",
  iceBlast: "/audio/sfx/ice-blast.mp3",
  iceShatter: "/audio/sfx/ice-shatter.mp3",
  iceCrack: "/audio/sfx/ice-crack.mp3",
} as const;

export const MUSIC = {
  surfRock: "/audio/music/theme-surf-rock.mp3",
  synthwaveDread: "/audio/music/theme-synthwave-dread.mp3",
  chiptuneFrenzy: "/audio/music/theme-chiptune-frenzy.mp3",
} as const;

export type SfxName = keyof typeof SFX;

const MUSIC_VOLUME = 0.45;
/** Seconds for a duck to settle. */
const DUCK_SECONDS = 0.4;
export type MusicName = keyof typeof MUSIC;

export interface PlayOptions {
  volume?: number;
  /** Playback rate multiplier. 1 = as recorded. */
  pitch?: number;
  /** Stereo position, -1 left to 1 right, or a sweep across it, e.g. a plane flying over. */
  pan?: number | PanSweep;
}

/** A looping sound whose level can follow something, e.g. a chopper getting closer. */
export interface LoopVoice {
  stop(): void;
  /** Eases to the new level over a few frames, so per-frame updates don't zipper. */
  volume(v: number): void;
}

export interface PanSweep {
  from: number;
  to: number;
  seconds: number;
}

export class Audio {
  private readonly ctx = new AudioContext();
  private readonly sfxBus = this.ctx.createGain();
  private readonly musicBus = this.ctx.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private music: AudioBufferSourceNode | null = null;
  private musicName: MusicName | null = null;
  /** Playback rate on top of each sound's own pitch, e.g. pitched down in slow motion. */
  private sfxRate = 1;
  private musicRate = 1;
  /** Every sound playing and the pitch it asked for, so a rate change reaches sounds already going. */
  private readonly playing = new Map<
    AudioBufferSourceNode,
    { pitch: number; music: boolean }
  >();

  constructor() {
    this.sfxBus.gain.value = 0.8;
    this.musicBus.gain.value = MUSIC_VOLUME;
    this.sfxBus.connect(this.ctx.destination);
    this.musicBus.connect(this.ctx.destination);
    // Browsers keep the context suspended until the page gets a real user gesture.
    const unlock = () => {
      void this.ctx.resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  get currentMusic(): MusicName | null {
    return this.musicName;
  }

  async load(): Promise<void> {
    const entries = [...Object.entries(SFX), ...Object.entries(MUSIC)];
    await Promise.all(
      entries.map(async ([name, url]) => {
        const data = await fetch(assetUrl(url)).then((r) => r.arrayBuffer());
        this.buffers.set(name, await this.ctx.decodeAudioData(data));
      }),
    );
  }

  play(name: SfxName, opts: PlayOptions = {}): void {
    this.start(name, this.sfxBus, opts, false);
  }

  /** Start a looping bed at the given volume. Returns a stop function. */
  loop(name: SfxName, volume: number): () => void {
    const voice = this.loopVoice(name, volume);
    return () => voice.stop();
  }

  /** A loop with a volume control. */
  loopVoice(name: SfxName, volume: number): LoopVoice {
    const node = this.start(name, this.sfxBus, { volume }, true);
    return {
      stop: () => node?.source.stop(),
      volume: (v) =>
        node?.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05),
    };
  }

  playMusic(name: MusicName): void {
    if (this.musicName === name) return;
    this.music?.stop();
    this.music = this.start(name, this.musicBus, {}, true)?.source ?? null;
    this.musicName = name;
  }

  /** Scale the music bed, e.g. 0.25 on death. 1 restores it. Eases over DUCK_SECONDS. */
  duckMusic(factor: number): void {
    this.musicBus.gain.setTargetAtTime(
      MUSIC_VOLUME * factor,
      this.ctx.currentTime,
      DUCK_SECONDS / 3,
    );
  }

  /** Slow (below 1) or speed up every sound and the music, including what is already playing. */
  setRate(sfx: number, music: number): void {
    if (sfx === this.sfxRate && music === this.musicRate) return;
    this.sfxRate = sfx;
    this.musicRate = music;
    for (const [source, s] of this.playing)
      source.playbackRate.value = s.pitch * (s.music ? music : sfx);
  }

  stopMusic(): void {
    this.music?.stop();
    this.music = null;
    this.musicName = null;
  }

  private start(
    name: string,
    bus: GainNode,
    opts: PlayOptions,
    loop: boolean,
  ): { source: AudioBufferSourceNode; gain: GainNode } | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const pitch = opts.pitch ?? 1;
    const music = bus === this.musicBus;
    source.playbackRate.value = pitch * (music ? this.musicRate : this.sfxRate);
    this.playing.set(source, { pitch, music });
    source.onended = () => this.playing.delete(source);
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    source.connect(gain);
    const pan = opts.pan;
    if (pan === undefined) gain.connect(bus);
    else {
      const panner = this.ctx.createStereoPanner();
      if (typeof pan === "number") panner.pan.value = pan;
      else {
        const now = this.ctx.currentTime;
        panner.pan.setValueAtTime(pan.from, now);
        panner.pan.linearRampToValueAtTime(pan.to, now + pan.seconds);
      }
      gain.connect(panner).connect(bus);
    }
    source.start();
    return { source, gain };
  }
}
