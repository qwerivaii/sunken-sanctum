import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLevelColliders,
  HERO_SPAWN,
  isSegmentClear,
  OBELISK_DEFS,
  PORTAL_LOCATION,
} from './levelData';
import { GameSimulation } from './simulation';

test('level geometry keeps spawn and main walkways clear and unobstructed', () => {
  const colliders = buildLevelColliders();

  // Spawn -> Central Hub (passing through South Arch)
  assert.equal(
    isSegmentClear(HERO_SPAWN.x, HERO_SPAWN.z, 0, 1, 0.65, colliders),
    true,
    'Path from spawn through South Arch to Central Hub must be unobstructed'
  );

  // Central Hub -> West Waystone approach
  assert.equal(
    isSegmentClear(0, 2, OBELISK_DEFS[0].x + 2.5, OBELISK_DEFS[0].z, 0.65, colliders),
    true,
    'Path from Central Hub through West Arch to West Obelisk must be unobstructed'
  );

  // Central Hub -> East Waystone approach
  assert.equal(
    isSegmentClear(0, 0.5, OBELISK_DEFS[1].x - 2.5, OBELISK_DEFS[1].z, 0.65, colliders),
    true,
    'Path from Central Hub through East Arch to East Obelisk must be unobstructed'
  );

  // Central Hub -> North Sanctum Portal
  assert.equal(
    isSegmentClear(0, 0, PORTAL_LOCATION.x, PORTAL_LOCATION.z + 1.2, 0.65, colliders),
    true,
    'Path from Central Hub through North Arch to Cyan Portal must be unobstructed'
  );
});

test('hero survives idle at spawn without taking damage', () => {
  const sim = new GameSimulation();
  sim.startGame();
  const startHp = sim.hero.hp;

  for (let i = 0; i < 120; i++) {
    sim.step(0.05); // 6 seconds idle
  }

  assert.equal(sim.phase, 'playing');
  assert.equal(sim.hero.hp, startHp);
});

test('click-to-move navigates hero to destination and slides cleanly around pillars', () => {
  const sim = new GameSimulation();
  sim.startGame();
  sim.setMoveTarget(0, 12);

  for (let i = 0; i < 60; i++) {
    sim.step(0.05);
  }

  assert.ok(Math.hypot(sim.hero.x - 0, sim.hero.z - 12) < 0.6, 'Hero should reach click-move waypoint');
  assert.ok(sim.hero.walkDistance > 8, 'Walk distance should track movement for gait sync');
});

test('all 4 hotbar abilities cast, trigger cooldowns, deal damage, and emit expected VFX', () => {
  const sim = new GameSimulation();
  sim.startGame();

  // Position hero right next to central stalker
  const stalker = sim.enemies.find((e) => e.id === 'e_mid_1')!;
  sim.hero.x = stalker.x;
  sim.hero.z = stalker.z + 2.0;
  sim.hero.facing = Math.PI;
  const initialHp = stalker.hp;

  // 1: Cleave
  assert.equal(sim.castAbility('cleave', { x: stalker.x, z: stalker.z }), true);
  assert.ok(sim.hero.cooldowns.cleave > 2.0);
  assert.ok(stalker.hp < initialHp, 'Cleave should damage enemy in front');
  // Cannot cast again while on cooldown
  assert.equal(sim.castAbility('cleave'), false);

  // 2: Phase Dash
  const preDashZ = sim.hero.z;
  assert.equal(sim.castAbility('dash', { x: sim.hero.x, z: sim.hero.z - 6 }), true);
  for (let i = 0; i < 8; i++) sim.step(0.04);
  assert.ok(sim.hero.z < preDashZ - 3.5, 'Phase Dash should displace hero forward');

  // 3: Rune Sigil (summoning circle + heal + AoE damage)
  sim.hero.hp = 80;
  const target2 = sim.enemies.find((e) => e.id === 'e_mid_2')!;
  sim.hero.x = target2.x;
  sim.hero.z = target2.z + 1.5;
  const preSigilHp = target2.hp;
  assert.equal(sim.castAbility('sigil', { x: target2.x, z: target2.z }), true);
  for (let i = 0; i < 20; i++) sim.step(0.05);
  assert.ok(target2.hp < preSigilHp, 'Rune Sigil should detonate enemies inside circle');
  assert.ok(sim.hero.hp > 80, 'Rune Sigil should heal hero standing inside');

  // 4: Skyward Lance (light beam strike)
  const charger = sim.enemies.find((e) => e.archetype === 'charger')!;
  sim.hero.x = charger.x;
  sim.hero.z = charger.z + 4.0;
  const preBeamHp = charger.hp;
  sim.drainEvents();
  assert.equal(sim.castAbility('beam', { x: charger.x, z: charger.z }), true);
  let sawLightBeam = false;
  for (let i = 0; i < 16; i++) {
    sim.step(0.05);
    const evs = sim.drainEvents();
    if (evs.some((ev) => ev.type === 'light_beam')) sawLightBeam = true;
  }
  assert.equal(sawLightBeam, true, 'Skyward Lance must emit a light_beam event');
  assert.ok(charger.hp < preBeamHp, 'Skyward Lance must deal heavy damage');
});

