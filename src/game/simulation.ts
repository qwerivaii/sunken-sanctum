import {
  ABILITIES,
  AbilityId,
  EnemyArchetype,
  EnemyState,
  GamePhase,
  GroundEffectState,
  HeroState,
  HudSnapshot,
  ObeliskState,
  ObjectiveStage,
  PortalState,
  ProjectileState,
  RunSummary,
  SimEvent,
  Vec2,
} from './types';
import {
  buildLevelColliders,
  HERO_SPAWN,
  INITIAL_ENEMY_SPAWNS,
  OBELISK_DEFS,
  PORTAL_LOCATION,
  resolveWorldCollisions,
} from './levelData';

const MAX_ATTACK_TOKENS = 3;
const HERO_MAX_HP = 120;
const HERO_SPEED = 7.4;
const HERO_RADIUS = 0.65;
const HERO_BASIC_RANGE = 2.85;
const HERO_BASIC_COOLDOWN = 0.42;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function createEnemy(
  id: string,
  archetype: EnemyArchetype,
  x: number,
  z: number,
  zoneId: string,
  idx: number
): EnemyState {
  if (archetype === 'stalker') {
    return {
      id,
      archetype,
      name: 'Moss Stalker',
      x,
      z,
      homeX: x,
      homeZ: z,
      vx: 0,
      vz: 0,
      facing: Math.PI,
      radius: 0.62,
      hp: 58,
      maxHp: 58,
      speed: 4.4,
      aggroRange: 11.5,
      attackRange: 2.35,
      damage: 11,
      state: 'idle',
      stateTimer: 0,
      attackCooldown: 0.4 + (idx % 3) * 0.2,
      hitFlashTimer: 0,
      koTimer: 0,
      orbitSign: idx % 2 === 0 ? 1 : -1,
      telegraphX: x,
      telegraphZ: z,
      telegraphRadius: 1.6,
      telegraphKind: 'lunge',
      hasAttackToken: false,
      zoneId,
    };
  }
  if (archetype === 'wisp') {
    return {
      id,
      archetype,
      name: 'Rift Wisp',
      x,
      z,
      homeX: x,
      homeZ: z,
      vx: 0,
      vz: 0,
      facing: Math.PI,
      radius: 0.58,
      hp: 48,
      maxHp: 48,
      speed: 3.5,
      aggroRange: 13.5,
      attackRange: 11.2,
      damage: 14,
      state: 'idle',
      stateTimer: 0,
      attackCooldown: 0.9,
      hitFlashTimer: 0,
      koTimer: 0,
      orbitSign: idx % 2 === 0 ? 1 : -1,
      telegraphX: x,
      telegraphZ: z,
      telegraphRadius: 1.2,
      telegraphKind: 'bolt',
      hasAttackToken: false,
      zoneId,
    };
  }
  if (archetype === 'charger') {
    return {
      id,
      archetype,
      name: 'Stone Charger',
      x,
      z,
      homeX: x,
      homeZ: z,
      vx: 0,
      vz: 0,
      facing: Math.PI,
      radius: 0.92,
      hp: 112,
      maxHp: 112,
      speed: 2.75,
      aggroRange: 12.0,
      attackRange: 8.6,
      damage: 22,
      state: 'idle',
      stateTimer: 0,
      attackCooldown: 1.1,
      hitFlashTimer: 0,
      koTimer: 0,
      orbitSign: 1,
      telegraphX: x,
      telegraphZ: z,
      telegraphRadius: 1.45,
      telegraphKind: 'charge',
      hasAttackToken: false,
      zoneId,
    };
  }
  // Sanctum Warden (Mini-Boss)
  return {
    id,
    archetype: 'warden',
    name: 'Sanctum Warden',
    x,
    z,
    homeX: x,
    homeZ: z,
    vx: 0,
    vz: 0,
    facing: 0,
    radius: 1.18,
    hp: 250,
    maxHp: 250,
    speed: 3.35,
    aggroRange: 26,
    attackRange: 3.6,
    damage: 24,
    state: 'approach',
    stateTimer: 0.6,
    attackCooldown: 1.2,
    hitFlashTimer: 0,
    koTimer: 0,
    orbitSign: 1,
    telegraphX: x,
    telegraphZ: z,
    telegraphRadius: 4.2,
    telegraphKind: 'nova',
    hasAttackToken: false,
    zoneId,
  };
}

export class GameSimulation {
  phase: GamePhase = 'title';
  hero: HeroState;
  enemies: EnemyState[] = [];
  projectiles: ProjectileState[] = [];
  groundEffects: GroundEffectState[] = [];
  obelisks: ObeliskState[] = [];
  portal: PortalState;
  colliders = buildLevelColliders();

  elapsedTime = 0;
  hitstopTimer = 0;
  defeatDelayTimer = 0;
  wardenSpawned = false;
  wardenDefeated = false;
  totalEnemiesSpawned = 0;

  activeBanner: { title: string; subtitle: string; timer: number } | null = null;
  runSummary: RunSummary | null = null;

  private events: SimEvent[] = [];
  private nextId = 1;
  private keyMoveX = 0;
  private keyMoveZ = 0;
  private guardBlockedNoticeCooldown = 0;

  constructor() {
    this.hero = this.createInitialHero();
    this.portal = {
      x: PORTAL_LOCATION.x,
      z: PORTAL_LOCATION.z,
      radius: 3.0,
      unlocked: false,
      active: false,
    };
    this.resetWorld('title');
  }

  private createInitialHero(): HeroState {
    return {
      x: HERO_SPAWN.x,
      z: HERO_SPAWN.z,
      vx: 0,
      vz: 0,
      facing: Math.PI, // Facing North (-Z) toward South Arch & Sanctum
      radius: HERO_RADIUS,
      hp: HERO_MAX_HP,
      maxHp: HERO_MAX_HP,
      speed: HERO_SPEED,
      moveTarget: null,
      attackTargetId: null,
      attackCooldown: 0,
      attackAnimTimer: 0,
      attackAnimDuration: 0.28,
      comboStep: 0,
      invulnTimer: 0,
      hitFlashTimer: 0,
      dashTimer: 0,
      dashDirX: 0,
      dashDirZ: -1,
      walkDistance: 0,
      cooldowns: { cleave: 0, dash: 0, sigil: 0, beam: 0 },
      kills: 0,
      damageTaken: 0,
      score: 0,
    };
  }

