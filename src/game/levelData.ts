import { EnemyArchetype, Vec2 } from './types';

export interface CircleCollider {
  id: string;
  x: number;
  z: number;
  radius: number;
  kind: 'pillar' | 'obelisk' | 'boulder' | 'portal_post';
}

export interface BoxCollider {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  kind: 'wall' | 'ruin_block';
}

export interface WalkwayRect {
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  rotation?: number;
}

export interface ArchPlacement {
  id: string;
  x: number;
  z: number;
  rotationY: number;
  span: number;
  height: number;
}

export interface PillarPlacement {
  id: string;
  x: number;
  z: number;
  height: number;
  radius: number;
  broken: boolean;
  leanX?: number;
  leanZ?: number;
}

export interface ObeliskDef {
  id: string;
  label: string;
  x: number;
  z: number;
  guardZoneId: string;
}

export interface EnemySpawnDef {
  id: string;
  archetype: EnemyArchetype;
  x: number;
  z: number;
  zoneId: string;
}

export const LEVEL_PLAYABLE_RADIUS = 34;

export const HERO_SPAWN: Vec2 = { x: 0, z: 22 };

export const PORTAL_LOCATION: Vec2 = { x: 0, z: -21 };

export const OBELISK_DEFS: readonly ObeliskDef[] = [
  {
    id: 'obelisk_west',
    label: 'Western Waystone',
    x: -17,
    z: 2,
    guardZoneId: 'west_courtyard',
  },
  {
    id: 'obelisk_east',
    label: 'Eastern Waystone',
    x: 17,
    z: 0,
    guardZoneId: 'east_colonnade',
  },
] as const;

/**
 * Walkways & courtyards carved through the overgrown ruins.
 * Rendered as raised mossy flagstone slabs (offset by y >= 0.04 from earth floor).
 */
export const WALKWAYS: readonly WalkwayRect[] = [
  // South Spawn Plaza (Courtyard of Awakening)
  { x: 0, z: 22, width: 12, depth: 10, y: 0.06 },
  // Central North-South Causeway
  { x: 0, z: 9.5, width: 6.5, depth: 15, y: 0.06 },
  // Central Crossing Hub
  { x: 0, z: 1, width: 11, depth: 10, y: 0.06 },
  // Broken West Walkway -> Western Archway
  { x: -9.5, z: 2, width: 10, depth: 5.2, y: 0.06 },
  // Western Waystone Terrace
  { x: -17, z: 2, width: 11, depth: 11, y: 0.08 },
  // Broken East Walkway -> Eastern Colonnade
  { x: 9.5, z: 0.5, width: 10, depth: 5.2, y: 0.06 },
  // Eastern Waystone Terrace
  { x: 17, z: 0, width: 11, depth: 11, y: 0.08 },
  // Northern Causeway -> Sanctum Portal
  { x: 0, z: -9.5, width: 6.8, depth: 12.5, y: 0.06 },
  // Northern Sanctum Plaza
  { x: 0, z: -19.5, width: 16, depth: 12, y: 0.08 },
];

/**
 * Grand mossy stone arches framing key sightlines (wide open spans >= 5.2m).
 */
export const ARCHES: readonly ArchPlacement[] = [
  // Entry arch right ahead of spawn — frames central hub & distant portal!
  { id: 'arch_south_gate', x: 0, z: 14.5, rotationY: 0, span: 6.4, height: 6.2 },
  // West Wing Archway
  { id: 'arch_west_entry', x: -10, z: 2, rotationY: Math.PI / 2, span: 5.6, height: 5.6 },
  // East Wing Archway
  { id: 'arch_east_entry', x: 10, z: 0.5, rotationY: Math.PI / 2, span: 5.6, height: 5.6 },
  // Sanctum Approach Arch
  { id: 'arch_north_gate', x: 0, z: -12.5, rotationY: 0, span: 6.8, height: 6.8 },
];

/**
 * Standing and broken stone pillars framing plazas & walkways.
 * Carefully placed outside central walkways so corridors stay >= 5m wide.
 */
