export type CameraShakeStyle = 'crit' | 'heavy_land' | 'impact';

export interface CameraShakeTrigger {
  trauma: number;
  style?: CameraShakeStyle;
  /** Optional world-space horizontal impact direction (normalized internally) */
  dirX?: number;
  dirZ?: number;
  /** Optional distance falloff multiplier in [0, 1] */
  attenuation?: number;
}

export interface CameraShakeOutput {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  rollRad: number;
  fovDelta: number;
}

interface ShakeProfile {
  freq: number;
  decay: number;
  maxPos: number;
  maxRoll: number;
  verticalBias: number;
  impulseScale: number;
  fovPunch: number;
}

const PROFILES: Record<CameraShakeStyle, ShakeProfile> = {
  // Sharp, crisp combat critical hit: snappy recoil along strike vector + micro FOV punch
  crit: {
    freq: 36,
    decay: 2.75,
    maxPos: 0.78,
    maxRoll: 0.022,
    verticalBias: 0.6,
    impulseScale: 0.42,
    fovPunch: -1.35,
  },
  // Heavy seismic landing (Warden arrival/slam, Ruin Charger stomp/crash): strong downward jolt + deep rumble
  heavy_land: {
    freq: 15.5,
    decay: 1.45,
    maxPos: 1.15,
    maxRoll: 0.03,
    verticalBias: 1.35,
    impulseScale: 0.68,
    fovPunch: 0.95,
  },
  // Balanced general combat / spell impact
  impact: {
    freq: 24,
    decay: 1.95,
    maxPos: 0.72,
    maxRoll: 0.018,
    verticalBias: 0.85,
    impulseScale: 0.28,
    fovPunch: -0.45,
  },
};

/**
 * Smooth distance falloff so nearby heavy enemy landings feel seismic while distant
 * impacts across the ruins register as a subtle rumble.
 */
export function computeShakeFalloff(distance: number, maxRange = 28): number {
  if (maxRange <= 0) return 1;
  if (distance <= 3.5) return 1;
  if (distance >= maxRange) return 0;
  const t = 1 - (distance - 3.5) / (maxRange - 3.5);
  return t * t;
}

/**
 * Smooth layered multi-octave harmonic noise (frame-rate independent, zero jitter stutter).
 */
function smoothShakeNoise(t: number, seed: number): number {
  return (
    Math.sin(t + seed) * 0.58 +
    Math.sin(t * 1.73 + seed * 2.17) * 0.28 +
    Math.cos(t * 2.91 - seed * 1.43) * 0.14
  );
}

/**
 * Zero-GC Three.js isometric camera shake controller combining quadratic trauma,
 * style-tuned frequencies (critical hit punch vs heavy enemy landing jolt),
 * decaying directional recoil impulses, subtle roll, and dynamic FOV punch.
 */
export class CameraShakeController {
  private trauma = 0;
  private activeStyle: CameraShakeStyle = 'impact';
  private clock = 0;

  // Exponentially decaying directional / vertical punch impulse
  private impulseX = 0;
  private impulseY = 0;
  private impulseZ = 0;
  private fovPulse = 0;

  getTrauma(): number {
    return this.trauma;
  }

  getActiveStyle(): CameraShakeStyle {
    return this.activeStyle;
  }

  reset(): void {
    this.trauma = 0;
    this.activeStyle = 'impact';
    this.impulseX = 0;
    this.impulseY = 0;
    this.impulseZ = 0;
    this.fovPulse = 0;
  }

  trigger(input: CameraShakeTrigger): void {
    const atten = input.attenuation === undefined ? 1 : Math.max(0, Math.min(1, input.attenuation));
    const effectiveTrauma = Math.max(0, input.trauma) * atten;
    if (effectiveTrauma <= 0.005) return;

    const style: CameraShakeStyle = input.style ?? 'impact';
    const profile = PROFILES[style];

    // Heavy landings and crits override lower-intensity general shake frequency profiles
    if (
      this.trauma < 0.15 ||
      style === 'heavy_land' ||
      (style === 'crit' && this.activeStyle !== 'heavy_land')
    ) {
      this.activeStyle = style;
    }

    this.trauma = Math.min(1, this.trauma + effectiveTrauma);

    // Normalize optional strike/slam horizontal vector
    let nx = input.dirX ?? 0;
    let nz = input.dirZ ?? 0;
    const len = Math.hypot(nx, nz);
    if (len > 0.001) {
      nx /= len;
      nz /= len;
    }

    const impulseMag = Math.min(1, effectiveTrauma) * profile.impulseScale;
    if (style === 'heavy_land') {
      // Sharp downward seismic jolt when a large enemy lands or slams the stone floor
      this.impulseY = Math.max(-1.1, this.impulseY - impulseMag * 1.15);
      this.impulseX += nx * impulseMag * 0.45;
      this.impulseZ += nz * impulseMag * 0.45;
    } else if (style === 'crit') {
      // Crisp directional kick along the critical hit strike vector
      this.impulseX += nx * impulseMag;
      this.impulseZ += nz * impulseMag;
      this.impulseY += impulseMag * 0.22;
    } else {
      this.impulseX += nx * impulseMag * 0.5;
      this.impulseZ += nz * impulseMag * 0.5;
    }

    // Dynamic micro FOV zoom punch (negative tightens slightly on crit; positive widens briefly on slam)
    const nextFov = this.fovPulse + profile.fovPunch * Math.min(1, effectiveTrauma * 1.25);
    this.fovPulse = Math.max(-2.4, Math.min(1.8, nextFov));
  }

  /**
   * Advances shake state and writes offsets into `out` in-place (zero allocations).
   */
  update(dt: number, out: CameraShakeOutput): CameraShakeOutput {
    const safeDt = Math.max(0, Math.min(dt, 0.1));
    const profile = PROFILES[this.activeStyle];

    this.clock += safeDt * profile.freq;

    // Exponentially decay directional recoil impulse & FOV punch
    const impulseDecay = Math.exp(-13.5 * safeDt);
    const fovDecay = Math.exp(-11.0 * safeDt);
    this.impulseX *= impulseDecay;
    this.impulseY *= impulseDecay;
    this.impulseZ *= impulseDecay;
    this.fovPulse *= fovDecay;

    const sq = this.trauma * this.trauma;
    if (sq > 0.0001) {
      const posAmp = sq * profile.maxPos;
      out.offsetX = smoothShakeNoise(this.clock, 1.3) * posAmp + this.impulseX;
      out.offsetY =
        smoothShakeNoise(this.clock * 0.92, 4.7) * posAmp * profile.verticalBias + this.impulseY;
      out.offsetZ = smoothShakeNoise(this.clock * 1.08, 8.9) * posAmp * 0.65 + this.impulseZ;
      out.rollRad = smoothShakeNoise(this.clock * 0.85, 13.1) * sq * profile.maxRoll;
    } else {
      out.offsetX = Math.abs(this.impulseX) > 0.0005 ? this.impulseX : 0;
      out.offsetY = Math.abs(this.impulseY) > 0.0005 ? this.impulseY : 0;
      out.offsetZ = Math.abs(this.impulseZ) > 0.0005 ? this.impulseZ : 0;
      out.rollRad = 0;
    }

    out.fovDelta = Math.abs(this.fovPulse) > 0.005 ? this.fovPulse : 0;

    // Decay trauma smoothly after sampling current frame so instantaneous peak impact is felt
    this.trauma = Math.max(0, this.trauma - safeDt * profile.decay);
    if (this.trauma === 0 && Math.abs(this.impulseY) < 0.001) {
      this.activeStyle = 'impact';
    }

    return out;
  }
}