  resetWorld(phase: GamePhase = 'playing'): void {
    this.phase = phase;
    this.hero = this.createInitialHero();
    this.enemies = INITIAL_ENEMY_SPAWNS.map((s, idx) =>
      createEnemy(s.id, s.archetype, s.x, s.z, s.zoneId, idx)
    );
    this.totalEnemiesSpawned = this.enemies.length;
    this.projectiles = [];
    this.groundEffects = [];
    this.obelisks = OBELISK_DEFS.map((o) => ({
      id: o.id,
      label: o.label,
      x: o.x,
      z: o.z,
      radius: 4.3,
      progress: 0,
      attuned: false,
      guardZoneId: o.guardZoneId,
    }));
    this.portal = {
      x: PORTAL_LOCATION.x,
      z: PORTAL_LOCATION.z,
      radius: 3.1,
      unlocked: false,
      active: false,
    };
    this.elapsedTime = 0;
    this.hitstopTimer = 0;
    this.defeatDelayTimer = 0;
    this.wardenSpawned = false;
    this.wardenDefeated = false;
    this.keyMoveX = 0;
    this.keyMoveZ = 0;
    this.guardBlockedNoticeCooldown = 0;
    this.runSummary = null;
    this.events = [];
    this.activeBanner =
      phase === 'playing'
        ? {
            title: 'COURTYARD OF AWAKENING',
            subtitle: 'Attune the Western & Eastern Waystone Obelisks',
            timer: 2.6,
          }
        : null;
  }

  startGame(): void {
    this.resetWorld('playing');
  }

  setPaused(paused: boolean): void {
    if (paused && this.phase === 'playing') {
      this.phase = 'paused';
      this.keyMoveX = 0;
      this.keyMoveZ = 0;
    } else if (!paused && this.phase === 'paused') {
      this.phase = 'playing';
    }
  }

  setKeyboardMove(x: number, z: number): void {
    this.keyMoveX = x;
    this.keyMoveZ = z;
    if (Math.hypot(x, z) > 0.05) {
      this.hero.moveTarget = null;
      this.hero.attackTargetId = null;
    }
  }

  setMoveTarget(x: number, z: number): void {
    if (this.phase !== 'playing') return;
    const clamped = resolveWorldCollisions(x, z, this.hero.radius, this.colliders);
    this.hero.moveTarget = clamped;
    this.hero.attackTargetId = null;
  }

  setAttackTarget(enemyId: string): void {
    if (this.phase !== 'playing') return;
    const target = this.enemies.find((e) => e.id === enemyId && e.state !== 'dying');
    if (!target) return;
    this.hero.attackTargetId = enemyId;
    this.hero.moveTarget = null;
  }

  triggerBasicAttack(aimPoint?: Vec2): boolean {
    if (this.phase !== 'playing' || this.hero.hp <= 0) return false;
    if (this.hero.attackCooldown > 0 || this.hero.dashTimer > 0) return false;

    // Pick facing toward nearest close enemy or explicit aim point
    let targetEnemy: EnemyState | null = null;
    let bestDist = 4.2;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const d = Math.hypot(e.x - this.hero.x, e.z - this.hero.z);
      if (d < bestDist) {
        bestDist = d;
        targetEnemy = e;
      }
    }

    if (targetEnemy) {
      this.hero.facing = Math.atan2(targetEnemy.x - this.hero.x, targetEnemy.z - this.hero.z);
    } else if (aimPoint) {
      const dx = aimPoint.x - this.hero.x;
      const dz = aimPoint.z - this.hero.z;
      if (Math.hypot(dx, dz) > 0.15) {
        this.hero.facing = Math.atan2(dx, dz);
      }
    }

    this.hero.comboStep = (this.hero.comboStep % 3) + 1;
    const isFinisher = this.hero.comboStep === 3;
    const dmg = isFinisher ? 30 : 20;
    const arcRadius = isFinisher ? 3.2 : HERO_BASIC_RANGE;

    this.hero.attackCooldown = isFinisher ? 0.52 : HERO_BASIC_COOLDOWN;
    this.hero.attackAnimDuration = isFinisher ? 0.34 : 0.25;
    this.hero.attackAnimTimer = this.hero.attackAnimDuration;

    this.pushEvent({
      type: 'slash',
      x: this.hero.x,
      z: this.hero.z,
      facing: this.hero.facing,
      radius: arcRadius,
      heavy: isFinisher,
    });
    this.pushEvent({ type: 'sound', sound: isFinisher ? 'cleave' : 'slash' });

