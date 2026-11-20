import { ARCHES, OBELISK_DEFS, PILLARS, PORTAL_LOCATION } from './levelData';

export type AmbientTriggerKind = 'stone_crumble' | 'wind_howl' | 'magic_hum';

export interface AmbientAudioZone {
  id: string;
  kind: AmbientTriggerKind;
  x: number;
  z: number;
  radius: number;
  minInterval: number;
  maxInterval: number;
  baseWeight: number;
}

export interface SpatialParams {
  distance: number;
  gain: number;
  pan: number;
}

export interface SpatialAmbientTrigger {
  zoneId: string;
  kind: AmbientTriggerKind;
  x: number;
  z: number;
  gain: number;
  pan: number;
  /** Scales harmonic shimmer for awakened portal or attuned obelisks */
  arcanePower: number;
}

export interface SpatialBedLevels {
  portalGain: number;
  portalPan: number;
  portalAwakened: boolean;
  obeliskGain: number;
  obeliskPan: number;
  windGain: number;
}

export interface AmbientUpdateInput {
  dt: number;
  heroX: number;
  heroZ: number;
  cameraRightX: number;
  cameraRightZ: number;
  portalActive: boolean;
  attunedObeliskIds: readonly string[];
  randomFn?: () => number;
}

export interface AmbientUpdateResult {
  triggers: SpatialAmbientTrigger[];
  beds: SpatialBedLevels;
}

/**
 * Computes distance rolloff and stereo pan projected onto the isometric camera's
 * screen-right axis so ruin landmarks to the left/right of the screen pan accurately.
 */
export function computeSpatialParams(
  listenerX: number,
  listenerZ: number,
  sourceX: number,
  sourceZ: number,
  maxRadius: number,
  cameraRightX = 1,
  cameraRightZ = 0
): SpatialParams {
  const dx = sourceX - listenerX;
  const dz = sourceZ - listenerZ;
  const distance = Math.hypot(dx, dz);
  if (maxRadius <= 0 || distance >= maxRadius) {
    return { distance, gain: 0, pan: 0 };
  }

  const normalized = 1 - distance / maxRadius;
  // Smooth quadratic-like rolloff for natural acoustic falloff
  const gain = normalized * normalized;

  const rightLen = Math.hypot(cameraRightX, cameraRightZ) || 1;
  const rx = cameraRightX / rightLen;
  const rz = cameraRightZ / rightLen;

  // Project relative vector onto screen-right axis normalized by a comfortable stereo width
  const lateral = dx * rx + dz * rz;
  const stereoSpan = Math.max(4.5, maxRadius * 0.6);
  const rawPan = lateral / stereoSpan;
  const pan = Math.max(-0.85, Math.min(0.85, rawPan));

  return { distance, gain, pan };
}

/**
 * Builds the default spatial ambient audio zones anchored directly to the level's
 * crumbling broken pillars, grand windswept arches, Rune Obelisks, and Northern Cyan Portal.
 */
export function createLevelAmbientZones(): AmbientAudioZone[] {
  const zones: AmbientAudioZone[] = [];

  // 1. Echoing stone crumbles around weathered / broken ruin pillars
  const brokenPillars = PILLARS.filter((p) => p.broken);
  for (const p of brokenPillars) {
    zones.push({
      id: `crumble_${p.id}`,
      kind: 'stone_crumble',
      x: p.x,
      z: p.z,
      radius: 12.5,
      minInterval: 8.5,
      maxInterval: 15.5,
      baseWeight: 0.9,
    });
  }

  // 2. Haunting wind howls funneling through the four grand stone archways
  for (const arch of ARCHES) {
    zones.push({
      id: `wind_${arch.id}`,
      kind: 'wind_howl',
      x: arch.x,
      z: arch.z,
      radius: 15.0,
      minInterval: 9.0,
      maxInterval: 16.0,
      baseWeight: 0.85,
    });
  }

  // 3. Distant arcane hum pulses around Western & Eastern Rune Obelisks
  for (const ob of OBELISK_DEFS) {
    zones.push({
      id: `hum_${ob.id}`,
      kind: 'magic_hum',
      x: ob.x,
      z: ob.z,
      radius: 17.5,
      minInterval: 7.0,
      maxInterval: 12.5,
      baseWeight: 1.0,
    });
  }

  // 4. Resonant Northern Cyan Portal arcane pulse
  zones.push({
    id: 'hum_cyan_portal',
    kind: 'magic_hum',
    x: PORTAL_LOCATION.x,
    z: PORTAL_LOCATION.z,
    radius: 25.0,
    minInterval: 6.0,
    maxInterval: 10.5,
    baseWeight: 1.15,
  });

  return zones;
}

