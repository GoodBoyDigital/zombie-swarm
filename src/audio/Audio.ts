/** Web Audio playback: pooled one-shots with pitch variation, a looping bed, and switchable music. */

const SFX = {
  shotPistol: "/audio/sfx/shot-pistol.mp3",
  shotRifle: "/audio/sfx/gunshot.mp3",
  shotShotgun: "/audio/sfx/shot-shotgun.mp3",
  shotRailgun: "/audio/sfx/shot-railgun.mp3",
  shotMinigun: "/audio/sfx/shot-minigun.mp3",
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
  zombieHit: "/audio/sfx/zombie-hit.mp3",
  zombieDeath: "/audio/sfx/zombie-death.mp3",
  groan1: "/audio/sfx/zombie-groan-1.mp3",
  groan2: "/audio/sfx/zombie-groan-2.mp3",
  bruteGroan: "/audio/sfx/zombie-groan-brute.mp3",
  runnerShriek: "/audio/sfx/zombie-shriek-runner.mp3",
  hordeAmbience: "/audio/sfx/horde-ambience.mp3",
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
}

export class Audio {
  private readonly ctx = new AudioContext();
  private readonly sfxBus = this.ctx.createGain();
  private readonly musicBus = this.ctx.createGain();
  private readonly buffers = new Map<string, AudioBuffer>();
  private music: AudioBufferSourceNode | null = null;
  private musicName: MusicName | null = null;

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
        const data = await fetch(url).then((r) => r.arrayBuffer());
        this.buffers.set(name, await this.ctx.decodeAudioData(data));
      }),
    );
  }

  play(name: SfxName, opts: PlayOptions = {}): void {
    this.start(name, this.sfxBus, opts, false);
  }

  /** Start a looping bed at the given volume. Returns a stop function. */
  loop(name: SfxName, volume: number): () => void {
    const source = this.start(name, this.sfxBus, { volume }, true);
    return () => source?.stop();
  }

  playMusic(name: MusicName): void {
    if (this.musicName === name) return;
    this.music?.stop();
    this.music = this.start(name, this.musicBus, {}, true);
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
  ): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = opts.pitch ?? 1;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    source.connect(gain).connect(bus);
    source.start();
    return source;
  }
}
