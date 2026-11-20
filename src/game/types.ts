export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export type AbilityId = 'cleave' | 'dash' | 'sigil' | 'beam';

export interface AbilityDef {
  id: AbilityId;
  key: '1' | '2' | '3' | '4';
  name: string;
  role: string;
  cooldown: number;
  range: number;
  damage: number;
  accentHex: string;
}

export const ABILITIES: readonly AbilityDef[] = [
  {
    id: 'cleave',
    key: '1',
    name: 'Runic Cleave',
    role: 'Wide Arc AoE',
    cooldown: 2.6,
    range: 3.6,
    damage: 38,
    accentHex: '#4ef2ff',
  },
  {
    id: 'dash',
    key: '2',
    name: 'Phase Dash',
    role: 'Blink & Strike',
    cooldown: 3.8,
    range: 7.2,
    damage: 24,
    accentHex: '#63ffd1',
  },
  {
    id: 'sigil',
    key: '3',
    name: 'Rune Sigil',
    role: 'Circle Burst & Heal',
    cooldown: 7.0,
    range: 8.5,
    damage: 46,
    accentHex: '#38e8ff',
  },
  {
    id: 'beam',
    key: '4',
    name: 'Skyward Lance',
    role: 'Celestial Beam',
    cooldown: 11.0,
    range: 11.5,
    damage: 78,
    accentHex: '#94f7ff',
  },
] as const;

export type EnemyArchetype = 'stalker' | 'wisp' | 'charger' | 'warden';

export type EnemyBehaviorState =
  | 'idle'
  | 'approach'
  | 'orbit'
  | 'kite'
  | 'telegraph'
  | 'attack'
  | 'recover'
  | 'dying';

export interface Vec2 {
  x: number;
  z: number;
}

export interface HeroState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  moveTarget: Vec2 | null;
  attackTargetId: string | null;
  attackCooldown: number;
  attackAnimTimer: number;
  attackAnimDuration: number;
  comboStep: number;
  invulnTimer: number;
  hitFlashTimer: number;
  dashTimer: number;
  dashDirX: number;
  dashDirZ: number;
  walkDistance: number;
  cooldowns: Record<AbilityId, number>;
  kills: number;
  damageTaken: number;
  score: number;
}

export interface EnemyState {
  id: string;
  archetype: EnemyArchetype;
  name: string;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  vx: number;
  vz: number;
  facing: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  damage: number;
  state: EnemyBehaviorState;
  stateTimer: number;
  attackCooldown: number;
  hitFlashTimer: number;
  koTimer: number;
  orbitSign: number;
  telegraphX: number;
  telegraphZ: number;
  telegraphRadius: number;
  telegraphKind: 'lunge' | 'bolt' | 'charge' | 'nova' | 'cleave';
  hasAttackToken: boolean;
  zoneId: string;
}

export interface ProjectileState {
  id: string;
  fromPlayer: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  color: 'cyan' | 'magenta' | 'amber';
}

export interface GroundEffectState {
  id: string;
  kind: 'player_sigil' | 'player_beam' | 'warden_nova' | 'obelisk_beam' | 'portal_beam';
  x: number;
  z: number;
  radius: number;
  elapsed: number;
  chargeDuration: number;
  totalDuration: number;
  triggered: boolean;
}

export interface ObeliskState {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
  progress: number; // 0 to 1
  attuned: boolean;
  guardZoneId: string;
}

export interface PortalState {
  x: number;
  z: number;
  radius: number;
  unlocked: boolean;
  active: boolean;
}

export type ObjectiveStage =
  | 'attune_obelisks'
  | 'defeat_warden'
  | 'enter_portal'
  | 'complete';

export type SimEvent =
  | {
      type: 'floating_text';
      x: number;
      y: number;
      z: number;
      text: string;
      kind: 'damage' | 'crit' | 'heal' | 'player_hurt' | 'milestone';
    }
  | {
      type: 'slash';
      x: number;
      z: number;
      facing: number;
      radius: number;
      heavy: boolean;
    }
  | {
      type: 'burst';
      x: number;
      y: number;
      z: number;
      color: 'cyan' | 'amber' | 'magenta' | 'stone' | 'crimson';
      count: number;
    }
  | {
      type: 'light_beam';
      x: number;
      z: number;
      radius: number;
      duration: number;
      color: 'cyan' | 'gold' | 'crimson';
    }
  | {
      type: 'summon_circle';
      x: number;
      z: number;
      radius: number;
      duration: number;
      color: 'cyan' | 'crimson';
    }
  | {
      type: 'camera_shake';
      trauma: number;
      style?: 'crit' | 'heavy_land' | 'impact';
      dirX?: number;
      dirZ?: number;
      sourceX?: number;
      sourceZ?: number;
    }
  | {
      type: 'sound';
      sound:
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
    }
  | {
      type: 'banner';
      title: string;
      subtitle: string;
    };

export interface HudSnapshot {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  score: number;
  kills: number;
  totalEnemiesSpawned: number;
  elapsedTime: number;
  damageTaken: number;
  cooldowns: Record<AbilityId, number>;
  objectiveStage: ObjectiveStage;
  objectiveTitle: string;
  objectiveDetail: string;
  obelisksAttuned: number;
  obelisksTotal: number;
  wardenHp: number | null;
  wardenMaxHp: number | null;
  activeBanner: { title: string; subtitle: string } | null;
  heroX: number;
  heroZ: number;
  heroFacing: number;
  moveTarget: Vec2 | null;
  obelisks: Array<{ id: string; x: number; z: number; attuned: boolean; progress: number }>;
  portal: { x: number; z: number; active: boolean };
  enemies: Array<{ id: string; x: number; z: number; archetype: EnemyArchetype; hp: number; maxHp: number }>;
}

export interface RunSummary {
  victory: boolean;
  elapsedTime: number;
  kills: number;
  score: number;
  damageTaken: number;
  obelisksAttuned: number;
  obelisksTotal: number;
}
