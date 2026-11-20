import { SpatialAmbientTrigger, SpatialBedLevels } from './ambientAudio';

export type SoundEffectName =
  | 'slash'
  | 'cleave'
  | 'dash'
  | 'sigil_cast'
  | 'sigil_boom'
  | 'beam'
  | 'hit'
  | 'kill'
  | 'player_hurt'
  | 'obelisk'
  | 'warden_spawn'
  | 'portal_open'
  | 'victory'
  | 'defeat'
  | 'bolt'
  | 'telegraph';

interface ContinuousBeds {
  magicGain: GainNode;
  magicFilter: BiquadFilterNode;
  magicPan: StereoPannerNode;
  magicOscA: OscillatorNode;
  magicOscB: OscillatorNode;
  magicOscC: OscillatorNode;
  windGain: GainNode;
  windFilter: BiquadFilterNode;
  windSource: AudioBufferSourceNode;
}

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private muted = false;
  private echoInput: GainNode | null = null;
  private beds: ContinuousBeds | null = null;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(mute: boolean): void {
    this.muted = mute;
    if (mute) {
      this.silenceBeds();
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.silenceBeds();
    }
    return this.muted;
  }

  /**
   * Unlocks Web Audio on explicit user gesture so spatial ambient beds & triggers can start cleanly.
   */
  unlock(): void {
    if (this.muted) return;
    this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      this.ctx = new AudioCtor();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Twin-tap stereo cross-feedback delay line simulating echoing mossy stone halls.
   */
  private ensureEchoBus(ctx: AudioContext): GainNode {
    if (this.echoInput) return this.echoInput;

    const input = ctx.createGain();
    input.gain.value = 1.0;

    const delayL = ctx.createDelay(1.0);
    const delayR = ctx.createDelay(1.0);
    delayL.delayTime.value = 0.21;
    delayR.delayTime.value = 0.31;

    const dampL = ctx.createBiquadFilter();
    dampL.type = 'lowpass';
    dampL.frequency.value = 1550;

    const dampR = ctx.createBiquadFilter();
    dampR.type = 'lowpass';
    dampR.frequency.value = 1400;

    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.36;
    fbR.gain.value = 0.34;

    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.42;

    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.65;
    panR.pan.value = 0.65;

    // Cross-coupled stereo stone reflection loop
    input.connect(delayL);
    input.connect(delayR);

    delayL.connect(dampL);
    dampL.connect(fbL);
    fbL.connect(delayR);
    dampL.connect(panL);
    panL.connect(wetGain);

    delayR.connect(dampR);
    dampR.connect(fbR);
    fbR.connect(delayL);
    dampR.connect(panR);
    panR.connect(wetGain);

    wetGain.connect(ctx.destination);
    this.echoInput = input;
    return input;
  }

  private ensureContinuousBeds(ctx: AudioContext): ContinuousBeds {
    if (this.beds) return this.beds;

    // 1. Resonant Portal / Obelisk Arcane Harmonic Hum
    const magicGain = ctx.createGain();
    magicGain.gain.value = 0.0001;

    const magicFilter = ctx.createBiquadFilter();
    magicFilter.type = 'lowpass';
    magicFilter.frequency.value = 280;
    magicFilter.Q.value = 2.0;

    const magicPan = ctx.createStereoPanner();
    magicPan.pan.value = 0;

    const magicOscA = ctx.createOscillator();
    magicOscA.type = 'sine';
    magicOscA.frequency.value = 73.42; // D2 fundamental

    const magicOscB = ctx.createOscillator();
    magicOscB.type = 'triangle';
    magicOscB.frequency.value = 110.2; // slightly detuned A2 fifth

    const magicOscC = ctx.createOscillator();
    magicOscC.type = 'sine';
    magicOscC.frequency.value = 219.6; // shimmering A3 overtone

    const subGainA = ctx.createGain();
    subGainA.gain.value = 0.55;
    const subGainB = ctx.createGain();
    subGainB.gain.value = 0.28;
    const subGainC = ctx.createGain();
    subGainC.gain.value = 0.16;

    magicOscA.connect(subGainA);
    magicOscB.connect(subGainB);
    magicOscC.connect(subGainC);
    subGainA.connect(magicFilter);
    subGainB.connect(magicFilter);
    subGainC.connect(magicFilter);

    magicFilter.connect(magicGain);
    magicGain.connect(magicPan);
    magicPan.connect(ctx.destination);

    magicOscA.start();
    magicOscB.start();
    magicOscC.start();

    // 2. Soft Looping Pink-Filtered Twilight Breeze Bed
    const loopLen = Math.floor(ctx.sampleRate * 3.0);
    const windBuf = ctx.createBuffer(1, loopLen, ctx.sampleRate);
    const data = windBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < loopLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      // Gentle loop edge crossfade to prevent clicks
      const edge = Math.min(1, Math.min(i, loopLen - 1 - i) / (ctx.sampleRate * 0.15));
      data[i] = (b0 + b1 + b2) * 0.35 * edge;
    }

    const windSource = ctx.createBufferSource();
    windSource.buffer = windBuf;
    windSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 0.85;

    const windGain = ctx.createGain();
    windGain.gain.value = 0.0001;

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSource.start();

    this.beds = {
      magicGain,
      magicFilter,
      magicPan,
      magicOscA,
      magicOscB,
      magicOscC,
      windGain,
      windFilter,
      windSource,
    };
    return this.beds;
  }

  private silenceBeds(): void {
    if (!this.ctx || !this.beds) return;
    const now = this.ctx.currentTime;
    this.beds.magicGain.gain.setTargetAtTime(0.0001, now, 0.12);
    this.beds.windGain.gain.setTargetAtTime(0.0001, now, 0.12);
  }

  /**
   * Smoothly modulates continuous proximity-based magic hum & wind beds.
   */
  updateSpatialBeds(levels: SpatialBedLevels, active: boolean): void {
    if (this.muted || !active || !this.ctx || this.ctx.state !== 'running') {
      this.silenceBeds();
      return;
    }

    const beds = this.ensureContinuousBeds(this.ctx);
    const now = this.ctx.currentTime;

    // Blend portal & nearest obelisk proximity into the spatial magic drone
    const usePortal = levels.portalGain >= levels.obeliskGain;
    const dominantGain = Math.max(levels.portalGain, levels.obeliskGain);
    const dominantPan = usePortal ? levels.portalPan : levels.obeliskPan;

    const targetMagicGain = Math.max(0.0001, dominantGain * (levels.portalAwakened && usePortal ? 0.085 : 0.055));
    const targetMagicCutoff = 220 + dominantGain * (levels.portalAwakened && usePortal ? 520 : 280);
    const targetWindGain = Math.max(0.0001, levels.windGain * 0.036);
    const targetWindFreq = 260 + levels.windGain * 210;

    beds.magicGain.gain.setTargetAtTime(targetMagicGain, now, 0.25);
    beds.magicFilter.frequency.setTargetAtTime(targetMagicCutoff, now, 0.25);
    beds.magicPan.pan.setTargetAtTime(dominantPan, now, 0.2);

    beds.windGain.gain.setTargetAtTime(targetWindGain, now, 0.35);
    beds.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.35);
  }

  /**
   * Plays a spatialized echoing one-shot ambient sound triggered by proximity to ruins or the portal.
   */
  playSpatialAmbient(trigger: SpatialAmbientTrigger): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const echo = this.ensureEchoBus(ctx);
    const now = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, trigger.pan)), now);
    panner.connect(ctx.destination);
    panner.connect(echo);

    const vol = Math.max(0.02, Math.min(1, trigger.gain));

    if (trigger.kind === 'stone_crumble') {
      // Deep shifting masonry thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(98, now);
      thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.32);
      thudGain.gain.setValueAtTime(0.0001, now);
      thudGain.gain.linearRampToValueAtTime(0.075 * vol, now + 0.02);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      thudOsc.connect(thudGain);
      thudGain.connect(panner);
      thudOsc.start(now);
      thudOsc.stop(now + 0.38);

      // Cascading pebbles & crumbling gravel bursts echoing off ruin walls
      const grains = 4;
      for (let i = 0; i < grains; i++) {
        const delay = i * 0.11 + Math.random() * 0.07;
        const dur = 0.14 + Math.random() * 0.12;
        const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let s = 0; s < sampleCount; s++) {
          ch[s] = (Math.random() * 2 - 1) * Math.exp(-s / (sampleCount * 0.35));
        }

        const src = ctx.createBufferSource();
        src.buffer = buf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(920 - i * 165 + Math.random() * 140, now + delay);
        filter.Q.setValueAtTime(2.4, now + delay);

        const g = ctx.createGain();
        const peak = (0.08 - i * 0.014) * vol;
        g.gain.setValueAtTime(0.0001, now + delay);
        g.gain.linearRampToValueAtTime(Math.max(0.004, peak), now + delay + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);

        src.connect(filter);
        filter.connect(g);
        g.connect(panner);
        src.start(now + delay);
      }
      return;
    }

    if (trigger.kind === 'wind_howl') {
      const dur = 2.3;
      const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        ch[i] = Math.random() * 2 - 1;
      }

      const src = ctx.createBufferSource();
      src.buffer = buf;

      // Sweeping resonant wind whistle through mossy stone arches
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.setValueAtTime(8.5, now);
      bp.frequency.setValueAtTime(240, now);
      bp.frequency.exponentialRampToValueAtTime(540 + Math.random() * 90, now + dur * 0.42);
      bp.frequency.exponentialRampToValueAtTime(205, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.068 * vol, now + dur * 0.38);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(panner);
      src.start(now);

      // Subtle eerie harmonic flute-like overtone
      const whistle = ctx.createOscillator();
      const wGain = ctx.createGain();
      whistle.type = 'sine';
      whistle.frequency.setValueAtTime(310, now);
      whistle.frequency.exponentialRampToValueAtTime(420, now + dur * 0.45);
      whistle.frequency.exponentialRampToValueAtTime(275, now + dur);
      wGain.gain.setValueAtTime(0.0001, now);
      wGain.gain.linearRampToValueAtTime(0.015 * vol, now + dur * 0.4);
      wGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      whistle.connect(wGain);
      wGain.connect(panner);
      whistle.start(now);
      whistle.stop(now + dur + 0.05);
      return;
    }

    if (trigger.kind === 'magic_hum') {
      // Distant resonant cyan arcane chord swell echoing from the portal or obelisk
      const dur = 2.0;
      const power = 0.55 + trigger.arcanePower * 0.65;
      const freqs = [146.83, 220.0, 440.0 * (trigger.arcanePower > 0.85 ? 1.5 : 1.0)];

      for (let i = 0; i < freqs.length; i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = i === 1 ? 'triangle' : 'sine';
        const f = freqs[i] * (0.996 + i * 0.004);
        osc.frequency.setValueAtTime(f, now);
        osc.frequency.exponentialRampToValueAtTime(f * 1.025, now + dur * 0.5);
        osc.frequency.exponentialRampToValueAtTime(f * 0.99, now + dur);

        const peak = (i === 0 ? 0.042 : i === 1 ? 0.028 : 0.016) * vol * power;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(peak, now + dur * 0.36);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(g);
        g.connect(panner);
        osc.start(now);
        osc.stop(now + dur + 0.04);
      }
    }
  }

  private randPitch(base: number): number {
    return base * (0.92 + Math.random() * 0.16);
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainPeak: number,
    delay = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.02, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playNoise(duration: number, filterFreq: number, gainPeak: number, delay = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.5));
    }

    const now = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  play(name: SoundEffectName): void {
    if (this.muted) return;
    switch (name) {
      case 'slash':
        this.playNoise(0.11, this.randPitch(1400), 0.14);
        this.playTone(this.randPitch(340), 120, 0.1, 'triangle', 0.09);
        break;
      case 'cleave':
        this.playNoise(0.18, this.randPitch(950), 0.22);
        this.playTone(this.randPitch(440), 110, 0.2, 'sawtooth', 0.12);
        this.playTone(this.randPitch(880), 420, 0.16, 'sine', 0.08);
        break;
      case 'dash':
        this.playNoise(0.16, 2200, 0.16);
        this.playTone(280, 960, 0.14, 'sine', 0.11);
        break;
      case 'sigil_cast':
        this.playTone(420, 680, 0.26, 'sine', 0.1);
        this.playTone(630, 1020, 0.26, 'triangle', 0.06, 0.04);
        break;
      case 'sigil_boom':
        this.playNoise(0.28, 600, 0.22);
        this.playTone(240, 72, 0.3, 'sawtooth', 0.14);
        this.playTone(760, 1140, 0.25, 'sine', 0.09);
        break;
      case 'beam':
        this.playNoise(0.45, 820, 0.26);
        this.playTone(180, 58, 0.45, 'sawtooth', 0.18);
        this.playTone(640, 1280, 0.32, 'sine', 0.11);
        this.playTone(960, 480, 0.4, 'triangle', 0.08, 0.08);
        break;
      case 'hit':
        this.playNoise(0.08, this.randPitch(720), 0.15);
        this.playTone(this.randPitch(175), 68, 0.09, 'square', 0.08);
        break;
      case 'kill':
        this.playNoise(0.2, 520, 0.2);
        this.playTone(220, 62, 0.24, 'sawtooth', 0.13);
        this.playTone(540, 810, 0.18, 'sine', 0.07, 0.05);
        break;
      case 'player_hurt':
        this.playTone(150, 55, 0.22, 'sawtooth', 0.18);
        this.playNoise(0.14, 380, 0.16);
        break;
      case 'bolt':
        this.playTone(this.randPitch(780), 340, 0.16, 'sine', 0.09);
        break;
      case 'telegraph':
        this.playTone(this.randPitch(320), 560, 0.22, 'triangle', 0.07);
        break;
      case 'obelisk':
        this.playTone(330, 330, 0.45, 'sine', 0.11, 0);
        this.playTone(495, 495, 0.5, 'sine', 0.11, 0.12);
        this.playTone(660, 880, 0.65, 'triangle', 0.12, 0.24);
        break;
      case 'warden_spawn':
        this.playTone(130, 55, 0.75, 'sawtooth', 0.18, 0);
        this.playTone(195, 92, 0.65, 'triangle', 0.12, 0.14);
        this.playNoise(0.55, 440, 0.2, 0.06);
        break;
      case 'portal_open':
        this.playTone(392, 523, 0.5, 'sine', 0.12, 0);
        this.playTone(523, 784, 0.6, 'sine', 0.12, 0.15);
        this.playTone(784, 1046, 0.7, 'triangle', 0.1, 0.3);
        break;
      case 'victory':
        this.playTone(440, 440, 0.35, 'triangle', 0.12, 0);
        this.playTone(554, 554, 0.35, 'triangle', 0.12, 0.14);
        this.playTone(659, 659, 0.4, 'triangle', 0.12, 0.28);
        this.playTone(880, 880, 0.8, 'sine', 0.14, 0.42);
        break;
      case 'defeat':
        this.playTone(293, 220, 0.45, 'sawtooth', 0.12, 0);
        this.playTone(220, 146, 0.65, 'triangle', 0.12, 0.26);
        break;
    }
  }

  dispose(): void {
    if (this.beds) {
      try {
        this.beds.magicOscA.stop();
        this.beds.magicOscB.stop();
        this.beds.magicOscC.stop();
        this.beds.windSource.stop();
      } catch {
        // Ignore already-stopped nodes during teardown
      }
      this.beds = null;
    }
    this.echoInput = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
