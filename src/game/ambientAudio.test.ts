import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AmbientTriggerController,
  computeSpatialParams,
  createLevelAmbientZones,
} from './ambientAudio';
import { ARCHES, OBELISK_DEFS, PORTAL_LOCATION } from './levelData';

test('computeSpatialParams calculates distance rolloff and camera-aligned stereo pan', () => {
  // At exact source position: full gain, centered pan
  const atSource = computeSpatialParams(10, 5, 10, 5, 15, 1, 0);
  assert.equal(atSource.gain, 1);
  assert.equal(atSource.pan, 0);

  // Outside max radius: zero gain
  const far = computeSpatialParams(0, 0, 20, 0, 15, 1, 0);
  assert.equal(far.gain, 0);

  // Source to the right of camera screen-right pans positive; to the left pans negative
  const right = computeSpatialParams(0, 0, 6, 0, 15, 1, 0);
  const left = computeSpatialParams(0, 0, -6, 0, 15, 1, 0);
  assert.ok(right.pan > 0.2 && right.pan <= 0.85);
  assert.ok(left.pan < -0.2 && left.pan >= -0.85);
});

test('level ambient zones include stone crumbles, wind howls, and portal/obelisk magic hums', () => {
  const zones = createLevelAmbientZones();
  assert.ok(zones.some((z) => z.kind === 'stone_crumble'));
  assert.ok(zones.some((z) => z.kind === 'wind_howl'));
  assert.ok(zones.some((z) => z.kind === 'magic_hum' && z.id === 'hum_cyan_portal'));
});

test('AmbientTriggerController fires proximity triggers by landmark and respects cooldowns', () => {
  const controller = new AmbientTriggerController();
  const fixedRand = () => 0.5;

  // Stand right at the Northern Cyan Portal and advance past initial cooldown
  let firedPortalHum = false;
  for (let i = 0; i < 6; i++) {
    const res = controller.update({
      dt: 0.5,
      heroX: PORTAL_LOCATION.x,
      heroZ: PORTAL_LOCATION.z + 2,
      cameraRightX: 1,
      cameraRightZ: 0,
      portalActive: true,
      attunedObeliskIds: [OBELISK_DEFS[0].id, OBELISK_DEFS[1].id],
      randomFn: fixedRand,
    });
    if (res.triggers.some((t) => t.kind === 'magic_hum' && t.zoneId === 'hum_cyan_portal')) {
      firedPortalHum = true;
      assert.ok(res.triggers[0].arcanePower >= 0.9);
      assert.ok(res.beds.portalGain > 0.7);
    }
  }
  assert.equal(firedPortalHum, true);

  // Immediately next tick must be suppressed by global cooldown (no audio spam)
  const immediateNext = controller.update({
    dt: 0.1,
    heroX: PORTAL_LOCATION.x,
    heroZ: PORTAL_LOCATION.z + 2,
    cameraRightX: 1,
    cameraRightZ: 0,
    portalActive: true,
    attunedObeliskIds: [],
    randomFn: fixedRand,
  });
  assert.equal(immediateNext.triggers.length, 0);
});

test('AmbientTriggerController triggers wind howl near stone arches and stone crumble near broken pillars', () => {
  const arch = ARCHES[0];
  const windController = new AmbientTriggerController(
    createLevelAmbientZones().filter((z) => z.kind === 'wind_howl')
  );
  const windRes = windController.update({
    dt: 2.0,
    heroX: arch.x,
    heroZ: arch.z,
    cameraRightX: 1,
    cameraRightZ: 0,
    portalActive: false,
    attunedObeliskIds: [],
    randomFn: () => 0.5,
  });
  assert.equal(windRes.triggers.length, 1);
  assert.equal(windRes.triggers[0].kind, 'wind_howl');
  assert.ok(windRes.beds.windGain > 0.7);

  const crumbleZones = createLevelAmbientZones().filter((z) => z.kind === 'stone_crumble');
  const crumbleController = new AmbientTriggerController(crumbleZones);
  const crumbleRes = crumbleController.update({
    dt: 2.0,
    heroX: crumbleZones[0].x,
    heroZ: crumbleZones[0].z,
    cameraRightX: 1,
    cameraRightZ: 0,
    portalActive: false,
    attunedObeliskIds: [],
    randomFn: () => 0.5,
  });
  assert.equal(crumbleRes.triggers.length, 1);
  assert.equal(crumbleRes.triggers[0].kind, 'stone_crumble');
});
