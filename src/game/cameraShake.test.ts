import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CameraShakeController,
  CameraShakeOutput,
  computeShakeFalloff,
} from './cameraShake';
import { GameSimulation } from './simulation';

function makeOut(): CameraShakeOutput {
  return { offsetX: 0, offsetY: 0, offsetZ: 0, rollRad: 0, fovDelta: 0 };
}

test('computeShakeFalloff is full within 3.5m, decays smoothly, and reaches 0 at maxRange', () => {
  assert.equal(computeShakeFalloff(0, 28), 1);
  assert.equal(computeShakeFalloff(3.5, 28), 1);

  const mid = computeShakeFalloff(15.75, 28);
  assert.ok(mid > 0.2 && mid < 0.3, `Expected quadratic midpoint ~0.25, got ${mid}`);

  assert.equal(computeShakeFalloff(28, 28), 0);
  assert.equal(computeShakeFalloff(42, 28), 0);
});

test('CameraShakeController crit profile produces directional punch, negative FOV tightening, and decays to zero', () => {
  const ctrl = new CameraShakeController();
  const out = makeOut();

  ctrl.trigger({
    trauma: 0.48,
    style: 'crit',
    dirX: 1,
    dirZ: 0,
  });

  assert.equal(ctrl.getActiveStyle(), 'crit');
  assert.ok(ctrl.getTrauma() > 0.45);

  ctrl.update(0.016, out);
  assert.ok(out.offsetX > 0, `Expected positive X directional kick on crit, got ${out.offsetX}`);
  assert.ok(out.fovDelta < -0.3, `Expected negative FOV punch on crit, got ${out.fovDelta}`);
  assert.ok(Math.abs(out.rollRad) > 0, 'Expected non-zero camera roll during crit shake');

  for (let i = 0; i < 60; i++) {
    ctrl.update(0.05, out);
  }
  assert.equal(ctrl.getTrauma(), 0);
  assert.equal(out.offsetX, 0);
  assert.equal(out.offsetY, 0);
  assert.equal(out.offsetZ, 0);
  assert.equal(out.rollRad, 0);
  assert.equal(out.fovDelta, 0);
});

test('CameraShakeController heavy_land profile produces downward seismic jolt and overrides impact style', () => {
  const ctrl = new CameraShakeController();
  const out = makeOut();

  ctrl.trigger({ trauma: 0.25, style: 'impact' });
  assert.equal(ctrl.getActiveStyle(), 'impact');

  ctrl.trigger({
    trauma: 0.78,
    style: 'heavy_land',
    dirX: 0,
    dirZ: 1,
  });
  assert.equal(ctrl.getActiveStyle(), 'heavy_land');

  ctrl.update(0.016, out);
  assert.ok(
    out.offsetY < -0.25,
    `Expected strong downward vertical jolt on heavy enemy landing, got ${out.offsetY}`
  );
  assert.ok(out.fovDelta > 0.2, `Expected positive FOV widen on heavy slam, got ${out.fovDelta}`);
  assert.ok(Math.abs(out.rollRad) > 0.002, `Expected seismic camera roll, got ${out.rollRad}`);

  // Reset immediately zeroes all state
  ctrl.reset();
  ctrl.update(0.016, out);
  assert.equal(ctrl.getTrauma(), 0);
  assert.equal(out.offsetX, 0);
  assert.equal(out.offsetY, 0);
  assert.equal(out.rollRad, 0);
  assert.equal(out.fovDelta, 0);
});

test('GameSimulation emits crit camera_shake with direction on critical hits', () => {
  const sim = new GameSimulation();
  sim.startGame();
  sim.drainEvents();

  // Position hero next to an enemy and cast Runic Cleave (guaranteed critical hit)
  const target = sim.enemies.find((e) => e.state !== 'dying');
  assert.ok(target, 'Expected living enemy in level');
  sim.hero.x = target.x;
  sim.hero.z = target.z + 1.4;

  const castOk = sim.castAbility('cleave', { x: target.x, z: target.z });
  assert.equal(castOk, true);

  const events = sim.drainEvents();
  const critShakes = events.filter(
    (ev) => ev.type === 'camera_shake' && ev.style === 'crit'
  );
  assert.ok(
    critShakes.length >= 1,
    `Expected at least one crit camera_shake event, got ${JSON.stringify(events.filter((e) => e.type === 'camera_shake'))}`
  );
  const first = critShakes[0];
  assert.equal(first.type, 'camera_shake');
  assert.ok(first.trauma >= 0.35);
  assert.ok(first.sourceX !== undefined && first.sourceZ !== undefined);
});

test('GameSimulation emits heavy_land camera_shake when Sanctum Warden arrives and when Ruin Charger lands rush', () => {
  const sim = new GameSimulation();
  sim.startGame();
  sim.drainEvents();

  // 1) Ruin Charger finishing its rush emits heavy_land shake
  const charger = sim.enemies.find((e) => e.archetype === 'charger');
  assert.ok(charger, 'Expected Ruin Charger in level');
  sim.hero.x = charger.x + 8;
  sim.hero.z = charger.z;
  charger.state = 'attack';
  charger.stateTimer = 0.02;
  charger.facing = Math.PI;

  sim.step(0.05);
  const chargerEvents = sim.drainEvents();
  const chargerLandShake = chargerEvents.find(
    (ev) => ev.type === 'camera_shake' && ev.style === 'heavy_land'
  );
  assert.ok(chargerLandShake, 'Expected heavy_land camera_shake when Ruin Charger lands its rush');

  // 2) Attuning the final obelisk summons the Sanctum Warden with a seismic heavy_land shake
  for (const e of sim.enemies) {
    if (e.zoneId === 'east_colonnade') {
      e.hp = 0;
      e.state = 'dying';
      e.koTimer = 0.01;
    }
  }
  sim.step(0.05);
  sim.obelisks[0].attuned = true;
  sim.obelisks[0].progress = 1;
  sim.hero.x = sim.obelisks[1].x - 1.5;
  sim.hero.z = sim.obelisks[1].z;
  sim.drainEvents();

  let sawWardenLandShake = false;
  for (let i = 0; i < 40; i++) {
    sim.step(0.05);
    const evs = sim.drainEvents();
    if (
      evs.some(
        (ev) => ev.type === 'camera_shake' && ev.style === 'heavy_land' && ev.trauma >= 0.7
      )
    ) {
      sawWardenLandShake = true;
      break;
    }
  }
  assert.ok(
    sawWardenLandShake,
    'Expected high-trauma heavy_land camera_shake when Sanctum Warden lands'
  );
});