export const PILLARS: readonly PillarPlacement[] = [
  // South Plaza flanking pillars
  { id: 'p_s1', x: -6.2, z: 25.5, height: 4.8, radius: 0.72, broken: false },
  { id: 'p_s2', x: 6.2, z: 25.5, height: 3.4, radius: 0.72, broken: true, leanX: 0.06 },
  { id: 'p_s3', x: -6.2, z: 18.2, height: 4.2, radius: 0.72, broken: true },
  { id: 'p_s4', x: 6.2, z: 18.2, height: 5.0, radius: 0.72, broken: false },

  // Central Hub corners
  { id: 'p_c1', x: -6.0, z: 6.2, height: 5.4, radius: 0.78, broken: false },
  { id: 'p_c2', x: 6.0, z: 6.2, height: 3.1, radius: 0.78, broken: true, leanZ: -0.05 },
  { id: 'p_c3', x: -6.0, z: -4.2, height: 3.7, radius: 0.78, broken: true },
  { id: 'p_c4', x: 6.0, z: -4.2, height: 5.5, radius: 0.78, broken: false },

  // West Terrace colonnade
  { id: 'p_w1', x: -22.2, z: 7.0, height: 4.8, radius: 0.72, broken: false },
  { id: 'p_w2', x: -22.2, z: -3.2, height: 3.3, radius: 0.72, broken: true, leanX: -0.07 },
  { id: 'p_w3', x: -13.5, z: 7.4, height: 4.0, radius: 0.68, broken: true },
  { id: 'p_w4', x: -13.5, z: -3.4, height: 4.9, radius: 0.68, broken: false },

  // East Colonnade
  { id: 'p_e1', x: 22.2, z: 5.4, height: 5.1, radius: 0.72, broken: false },
  { id: 'p_e2', x: 22.2, z: -5.2, height: 3.5, radius: 0.72, broken: true, leanZ: 0.06 },
  { id: 'p_e3', x: 13.5, z: 5.8, height: 3.8, radius: 0.68, broken: true },
  { id: 'p_e4', x: 13.5, z: -5.4, height: 5.0, radius: 0.68, broken: false },

  // Northern Sanctum Plaza framing pillars
  { id: 'p_n1', x: -8.2, z: -15.5, height: 6.2, radius: 0.85, broken: false },
  { id: 'p_n2', x: 8.2, z: -15.5, height: 6.2, radius: 0.85, broken: false },
  { id: 'p_n3', x: -8.6, z: -23.0, height: 4.5, radius: 0.82, broken: true },
  { id: 'p_n4', x: 8.6, z: -23.0, height: 5.8, radius: 0.82, broken: false },
];

export const INITIAL_ENEMY_SPAWNS: readonly EnemySpawnDef[] = [
  // Central Crossroads Skirmish (far enough from spawn so idle player is safe)
  { id: 'e_mid_1', archetype: 'stalker', x: -2.6, z: 4.5, zoneId: 'central_hub' },
  { id: 'e_mid_2', archetype: 'stalker', x: 2.8, z: 3.0, zoneId: 'central_hub' },

  // Western Waystone Guards (2 Stalkers + 1 Ranged Rift Wisp)
  { id: 'e_west_1', archetype: 'stalker', x: -15.0, z: 4.8, zoneId: 'west_courtyard' },
  { id: 'e_west_2', archetype: 'stalker', x: -14.8, z: -1.4, zoneId: 'west_courtyard' },
  { id: 'e_west_3', archetype: 'wisp', x: -19.5, z: 1.5, zoneId: 'west_courtyard' },

  // Eastern Colonnade Guards (1 Heavy Golem Charger + 1 Rift Wisp + 1 Stalker)
  { id: 'e_east_1', archetype: 'charger', x: 15.5, z: 2.4, zoneId: 'east_colonnade' },
  { id: 'e_east_2', archetype: 'wisp', x: 19.6, z: -2.2, zoneId: 'east_colonnade' },
  { id: 'e_east_3', archetype: 'stalker', x: 14.5, z: -2.8, zoneId: 'east_colonnade' },

  // Northern Sanctum Vanguard (1 Charger + 1 Wisp near North Gate)
  { id: 'e_north_1', archetype: 'charger', x: -3.2, z: -15.5, zoneId: 'north_sanctum' },
  { id: 'e_north_2', archetype: 'wisp', x: 3.8, z: -16.2, zoneId: 'north_sanctum' },
];