test('distinct enemy AI policies: wisp kites & fires bolts, charger telegraphs & rushes', () => {
  const sim = new GameSimulation();
  sim.startGame();

  // Test Rift Wisp kiting & ranged bolt
  const wisp = sim.enemies.find((e) => e.archetype === 'wisp')!;
  sim.hero.x = wisp.x + 3.5;
  sim.hero.z = wisp.z;
  sim.hero.invulnTimer = 99;
  const startDist = Math.hypot(sim.hero.x - wisp.x, sim.hero.z - wisp.z);

  let sawProjectile = false;
  for (let i = 0; i < 50; i++) {
    sim.step(0.05);
    if (sim.projectiles.length > 0) sawProjectile = true;
  }
  const endDist = Math.hypot(sim.hero.x - wisp.x, sim.hero.z - wisp.z);
  assert.ok(endDist > startDist + 0.5, 'Rift Wisp should retreat/kite away when hero is too close');
  assert.equal(sawProjectile, true, 'Rift Wisp should fire an arcane projectile after telegraph');

  // Test Stone Charger telegraph -> charge rush
  const charger = sim.enemies.find((e) => e.archetype === 'charger')!;
  sim.hero.x = charger.x;
  sim.hero.z = charger.z + 6.0;
  let sawChargeTelegraph = false;
  for (let i = 0; i < 50; i++) {
    sim.step(0.05);
    if (charger.state === 'telegraph' && charger.telegraphKind === 'charge') {
      sawChargeTelegraph = true;
    }
  }
  assert.equal(sawChargeTelegraph, true, 'Stone Charger should telegraph a line-of-sight charge');
});

test('full Level 1 progression: attune 2 obelisks -> spawn & defeat Warden -> enter Portal -> Victory', () => {
  const sim = new GameSimulation();
  sim.startGame();

  // Clear all west and east obelisk guards
  for (const e of sim.enemies) {
    if (e.zoneId === 'west_courtyard' || e.zoneId === 'east_colonnade') {
      e.hp = 0;
      e.state = 'dying';
      e.koTimer = 0.01;
    }
  }
  sim.step(0.05);

  // Stand at West Obelisk to attune it
  sim.hero.x = OBELISK_DEFS[0].x + 2.0;
  sim.hero.z = OBELISK_DEFS[0].z;
  for (let i = 0; i < 35; i++) sim.step(0.05);
  assert.equal(sim.obelisks[0].attuned, true, 'West Obelisk should attune when hero stands in clear circle');

  // Stand at East Obelisk to attune it -> triggers Sanctum Warden spawn
  sim.hero.x = OBELISK_DEFS[1].x - 2.0;
  sim.hero.z = OBELISK_DEFS[1].z;
  for (let i = 0; i < 35; i++) sim.step(0.05);
  assert.equal(sim.obelisks[1].attuned, true, 'East Obelisk should attune');
  assert.equal(sim.wardenSpawned, true, 'Sanctum Warden should awaken after both obelisks are attuned');
  assert.equal(sim.getObjectiveStage(), 'defeat_warden');

  // Defeat the Sanctum Warden via Skyward Lance + strikes
  const warden = sim.enemies.find((e) => e.archetype === 'warden')!;
  assert.ok(warden, 'Warden entity must exist');
  sim.hero.x = warden.x;
  sim.hero.z = warden.z + 2.0;
  warden.hp = 20;
  sim.hero.attackCooldown = 0;
  sim.triggerBasicAttack({ x: warden.x, z: warden.z });
  sim.step(0.05);

  assert.equal(sim.wardenDefeated, true, 'Defeating Warden should register');
  assert.equal(sim.portal.active, true, 'Northern Cyan Portal must activate after Warden defeat');
  assert.equal(sim.getObjectiveStage(), 'enter_portal');

  // Step into the active Northern Cyan Portal -> Victory!
  sim.hero.x = PORTAL_LOCATION.x;
  sim.hero.z = PORTAL_LOCATION.z + 1.5;
  for (let i = 0; i < 4; i++) sim.step(0.05);

  assert.equal(sim.phase, 'victory');
  assert.ok(sim.runSummary?.victory === true);
});

test('player defeat is reachable when HP drops to zero', () => {
  const sim = new GameSimulation();
  sim.startGame();

  // Bring hero next to a charger with low HP so an enemy attack defeats hero
  const charger = sim.enemies.find((e) => e.archetype === 'charger')!;
  sim.hero.hp = 10;
  sim.hero.x = charger.x;
  sim.hero.z = charger.z + 2.0;
  charger.attackCooldown = 0;

  for (let i = 0; i < 120; i++) {
    sim.step(0.05);
    if (sim.phase === 'defeat') break;
  }

  assert.equal(sim.hero.hp, 0);
  assert.equal(sim.phase, 'defeat');
  assert.equal(sim.runSummary?.victory, false);
});