/**
 * Pure, stateful scheduler for proximity-driven ambient spatial audio triggers
 * and continuous portal/obelisk/wind beds with anti-spam cooldowns.
 */
export class AmbientTriggerController {
  readonly zones: readonly AmbientAudioZone[];
  private zoneCooldowns = new Map<string, number>();
  private globalCooldown = 1.6;

  constructor(zones: readonly AmbientAudioZone[] = createLevelAmbientZones()) {
    this.zones = zones;
    for (const z of this.zones) {
      // Short initial grace period so entering a ruin triggers quickly on arrival
      this.zoneCooldowns.set(z.id, 1.2);
    }
  }

  reset(): void {
    this.globalCooldown = 1.6;
    for (const z of this.zones) {
      this.zoneCooldowns.set(z.id, 1.2);
    }
  }

  update(input: AmbientUpdateInput): AmbientUpdateResult {
    const {
      dt,
      heroX,
      heroZ,
      cameraRightX,
      cameraRightZ,
      portalActive,
      attunedObeliskIds,
      randomFn = Math.random,
    } = input;

    const triggers: SpatialAmbientTrigger[] = [];
    this.globalCooldown = Math.max(0, this.globalCooldown - dt);

    // 1. Evaluate continuous proximity beds (Cyan Portal hum, nearest Obelisk hum, Arch wind)
    const portalSpatial = computeSpatialParams(
      heroX,
      heroZ,
      PORTAL_LOCATION.x,
      PORTAL_LOCATION.z,
      26.0,
      cameraRightX,
      cameraRightZ
    );
    const portalGain = portalSpatial.gain * (portalActive ? 1.0 : 0.48);

    let bestObeliskGain = 0;
    let bestObeliskPan = 0;
    for (const ob of OBELISK_DEFS) {
      const sp = computeSpatialParams(heroX, heroZ, ob.x, ob.z, 17.5, cameraRightX, cameraRightZ);
      const isAttuned = attunedObeliskIds.includes(ob.id);
      const weighted = sp.gain * (isAttuned ? 0.92 : 0.42);
      if (weighted > bestObeliskGain) {
        bestObeliskGain = weighted;
        bestObeliskPan = sp.pan;
      }
    }

    let archWindPeak = 0;
    for (const arch of ARCHES) {
      const sp = computeSpatialParams(heroX, heroZ, arch.x, arch.z, 15.0, cameraRightX, cameraRightZ);
      if (sp.gain > archWindPeak) archWindPeak = sp.gain;
    }
    // Always maintain a gentle twilight ruin breeze bed that rises near stone archways
    const windGain = Math.min(1, 0.24 + archWindPeak * 0.65);

    // 2. Tick per-zone cooldowns & select at most one high-priority spatial trigger if ready
    let bestCandidate: { zone: AmbientAudioZone; spatial: SpatialParams; score: number; power: number } | null = null;

    for (const zone of this.zones) {
      const prevCd = this.zoneCooldowns.get(zone.id) ?? 0;
      const nextCd = Math.max(0, prevCd - dt);
      this.zoneCooldowns.set(zone.id, nextCd);

      if (nextCd > 0) continue;

      const spatial = computeSpatialParams(
        heroX,
        heroZ,
        zone.x,
        zone.z,
        zone.radius,
        cameraRightX,
        cameraRightZ
      );
      if (spatial.gain < 0.06) continue;

      let power = 0.55;
      if (zone.id === 'hum_cyan_portal') {
        power = portalActive ? 1.0 : 0.58;
      } else if (zone.kind === 'magic_hum') {
        const obId = zone.id.replace('hum_', '');
        power = attunedObeliskIds.includes(obId) ? 0.95 : 0.5;
      }

      const score = spatial.gain * zone.baseWeight * (0.75 + randomFn() * 0.5);
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { zone, spatial, score, power };
      }
    }

    if (this.globalCooldown <= 0 && bestCandidate) {
      const { zone, spatial, power } = bestCandidate;
      triggers.push({
        zoneId: zone.id,
        kind: zone.kind,
        x: zone.x,
        z: zone.z,
        gain: Math.min(1, spatial.gain * zone.baseWeight),
        pan: spatial.pan,
        arcanePower: power,
      });

      const interval = zone.minInterval + randomFn() * (zone.maxInterval - zone.minInterval);
      this.zoneCooldowns.set(zone.id, interval);
      this.globalCooldown = 3.2 + randomFn() * 2.4;
    }

    return {
      triggers,
      beds: {
        portalGain,
        portalPan: portalSpatial.pan,
        portalAwakened: portalActive,
        obeliskGain: bestObeliskGain,
        obeliskPan: bestObeliskPan,
        windGain,
      },
    };
  }
}