export function buildLevelColliders(): {
  circles: CircleCollider[];
  boxes: BoxCollider[];
} {
  const circles: CircleCollider[] = [];
  const boxes: BoxCollider[] = [];

  for (const p of PILLARS) {
    circles.push({
      id: p.id,
      x: p.x,
      z: p.z,
      radius: p.radius + 0.12,
      kind: 'pillar',
    });
  }

  // Archway columns act as solid pillar colliders while leaving the center span wide open
  for (const arch of ARCHES) {
    const halfSpan = arch.span / 2;
    const cos = Math.cos(arch.rotationY);
    const sin = Math.sin(arch.rotationY);
    const leftX = arch.x - cos * halfSpan;
    const leftZ = arch.z + sin * halfSpan;
    const rightX = arch.x + cos * halfSpan;
    const rightZ = arch.z - sin * halfSpan;
    circles.push({
      id: `${arch.id}_left`,
      x: leftX,
      z: leftZ,
      radius: 0.92,
      kind: 'pillar',
    });
    circles.push({
      id: `${arch.id}_right`,
      x: rightX,
      z: rightZ,
      radius: 0.92,
      kind: 'pillar',
    });
  }

  // Obelisk pedestals (compact center core so hero can stand right beside them in the rune circle)
  for (const ob of OBELISK_DEFS) {
    circles.push({
      id: ob.id,
      x: ob.x,
      z: ob.z,
      radius: 0.95,
      kind: 'obelisk',
    });
  }

  // Portal flanking monolith posts (center portal opening is walkable to enter when active)
  circles.push({
    id: 'portal_post_left',
    x: PORTAL_LOCATION.x - 3.3,
    z: PORTAL_LOCATION.z,
    radius: 1.0,
    kind: 'portal_post',
  });
  circles.push({
    id: 'portal_post_right',
    x: PORTAL_LOCATION.x + 3.3,
    z: PORTAL_LOCATION.z,
    radius: 1.0,
    kind: 'portal_post',
  });

  // Low mossy ruin wall segments along outer flank edges (never blocking walkways)
  boxes.push(
    { id: 'ruin_wall_sw', minX: -12.5, maxX: -8.0, minZ: 12.5, maxZ: 14.0, kind: 'ruin_block' },
    { id: 'ruin_wall_se', minX: 8.0, maxX: 12.5, minZ: 12.5, maxZ: 14.0, kind: 'ruin_block' },
    { id: 'ruin_wall_nw', minX: -12.8, maxX: -8.8, minZ: -11.5, maxZ: -10.0, kind: 'ruin_block' },
    { id: 'ruin_wall_ne', minX: 8.8, maxX: 12.8, minZ: -11.5, maxZ: -10.0, kind: 'ruin_block' }
  );

  return { circles, boxes };
}

/**
 * Deterministic ground elevation: flat stone walkways + subtle rolling moss terrain outside.
 */
export function groundHeightAt(x: number, z: number): number {
  for (const w of WALKWAYS) {
    const hw = w.width * 0.5;
    const hd = w.depth * 0.5;
    if (x >= w.x - hw && x <= w.x + hw && z >= w.z - hd && z <= w.z + hd) {
      return w.y;
    }
  }
  const dist = Math.hypot(x, z);
  const rimLift = Math.max(0, (dist - 31) * 0.16);
  const undulation = Math.sin(x * 0.14) * Math.cos(z * 0.14) * 0.12;
  return Math.max(0, rimLift + undulation);
}

/**
 * Resolves a circle entity against all level colliders and the natural outer ruin perimeter.
 */
export function resolveWorldCollisions(
  x: number,
  z: number,
  entityRadius: number,
  colliders: { circles: CircleCollider[]; boxes: BoxCollider[] }
): Vec2 {
  let rx = x;
  let rz = z;

  // 2 iterations for smooth corner sliding
  for (let iter = 0; iter < 2; iter++) {
    // Circle colliders (pillars, obelisks, arch posts)
    for (const c of colliders.circles) {
      const dx = rx - c.x;
      const dz = rz - c.z;
      const minDist = entityRadius + c.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = minDist - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          rx += minDist;
        }
      }
    }

    // Box colliders (broken walls)
    for (const b of colliders.boxes) {
      const closestX = Math.max(b.minX, Math.min(rx, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(rz, b.maxZ));
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < entityRadius * entityRadius) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.0001) {
          const push = entityRadius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Inside box center fallback: push out along nearest axis
          const dl = Math.abs(rx - b.minX);
          const dr = Math.abs(b.maxX - rx);
          const dt = Math.abs(rz - b.minZ);
          const db = Math.abs(b.maxZ - rz);
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) rx = b.minX - entityRadius;
          else if (m === dr) rx = b.maxX + entityRadius;
          else if (m === dt) rz = b.minZ - entityRadius;
          else rz = b.maxZ + entityRadius;
        }
      }
    }

    // Outer natural perimeter (elliptical ruins basin bounded by cliffs & forest)
    const maxR = LEVEL_PLAYABLE_RADIUS - entityRadius;
    const dist = Math.hypot(rx, rz);
    if (dist > maxR && dist > 0.0001) {
      rx = (rx / dist) * maxR;
      rz = (rz / dist) * maxR;
    }
  }

  return { x: rx, z: rz };
}

/**
 * Checks whether a straight line segment is clear of solid circle/box obstacles.
 */
export function isSegmentClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  clearanceRadius: number,
  colliders: { circles: CircleCollider[]; boxes: BoxCollider[] }
): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(dist / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t;
    const pz = az + (bz - az) * t;
    const resolved = resolveWorldCollisions(px, pz, clearanceRadius, colliders);
    if (Math.hypot(resolved.x - px, resolved.z - pz) > 0.08) {
      return false;
    }
  }
  return true;
}