    // Deal melee arc damage
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.state === 'dying') continue;
      const dx = e.x - this.hero.x;
      const dz = e.z - this.hero.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= arcRadius + e.radius) {
        const angleTo = Math.atan2(dx, dz);
        const diff = Math.abs(normalizeAngle(angleTo - this.hero.facing));
        if (diff <= 1.25 || dist < 1.5) {
          this.damageEnemy(e, dmg, isFinisher ? 5.2 : 2.8, isFinisher);
          hitAny = true;
        }
      }
    }

    if (hitAny && isFinisher) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
      this.pushEvent({ type: 'camera_shake', trauma: 0.28 });
    } else if (hitAny) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.025);
      this.pushEvent({ type: 'camera_shake', trauma: 0.14 });
    }

    return true;
  }

  castAbility(id: AbilityId, aimPoint?: Vec2): boolean {
    if (this.phase !== 'playing' || this.hero.hp <= 0) return false;
    const def = ABILITIES.find((a) => a.id === id);
    if (!def) return false;
    if (this.hero.cooldowns[id] > 0) return false;

    const getDirection = (): { dx: number; dz: number } => {
      if (aimPoint) {
        const dx = aimPoint.x - this.hero.x;
        const dz = aimPoint.z - this.hero.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.25) return { dx: dx / len, dz: dz / len };
      }
      return { dx: Math.sin(this.hero.facing), dz: Math.cos(this.hero.facing) };
    };

    const getTargetPoint = (maxRange: number): Vec2 => {
      if (aimPoint) {
        const dx = aimPoint.x - this.hero.x;
        const dz = aimPoint.z - this.hero.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.1) {
          const clampedLen = Math.min(len, maxRange);
          return {
            x: this.hero.x + (dx / len) * clampedLen,
            z: this.hero.z + (dz / len) * clampedLen,
          };
        }
      }
      // Fall back to nearest living enemy in range
      let nearest: EnemyState | null = null;
      let best = maxRange;
      for (const e of this.enemies) {
        if (e.state === 'dying') continue;
        const d = Math.hypot(e.x - this.hero.x, e.z - this.hero.z);
        if (d < best) {
          best = d;
          nearest = e;
        }
      }
      if (nearest) return { x: nearest.x, z: nearest.z };
      return {
        x: this.hero.x + Math.sin(this.hero.facing) * Math.min(4.2, maxRange),
        z: this.hero.z + Math.cos(this.hero.facing) * Math.min(4.2, maxRange),
      };
    };

    this.hero.cooldowns[id] = def.cooldown;

    if (id === 'cleave') {
      const dir = getDirection();
      this.hero.facing = Math.atan2(dir.dx, dir.dz);
      this.hero.attackAnimDuration = 0.36;
      this.hero.attackAnimTimer = 0.36;

      this.pushEvent({
        type: 'slash',
        x: this.hero.x,
        z: this.hero.z,
        facing: this.hero.facing,
        radius: def.range + 0.5,
        heavy: true,
      });
      this.pushEvent({
        type: 'burst',
        x: this.hero.x + dir.dx * 1.4,
        y: 1.0,
        z: this.hero.z + dir.dz * 1.4,
        color: 'cyan',
        count: 16,
      });
      this.pushEvent({ type: 'sound', sound: 'cleave' });

      let hitCount = 0;
      for (const e of this.enemies) {
        if (e.state === 'dying') continue;
        const dx = e.x - this.hero.x;
        const dz = e.z - this.hero.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= def.range + e.radius + 0.35) {
          const ang = Math.atan2(dx, dz);
          const diff = Math.abs(normalizeAngle(ang - this.hero.facing));
          if (diff <= 1.75 || dist < 1.8) {
            this.damageEnemy(e, def.damage, 6.5, true);
            hitCount++;
          }
        }
      }
      if (hitCount > 0) {
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.055);
        this.pushEvent({ type: 'camera_shake', trauma: 0.36 });
      }
      return true;
    }

    if (id === 'dash') {
      const dir = getDirection();
      this.hero.facing = Math.atan2(dir.dx, dir.dz);
      this.hero.dashDirX = dir.dx;
      this.hero.dashDirZ = dir.dz;
      this.hero.dashTimer = 0.2;
      this.hero.invulnTimer = Math.max(this.hero.invulnTimer, 0.32);
      this.hero.moveTarget = null;
      this.pushEvent({
        type: 'burst',
        x: this.hero.x,
        y: 0.9,
        z: this.hero.z,
        color: 'cyan',
        count: 14,
      });
      this.pushEvent({ type: 'sound', sound: 'dash' });
      return true;
    }

    if (id === 'sigil') {
      // Summoning circle at cursor (or hero's position if no cursor / close)
      const pt = aimPoint ? getTargetPoint(def.range) : { x: this.hero.x, z: this.hero.z };
      const resolved = resolveWorldCollisions(pt.x, pt.z, 0.4, this.colliders);
      this.hero.facing = Math.atan2(resolved.x - this.hero.x, resolved.z - this.hero.z);

      this.groundEffects.push({
        id: `fx_${this.nextId++}`,
        kind: 'player_sigil',
        x: resolved.x,
        z: resolved.z,
        radius: 3.7,
        elapsed: 0,
        chargeDuration: 0.45,
        totalDuration: 1.5,
        triggered: false,
      });
      this.pushEvent({
        type: 'summon_circle',
        x: resolved.x,
        z: resolved.z,
        radius: 3.7,
        duration: 1.5,
        color: 'cyan',
      });
      this.pushEvent({ type: 'sound', sound: 'sigil_cast' });
      return true;
    }

    if (id === 'beam') {
      const pt = getTargetPoint(def.range);
      const resolved = resolveWorldCollisions(pt.x, pt.z, 0.4, this.colliders);
      this.hero.facing = Math.atan2(resolved.x - this.hero.x, resolved.z - this.hero.z);

      this.groundEffects.push({
        id: `fx_${this.nextId++}`,
        kind: 'player_beam',
        x: resolved.x,
        z: resolved.z,
        radius: 3.4,
        elapsed: 0,
        chargeDuration: 0.12,
        totalDuration: 1.65,
        triggered: false,
      });
      this.pushEvent({
        type: 'summon_circle',
        x: resolved.x,
        z: resolved.z,
        radius: 3.4,
        duration: 1.5,
        color: 'cyan',
      });
      this.pushEvent({ type: 'sound', sound: 'sigil_cast' });
      return true;
    }

    return false;
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  private pushEvent(ev: SimEvent): void {
    this.events.push(ev);
  }

  private damageEnemy(
    enemy: EnemyState,
    amount: number,
    knockback: number,
    isCrit: boolean
  ): void {
    if (enemy.state === 'dying') return;
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.hitFlashTimer = 0.09;

    const dx = enemy.x - this.hero.x;
    const dz = enemy.z - this.hero.z;
    const dist = Math.hypot(dx, dz) || 1;
    const kbScale = enemy.archetype === 'warden' ? 0.28 : enemy.archetype === 'charger' ? 0.45 : 1.0;
    enemy.vx += (dx / dist) * knockback * kbScale;
    enemy.vz += (dz / dist) * knockback * kbScale;

    this.pushEvent({
      type: 'floating_text',
      x: enemy.x,
      y: enemy.archetype === 'warden' ? 3.2 : 2.1,
      z: enemy.z,
      text: isCrit ? `-${amount}!` : `-${amount}`,
      kind: isCrit ? 'crit' : 'damage',
    });
    this.pushEvent({
      type: 'burst',
      x: enemy.x,
      y: 1.1,
      z: enemy.z,
      color: isCrit ? 'cyan' : 'amber',
      count: isCrit ? 14 : 8,
    });

    if (isCrit) {
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.028);
      this.pushEvent({
        type: 'camera_shake',
        trauma: enemy.archetype === 'warden' ? 0.48 : 0.36,
        style: 'crit',
        dirX: dx / dist,
        dirZ: dz / dist,
        sourceX: enemy.x,
        sourceZ: enemy.z,
      });
    }

    if (enemy.hp <= 0) {
      enemy.state = 'dying';
      enemy.koTimer = 0.45;
      enemy.hasAttackToken = false;
      this.hero.kills += 1;
      const pts =
        enemy.archetype === 'warden'
          ? 600
          : enemy.archetype === 'charger'
            ? 150
            : enemy.archetype === 'wisp'
              ? 120
              : 100;
      this.hero.score += pts;
      this.hitstopTimer = Math.max(this.hitstopTimer, enemy.archetype === 'warden' ? 0.08 : 0.04);
      this.pushEvent({
        type: 'burst',
        x: enemy.x,
        y: 1.2,
        z: enemy.z,
        color: enemy.archetype === 'warden' ? 'cyan' : 'stone',
        count: enemy.archetype === 'warden' ? 28 : 16,
      });
      const isLarge = enemy.archetype === 'warden' || enemy.archetype === 'charger';
      this.pushEvent({
        type: 'camera_shake',
        trauma: enemy.archetype === 'warden' ? 0.72 : enemy.archetype === 'charger' ? 0.42 : 0.25,
        style: isLarge ? 'heavy_land' : 'impact',
        sourceX: enemy.x,
        sourceZ: enemy.z,
      });
      this.pushEvent({ type: 'sound', sound: 'kill' });

      if (enemy.archetype === 'warden') {
        this.onWardenDefeated();
      }
    } else {
      this.pushEvent({ type: 'sound', sound: 'hit' });
    }
  }

  private damageHero(amount: number, sourceX: number, sourceZ: number): void {
    if (this.phase !== 'playing') return;
    if (this.hero.invulnTimer > 0 || this.hero.hp <= 0) return;

    this.hero.hp = Math.max(0, this.hero.hp - amount);
    this.hero.damageTaken += amount;
    this.hero.hitFlashTimer = 0.12;
    this.hero.invulnTimer = 0.42;

    const dx = this.hero.x - sourceX;
    const dz = this.hero.z - sourceZ;
    const dist = Math.hypot(dx, dz) || 1;
    this.hero.vx += (dx / dist) * 5.2;
    this.hero.vz += (dz / dist) * 5.2;

    this.hitstopTimer = Math.max(this.hitstopTimer, 0.04);
    this.pushEvent({
      type: 'floating_text',
      x: this.hero.x,
      y: 2.3,
      z: this.hero.z,
      text: `-${amount}`,
      kind: 'player_hurt',
    });
    this.pushEvent({
      type: 'burst',
      x: this.hero.x,
      y: 1.1,
      z: this.hero.z,
      color: 'crimson',
      count: 14,
    });
    this.pushEvent({ type: 'camera_shake', trauma: 0.42 });
    this.pushEvent({ type: 'sound', sound: 'player_hurt' });

    if (this.hero.hp <= 0) {
      this.defeatDelayTimer = 0.55;
      this.pushEvent({ type: 'sound', sound: 'defeat' });
    }
  }

  private healHero(amount: number): void {
    if (this.hero.hp <= 0) return;
    const prev = this.hero.hp;
    this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + amount);
    const gained = this.hero.hp - prev;
    if (gained > 0) {
      this.pushEvent({
        type: 'floating_text',
        x: this.hero.x,
        y: 2.4,
        z: this.hero.z,
        text: `+${gained} HP`,
        kind: 'heal',
      });
    }
  }

  private onObeliskAttuned(ob: ObeliskState): void {
    ob.attuned = true;
    ob.progress = 1;
    this.hero.score += 250;
    this.healHero(25);

    this.groundEffects.push({
      id: `fx_${this.nextId++}`,
      kind: 'obelisk_beam',
      x: ob.x,
      z: ob.z,
      radius: 3.2,
      elapsed: 0,
      chargeDuration: 0,
      totalDuration: 2.8,
      triggered: true,
    });

    this.pushEvent({
      type: 'light_beam',
      x: ob.x,
      z: ob.z,
      radius: 2.1,
      duration: 2.8,
      color: 'cyan',
    });
    this.pushEvent({
      type: 'summon_circle',
      x: ob.x,
      z: ob.z,
      radius: 4.2,
      duration: 2.8,
      color: 'cyan',
    });
    this.pushEvent({
      type: 'burst',
      x: ob.x,
      y: 1.8,
      z: ob.z,
      color: 'cyan',
      count: 26,
    });
    this.pushEvent({
      type: 'floating_text',
      x: ob.x,
      y: 3.4,
      z: ob.z,
      text: 'WAYSTONE ATTUNED',
      kind: 'milestone',
    });
    this.pushEvent({ type: 'camera_shake', trauma: 0.35 });
    this.pushEvent({ type: 'sound', sound: 'obelisk' });

    const attunedCount = this.obelisks.filter((o) => o.attuned).length;
    if (attunedCount >= this.obelisks.length && !this.wardenSpawned) {
      this.spawnSanctumWarden();
    } else {
      this.showBanner(
        `${ob.label.toUpperCase()} ATTUNED`,
        `${attunedCount}/${this.obelisks.length} Waystones active — seek the remaining obelisk`
      );
    }
  }

  private spawnSanctumWarden(): void {
    this.wardenSpawned = true;
    const wx = 0;
    const wz = -16.5;
    const warden = createEnemy('boss_warden', 'warden', wx, wz, 'north_sanctum', 99);
    this.enemies.push(warden);
    this.totalEnemiesSpawned += 1;

    this.pushEvent({
      type: 'summon_circle',
      x: wx,
      z: wz,
      radius: 4.8,
      duration: 2.4,
      color: 'crimson',
    });
    this.pushEvent({
      type: 'light_beam',
      x: wx,
      z: wz,
      radius: 2.6,
      duration: 2.2,
      color: 'crimson',
    });
    this.pushEvent({
      type: 'burst',
      x: wx,
      y: 0.6,
      z: wz,
      color: 'stone',
      count: 24,
    });
    this.pushEvent({
      type: 'camera_shake',
      trauma: 0.78,
      style: 'heavy_land',
      sourceX: wx,
      sourceZ: wz,
    });
    this.pushEvent({ type: 'sound', sound: 'warden_spawn' });
    this.showBanner(
      'THE SANCTUM WARDEN AWAKENS',
      'Defeat the Warden in the Northern Sanctum to unseal the Cyan Portal'
    );
  }

  private onWardenDefeated(): void {
    this.wardenDefeated = true;
    this.portal.unlocked = true;
    this.portal.active = true;

    this.groundEffects.push({
      id: `fx_${this.nextId++}`,
      kind: 'portal_beam',
      x: this.portal.x,
      z: this.portal.z,
      radius: 3.4,
      elapsed: 0,
      chargeDuration: 0,
      totalDuration: 3.5,
      triggered: true,
    });
    this.pushEvent({
      type: 'light_beam',
      x: this.portal.x,
      z: this.portal.z,
      radius: 2.6,
      duration: 3.5,
      color: 'cyan',
    });
    this.pushEvent({
      type: 'summon_circle',
      x: this.portal.x,
      z: this.portal.z,
      radius: 4.4,
      duration: 3.5,
      color: 'cyan',
    });
    this.pushEvent({ type: 'sound', sound: 'portal_open' });
    this.showBanner(
      'SANCTUM PORTAL UNSEALED',
      'Step through the glowing Cyan Portal to complete Level 1'
    );
  }

  private showBanner(title: string, subtitle: string): void {
    this.activeBanner = { title, subtitle, timer: 4.0 };
    this.pushEvent({ type: 'banner', title, subtitle });
  }

  private countActiveAttackTokens(): number {
    let count = 0;
    for (const e of this.enemies) {
      if (e.state !== 'dying' && e.hasAttackToken) count++;
    }
    return count;
  }

  step(rawDt: number): void {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    if (this.phase !== 'playing') return;

    // Tick banner & non-physics feedback timers in real dt
    if (this.activeBanner) {
      this.activeBanner.timer -= dt;
      if (this.activeBanner.timer <= 0) this.activeBanner = null;
    }
    if (this.guardBlockedNoticeCooldown > 0) {
      this.guardBlockedNoticeCooldown -= dt;
    }

    // Handle defeat delay beat before transitioning to defeat modal
    if (this.hero.hp <= 0) {
      this.defeatDelayTimer -= dt;
      if (this.defeatDelayTimer <= 0) {
        this.phase = 'defeat';
        this.runSummary = this.buildRunSummary(false);
      }
      return;
    }

    // Hitstop freeze pauses simulation physics while flashes/shake keep ticking
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.hero.hitFlashTimer = Math.max(0, this.hero.hitFlashTimer - dt);
      for (const e of this.enemies) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      }
      return;
    }

    this.elapsedTime += dt;

    this.stepHero(dt);
    this.stepEnemies(dt);
    this.stepProjectiles(dt);
    this.stepGroundEffects(dt);
    this.stepObelisksAndPortal(dt);
  }

  private stepHero(dt: number): void {
    const h = this.hero;
    h.attackCooldown = Math.max(0, h.attackCooldown - dt);
    h.attackAnimTimer = Math.max(0, h.attackAnimTimer - dt);
    h.invulnTimer = Math.max(0, h.invulnTimer - dt);
    h.hitFlashTimer = Math.max(0, h.hitFlashTimer - dt);

    for (const key of Object.keys(h.cooldowns) as AbilityId[]) {
      h.cooldowns[key] = Math.max(0, h.cooldowns[key] - dt);
    }

    // Active Phase Dash movement
    if (h.dashTimer > 0) {
      h.dashTimer = Math.max(0, h.dashTimer - dt);
      const dashSpeed = 30.0;
      const nextX = h.x + h.dashDirX * dashSpeed * dt;
      const nextZ = h.z + h.dashDirZ * dashSpeed * dt;
      const resolved = resolveWorldCollisions(nextX, nextZ, h.radius, this.colliders);
      h.walkDistance += Math.hypot(resolved.x - h.x, resolved.z - h.z);
      h.x = resolved.x;
      h.z = resolved.z;

      // Damage enemies passed during dash
      const dashDmg = ABILITIES[1].damage;
      for (const e of this.enemies) {
        if (e.state === 'dying' || e.hitFlashTimer > 0) continue;
        const dist = Math.hypot(e.x - h.x, e.z - h.z);
        if (dist <= h.radius + e.radius + 0.9) {
          this.damageEnemy(e, dashDmg, 4.0, false);
        }
      }
      return;
    }

    // Attack-target pursuit (when user clicked an enemy)
    if (h.attackTargetId) {
      const target = this.enemies.find((e) => e.id === h.attackTargetId && e.state !== 'dying');
      if (!target) {
        h.attackTargetId = null;
      } else {
        const dx = target.x - h.x;
        const dz = target.z - h.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= HERO_BASIC_RANGE + target.radius * 0.6) {
          h.moveTarget = null;
          h.facing = Math.atan2(dx, dz);
          if (h.attackCooldown <= 0) {
            this.triggerBasicAttack({ x: target.x, z: target.z });
          }
        } else {
          h.moveTarget = { x: target.x, z: target.z };
        }
      }
    }

    // Movement intent: keyboard takes priority over click-to-move
    let moveDirX = 0;
    let moveDirZ = 0;
    const keyMag = Math.hypot(this.keyMoveX, this.keyMoveZ);
    if (keyMag > 0.05) {
      moveDirX = this.keyMoveX / keyMag;
      moveDirZ = this.keyMoveZ / keyMag;
    } else if (h.moveTarget) {
      const dx = h.moveTarget.x - h.x;
      const dz = h.moveTarget.z - h.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.25) {
        h.moveTarget = null;
      } else {
        moveDirX = dx / dist;
        moveDirZ = dz / dist;
      }
    }

    // Knockback velocity decay
    const decay = Math.exp(-10 * dt);
    h.vx *= decay;
    h.vz *= decay;

    const moveSpeed = h.attackAnimTimer > 0.1 ? h.speed * 0.55 : h.speed;
    let stepX = (moveDirX * moveSpeed + h.vx) * dt;
    let stepZ = (moveDirZ * moveSpeed + h.vz) * dt;

    // Prevent overshooting click target
    if (h.moveTarget && keyMag <= 0.05) {
      const rem = Math.hypot(h.moveTarget.x - h.x, h.moveTarget.z - h.z);
      const stepMag = Math.hypot(stepX, stepZ);
      if (stepMag > rem && rem > 0.001) {
        stepX = (stepX / stepMag) * rem;
        stepZ = (stepZ / stepMag) * rem;
      }
    }

    const prevX = h.x;
    const prevZ = h.z;
    const resolved = resolveWorldCollisions(h.x + stepX, h.z + stepZ, h.radius, this.colliders);
    h.x = resolved.x;
    h.z = resolved.z;

    const traveled = Math.hypot(h.x - prevX, h.z - prevZ);
    h.walkDistance += traveled;

    // Cancel unreachable move target if blocked against an obstacle
    if (h.moveTarget && keyMag <= 0.05 && traveled < 0.015 * dt * 60 && h.attackAnimTimer <= 0) {
      const targetDist = Math.hypot(h.moveTarget.x - h.x, h.moveTarget.z - h.z);
      if (targetDist < 1.25) {
        h.moveTarget = null;
      }
    }

    if (Math.hypot(moveDirX, moveDirZ) > 0.1 && h.attackAnimTimer <= 0.05) {
      const desiredFacing = Math.atan2(moveDirX, moveDirZ);
      const diff = normalizeAngle(desiredFacing - h.facing);
      h.facing = normalizeAngle(h.facing + diff * clamp(dt * 14, 0, 1));
    }
  }

  private stepEnemies(dt: number): void {
    const h = this.hero;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      if (e.state === 'dying') {
        e.koTimer -= dt;
        e.vx *= Math.exp(-6 * dt);
        e.vz *= Math.exp(-6 * dt);
        const pos = resolveWorldCollisions(e.x + e.vx * dt, e.z + e.vz * dt, e.radius, this.colliders);
        e.x = pos.x;
        e.z = pos.z;
        if (e.koTimer <= 0) {
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Decay knockback
      e.vx *= Math.exp(-9 * dt);
      e.vz *= Math.exp(-9 * dt);

      const dx = h.x - e.x;
      const dz = h.z - e.z;
      const distToHero = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / distToHero;
      const dirZ = dz / distToHero;

      let moveX = 0;
      let moveZ = 0;

      if (e.state === 'idle') {
        if (distToHero <= e.aggroRange) {
          e.state = e.archetype === 'wisp' ? 'kite' : 'approach';
          e.stateTimer = 0.6;
        }
      } else if (e.state === 'telegraph') {
        e.stateTimer -= dt;
        if (e.telegraphKind === 'lunge' || e.telegraphKind === 'bolt' || e.telegraphKind === 'cleave') {
          e.facing = Math.atan2(dirX, dirZ);
        }
        if (e.stateTimer <= 0) {
          this.executeEnemyAttack(e);
        }
      } else if (e.state === 'attack') {
        e.stateTimer -= dt;
        if (e.archetype === 'charger' || e.archetype === 'stalker') {
          const rushSpeed = e.archetype === 'charger' ? 12.6 : 11.0;
          const rushDirX = Math.sin(e.facing);
          const rushDirZ = Math.cos(e.facing);
          moveX = rushDirX * rushSpeed;
          moveZ = rushDirZ * rushSpeed;

          // Check hit during dash/lunge
          if (distToHero <= e.radius + h.radius + 0.55) {
            this.damageHero(e.damage, e.x, e.z);
            if (e.archetype === 'charger') {
              this.pushEvent({
                type: 'burst',
                x: e.x,
                y: 0.6,
                z: e.z,
                color: 'stone',
                count: 14,
              });
              this.pushEvent({
                type: 'camera_shake',
                trauma: 0.54,
                style: 'heavy_land',
                dirX: rushDirX,
                dirZ: rushDirZ,
                sourceX: e.x,
                sourceZ: e.z,
              });
            }
            e.state = 'recover';
            e.stateTimer = e.archetype === 'charger' ? 0.95 : 0.65;
            e.hasAttackToken = false;
          }
        }
        if (e.state === 'attack' && e.stateTimer <= 0) {
          if (e.archetype === 'charger') {
            // Heavy Ruin Charger stomp-landing at the end of its charge rush
            this.pushEvent({
              type: 'burst',
              x: e.x,
              y: 0.5,
              z: e.z,
              color: 'stone',
              count: 12,
            });
            this.pushEvent({
              type: 'camera_shake',
              trauma: 0.44,
              style: 'heavy_land',
              dirX: Math.sin(e.facing),
              dirZ: Math.cos(e.facing),
              sourceX: e.x,
              sourceZ: e.z,
            });
          }
          e.state = 'recover';
          e.stateTimer = e.archetype === 'charger' ? 0.95 : 0.55;
          e.hasAttackToken = false;
        }
      } else if (e.state === 'recover') {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.state = e.archetype === 'wisp' ? 'kite' : 'approach';
          e.stateTimer = 0.5;
        }
      } else {
        // Distinct Movement Policies per Archetype!
        if (e.archetype === 'stalker') {
          // Policy 1: Approach & Flank-Orbit Swarmer
          e.facing = Math.atan2(dirX, dirZ);
          if (distToHero > 4.4) {
            moveX = dirX * e.speed;
            moveZ = dirZ * e.speed;
          } else {
            // Strafe/flank around hero while waiting for attack window
            const perpX = -dirZ * e.orbitSign;
            const perpZ = dirX * e.orbitSign;
            const radial = distToHero > e.attackRange ? 0.45 : -0.15;
            moveX = (perpX * 0.85 + dirX * radial) * e.speed;
            moveZ = (perpZ * 0.85 + dirZ * radial) * e.speed;
            e.state = 'orbit';

            if (
              e.attackCooldown <= 0 &&
              distToHero <= 3.6 &&
              this.countActiveAttackTokens() < MAX_ATTACK_TOKENS
            ) {
              e.hasAttackToken = true;
              e.state = 'telegraph';
              e.stateTimer = 0.38;
              e.telegraphKind = 'lunge';
              e.telegraphX = h.x;
              e.telegraphZ = h.z;
              e.telegraphRadius = 1.65;
              this.pushEvent({ type: 'sound', sound: 'telegraph' });
            }
          }
        } else if (e.archetype === 'wisp') {
          // Policy 2: Ranged Kiter (maintains 6.5m - 10.2m band, retreats if hero closes in)
          e.facing = Math.atan2(dirX, dirZ);
          e.state = 'kite';
          const perpX = -dirZ * e.orbitSign;
          const perpZ = dirX * e.orbitSign;
          if (distToHero < 6.0) {
            moveX = (-dirX * 0.85 + perpX * 0.45) * e.speed;
            moveZ = (-dirZ * 0.85 + perpZ * 0.45) * e.speed;
          } else if (distToHero > 10.5) {
            moveX = (dirX * 0.8 + perpX * 0.35) * e.speed;
            moveZ = (dirZ * 0.8 + perpZ * 0.35) * e.speed;
          } else {
            moveX = perpX * e.speed * 0.8;
            moveZ = perpZ * e.speed * 0.8;
          }

          if (
            e.attackCooldown <= 0 &&
            distToHero <= e.attackRange &&
            this.countActiveAttackTokens() < MAX_ATTACK_TOKENS
          ) {
            e.hasAttackToken = true;
            e.state = 'telegraph';
            e.stateTimer = 0.55;
            e.telegraphKind = 'bolt';
            e.telegraphX = h.x;
            e.telegraphZ = h.z;
            e.telegraphRadius = 1.1;
            this.pushEvent({ type: 'sound', sound: 'telegraph' });
          }
        } else if (e.archetype === 'charger') {
          // Policy 3: Heavy Line-of-Sight Charger
          e.facing = Math.atan2(dirX, dirZ);
          if (distToHero > e.attackRange - 0.6) {
            moveX = dirX * e.speed;
            moveZ = dirZ * e.speed;
          } else if (
            e.attackCooldown <= 0 &&
            this.countActiveAttackTokens() < MAX_ATTACK_TOKENS
          ) {
            e.hasAttackToken = true;
            e.state = 'telegraph';
            e.stateTimer = 0.68;
            e.telegraphKind = 'charge';
            // Lock trajectory ahead toward hero
            e.facing = Math.atan2(dirX, dirZ);
            e.telegraphX = e.x + dirX * 7.2;
            e.telegraphZ = e.z + dirZ * 7.2;
            e.telegraphRadius = 1.6;
            this.pushEvent({ type: 'sound', sound: 'telegraph' });
          } else {
            moveX = dirX * e.speed * 0.45;
            moveZ = dirZ * e.speed * 0.45;
          }
        } else if (e.archetype === 'warden') {
          // Boss Policy: Advances with alternating Cleave and Summoning Circle Nova
          e.facing = Math.atan2(dirX, dirZ);
          if (distToHero > 3.4) {
            moveX = dirX * e.speed;
            moveZ = dirZ * e.speed;
          }
          if (e.attackCooldown <= 0) {
            e.hasAttackToken = true;
            e.state = 'telegraph';
            if (distToHero <= 4.2 && e.orbitSign > 0) {
              e.telegraphKind = 'cleave';
              e.stateTimer = 0.58;
              e.telegraphX = e.x + dirX * 2.2;
              e.telegraphZ = e.z + dirZ * 2.2;
              e.telegraphRadius = 3.2;
            } else {
              e.telegraphKind = 'nova';
              e.stateTimer = 0.8;
              e.telegraphX = h.x;
              e.telegraphZ = h.z;
              e.telegraphRadius = 3.8;
              this.groundEffects.push({
                id: `fx_${this.nextId++}`,
                kind: 'warden_nova',
                x: h.x,
                z: h.z,
                radius: 3.8,
                elapsed: 0,
                chargeDuration: 0.82,
                totalDuration: 1.5,
                triggered: false,
              });
              this.pushEvent({
                type: 'summon_circle',
                x: h.x,
                z: h.z,
                radius: 3.8,
                duration: 1.45,
                color: 'crimson',
              });
            }
            e.orbitSign *= -1;
            this.pushEvent({ type: 'sound', sound: 'telegraph' });
          }
        }
      }

      // Soft separation between enemies so they don't stack
      for (const other of this.enemies) {
        if (other === e || other.state === 'dying') continue;
        const sdx = e.x - other.x;
        const sdz = e.z - other.z;
        const minSep = e.radius + other.radius + 0.35;
        const dSq = sdx * sdx + sdz * sdz;
        if (dSq < minSep * minSep && dSq > 0.0001) {
          const d = Math.sqrt(dSq);
          const push = ((minSep - d) / minSep) * 3.5;
          moveX += (sdx / d) * push;
          moveZ += (sdz / d) * push;
        }
      }

      const nextX = e.x + (moveX + e.vx) * dt;
      const nextZ = e.z + (moveZ + e.vz) * dt;
      const resolved = resolveWorldCollisions(nextX, nextZ, e.radius, this.colliders);
      e.x = resolved.x;
      e.z = resolved.z;
    }
  }

  private executeEnemyAttack(e: EnemyState): void {
    const h = this.hero;
    if (e.telegraphKind === 'lunge') {
      e.state = 'attack';
      e.stateTimer = 0.24;
      e.attackCooldown = 1.65;
      this.pushEvent({ type: 'sound', sound: 'slash' });
      return;
    }

    if (e.telegraphKind === 'charge') {
      e.state = 'attack';
      e.stateTimer = 0.56;
      e.attackCooldown = 2.8;
      this.pushEvent({
        type: 'burst',
        x: e.x,
        y: 0.7,
        z: e.z,
        color: 'stone',
        count: 10,
      });
      this.pushEvent({ type: 'sound', sound: 'cleave' });
      return;
    }

    if (e.telegraphKind === 'bolt') {
      const dx = h.x - e.x;
      const dz = h.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      const speed = 11.2;
      this.projectiles.push({
        id: `proj_${this.nextId++}`,
        fromPlayer: false,
        x: e.x + (dx / dist) * 0.8,
        z: e.z + (dz / dist) * 0.8,
        vx: (dx / dist) * speed,
        vz: (dz / dist) * speed,
        radius: 0.42,
        damage: e.damage,
        life: 0,
        maxLife: 2.2,
        color: 'magenta',
      });
      e.state = 'recover';
      e.stateTimer = 0.5;
      e.attackCooldown = 2.25;
      e.hasAttackToken = false;
      this.pushEvent({ type: 'sound', sound: 'bolt' });
      return;
    }

    if (e.telegraphKind === 'cleave') {
      const dist = Math.hypot(h.x - e.telegraphX, h.z - e.telegraphZ);
      if (dist <= e.telegraphRadius + h.radius) {
        this.damageHero(e.damage, e.x, e.z);
      }
      this.pushEvent({
        type: 'burst',
        x: e.telegraphX,
        y: 1.0,
        z: e.telegraphZ,
        color: 'crimson',
        count: 18,
      });
      this.pushEvent({
        type: 'camera_shake',
        trauma: 0.52,
        style: 'heavy_land',
        sourceX: e.telegraphX,
        sourceZ: e.telegraphZ,
      });
      this.pushEvent({ type: 'sound', sound: 'cleave' });
      e.state = 'recover';
      e.stateTimer = 0.8;
      e.attackCooldown = 2.1;
      e.hasAttackToken = false;
      return;
    }

    // Warden Nova already created a groundEffect that detonates on schedule
    e.state = 'recover';
    e.stateTimer = 0.75;
    e.attackCooldown = 2.5;
    e.hasAttackToken = false;
  }

  private stepProjectiles(dt: number): void {
    const h = this.hero;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;

      // Check obstacle impact
      const res = resolveWorldCollisions(p.x, p.z, p.radius, this.colliders);
      const hitWall = Math.hypot(res.x - p.x, res.z - p.z) > 0.06;

      if (hitWall || p.life >= p.maxLife) {
        this.pushEvent({
          type: 'burst',
          x: p.x,
          y: 1.0,
          z: p.z,
          color: 'magenta',
          count: 6,
        });
        this.projectiles.splice(i, 1);
        continue;
      }

      if (!p.fromPlayer) {
        const d = Math.hypot(p.x - h.x, p.z - h.z);
        if (d <= p.radius + h.radius) {
          this.damageHero(p.damage, p.x, p.z);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private stepGroundEffects(dt: number): void {
    const h = this.hero;
    for (let i = this.groundEffects.length - 1; i >= 0; i--) {
      const fx = this.groundEffects[i];
      fx.elapsed += dt;

      if (!fx.triggered && fx.elapsed >= fx.chargeDuration) {
        fx.triggered = true;

        if (fx.kind === 'player_sigil') {
          const dmg = ABILITIES[2].damage;
          for (const e of this.enemies) {
            if (e.state === 'dying') continue;
            const d = Math.hypot(e.x - fx.x, e.z - fx.z);
            if (d <= fx.radius + e.radius) {
              this.damageEnemy(e, dmg, 6.0, true);
            }
          }
          if (Math.hypot(h.x - fx.x, h.z - fx.z) <= fx.radius + 0.8) {
            this.healHero(24);
          }
          this.pushEvent({
            type: 'burst',
            x: fx.x,
            y: 0.7,
            z: fx.z,
            color: 'cyan',
            count: 24,
          });
          this.pushEvent({ type: 'camera_shake', trauma: 0.32 });
          this.pushEvent({ type: 'sound', sound: 'sigil_boom' });
        } else if (fx.kind === 'player_beam') {
          const dmg = ABILITIES[3].damage;
          let hitAny = false;
          for (const e of this.enemies) {
            if (e.state === 'dying') continue;
            const d = Math.hypot(e.x - fx.x, e.z - fx.z);
            if (d <= fx.radius + e.radius) {
              this.damageEnemy(e, dmg, 7.5, true);
              hitAny = true;
            }
          }
          this.pushEvent({
            type: 'light_beam',
            x: fx.x,
            z: fx.z,
            radius: fx.radius * 0.62,
            duration: 1.15,
            color: 'cyan',
          });
          this.pushEvent({
            type: 'burst',
            x: fx.x,
            y: 1.4,
            z: fx.z,
            color: 'cyan',
            count: 28,
          });
          this.pushEvent({ type: 'camera_shake', trauma: 0.56 });
          this.pushEvent({ type: 'sound', sound: 'beam' });
          if (hitAny) {
            this.hitstopTimer = Math.max(this.hitstopTimer, 0.065);
          }
        } else if (fx.kind === 'warden_nova') {
          const d = Math.hypot(h.x - fx.x, h.z - fx.z);
          if (d <= fx.radius + h.radius * 0.5) {
            this.damageHero(26, fx.x, fx.z);
          }
          this.pushEvent({
            type: 'light_beam',
            x: fx.x,
            z: fx.z,
            radius: fx.radius * 0.5,
            duration: 0.85,
            color: 'crimson',
          });
          this.pushEvent({
            type: 'burst',
            x: fx.x,
            y: 1.2,
            z: fx.z,
            color: 'crimson',
            count: 22,
          });
          this.pushEvent({
            type: 'camera_shake',
            trauma: 0.58,
            style: 'heavy_land',
            sourceX: fx.x,
            sourceZ: fx.z,
          });
          this.pushEvent({ type: 'sound', sound: 'beam' });
        }
      }

      if (fx.elapsed >= fx.totalDuration) {
        this.groundEffects.splice(i, 1);
      }
    }
  }

  private stepObelisksAndPortal(dt: number): void {
    const h = this.hero;

    // Check obelisk attunement
    for (const ob of this.obelisks) {
      if (ob.attuned) continue;
      const d = Math.hypot(h.x - ob.x, h.z - ob.z);
      const guardsAlive = this.enemies.some(
        (e) => e.zoneId === ob.guardZoneId && e.state !== 'dying'
      );

      if (d <= ob.radius) {
        if (!guardsAlive) {
          ob.progress = clamp(ob.progress + dt * 0.92, 0, 1);
          if (ob.progress >= 1) {
            this.onObeliskAttuned(ob);
          }
        } else if (this.guardBlockedNoticeCooldown <= 0) {
          this.guardBlockedNoticeCooldown = 2.2;
          this.pushEvent({
            type: 'floating_text',
            x: ob.x,
            y: 3.1,
            z: ob.z,
            text: 'DEFEAT GUARDS FIRST',
            kind: 'milestone',
          });
        }
      } else if (ob.progress > 0) {
        ob.progress = Math.max(0, ob.progress - dt * 0.28);
      }
    }

    // Check active Northern Sanctum Portal entry -> Victory!
    if (this.portal.active) {
      const distPortal = Math.hypot(h.x - this.portal.x, h.z - this.portal.z);
      if (distPortal <= this.portal.radius) {
        this.hero.score += 500;
        this.phase = 'victory';
        this.runSummary = this.buildRunSummary(true);
        this.pushEvent({ type: 'sound', sound: 'victory' });
      }
    }
  }

  private buildRunSummary(victory: boolean): RunSummary {
    return {
      victory,
      elapsedTime: this.elapsedTime,
      kills: this.hero.kills,
      score: this.hero.score,
      damageTaken: this.hero.damageTaken,
      obelisksAttuned: this.obelisks.filter((o) => o.attuned).length,
      obelisksTotal: this.obelisks.length,
    };
  }

  getObjectiveStage(): ObjectiveStage {
    if (this.phase === 'victory') return 'complete';
    if (this.portal.active) return 'enter_portal';
    if (this.wardenSpawned && !this.wardenDefeated) return 'defeat_warden';
    return 'attune_obelisks';
  }

  getHudSnapshot(): HudSnapshot {
    const attuned = this.obelisks.filter((o) => o.attuned).length;
    const stage = this.getObjectiveStage();
    const warden = this.enemies.find((e) => e.archetype === 'warden' && e.state !== 'dying') ?? null;

    let objectiveTitle = `Attune Rune Obelisks (${attuned}/${this.obelisks.length})`;
    let objectiveDetail =
      attuned === 0
        ? 'Clear guards at West & East Waystones and stand in their circles'
        : 'Seek and attune the remaining Waystone Obelisk';

    if (stage === 'defeat_warden') {
      objectiveTitle = 'Defeat the Sanctum Warden';
      objectiveDetail = 'Confront the awakened guardian in the Northern Sanctum';
    } else if (stage === 'enter_portal') {
      objectiveTitle = 'Enter the Cyan Sanctum Portal';
      objectiveDetail = 'Step into the glowing North Rift to complete Level 1';
    } else if (stage === 'complete') {
      objectiveTitle = 'Sanctum Cleared';
      objectiveDetail = 'The Rift of the Overgrown is stabilized';
    }

    return {
      phase: this.phase,
      hp: Math.round(this.hero.hp),
      maxHp: this.hero.maxHp,
      score: Math.round(this.hero.score),
      kills: this.hero.kills,
      totalEnemiesSpawned: this.totalEnemiesSpawned,
      elapsedTime: this.elapsedTime,
      damageTaken: Math.round(this.hero.damageTaken),
      cooldowns: { ...this.hero.cooldowns },
      objectiveStage: stage,
      objectiveTitle,
      objectiveDetail,
      obelisksAttuned: attuned,
      obelisksTotal: this.obelisks.length,
      wardenHp: warden ? Math.round(warden.hp) : null,
      wardenMaxHp: warden ? warden.maxHp : null,
      activeBanner: this.activeBanner
        ? { title: this.activeBanner.title, subtitle: this.activeBanner.subtitle }
        : null,
      heroX: this.hero.x,
      heroZ: this.hero.z,
      heroFacing: this.hero.facing,
      moveTarget: this.hero.moveTarget ? { ...this.hero.moveTarget } : null,
      obelisks: this.obelisks.map((o) => ({
        id: o.id,
        x: o.x,
        z: o.z,
        attuned: o.attuned,
        progress: o.progress,
      })),
      portal: {
        x: this.portal.x,
        z: this.portal.z,
        active: this.portal.active,
      },
      enemies: this.enemies
        .filter((e) => e.state !== 'dying')
        .map((e) => ({
          id: e.id,
          x: e.x,
          z: e.z,
          archetype: e.archetype,
          hp: Math.round(e.hp),
          maxHp: e.maxHp,
        })),
    };
  }
}
