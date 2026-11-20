import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  ATMOSPHERE_LIGHT_SLOTS,
  deterministicSeed,
  packEnvironmentLights,
  wrapCoordAroundFocus,
} from './atmosphericParticles';

test('deterministicSeed produces repeatable values strictly in [0, 1)', () => {
  for (let i = 0; i < 64; i++) {
    const a = deterministicSeed(i, 7);
    const b = deterministicSeed(i, 7);
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 1, `expected seed in [0,1), got ${a}`);
  }
  assert.notEqual(deterministicSeed(0, 1), deterministicSeed(1, 1));
});

test('wrapCoordAroundFocus keeps particles centered within [-span/2, +span/2) of focus', () => {
  const span = 44;
  for (const focus of [-25, 0, 18.5, 42]) {
    for (const drift of [-120, -13.4, 0, 19.2, 215.7]) {
      const wrapped = wrapCoordAroundFocus(11.3, drift, focus, span);
      const dist = wrapped - focus;
      assert.ok(
        dist >= -span * 0.5 - 1e-6 && dist <= span * 0.5 + 1e-6,
        `expected wrapped offset within ±${span * 0.5}, got ${dist}`
      );
    }
  }
});

test('packEnvironmentLights packs colors, clamps ranges/intensities, and clears unused slots', () => {
  const target = {
    positions: Array.from({ length: ATMOSPHERE_LIGHT_SLOTS }, () => new THREE.Vector4()),
    colors: Array.from({ length: ATMOSPHERE_LIGHT_SLOTS }, () => new THREE.Vector4()),
  };

  packEnvironmentLights(
    [
      { x: 0, y: 3.6, z: -19.2, range: 20, colorHex: 0x28ebff, intensity: 8.5 },
      { x: -17, y: 3.3, z: 2, range: 0, colorHex: 0xff8000, intensity: -2 },
    ],
    target
  );

  assert.equal(target.positions[0].x, 0);
  assert.equal(target.positions[0].w, 20);
  assert.ok(Math.abs(target.colors[0].x - 0x28 / 255) < 1e-5);
  assert.ok(Math.abs(target.colors[0].z - 1.0) < 1e-5);
  assert.equal(target.colors[0].w, 8.5);

  // Range clamped to >= 0.5 and negative intensity clamped to 0
  assert.equal(target.positions[1].w, 0.5);
  assert.equal(target.colors[1].w, 0);

  // Remaining slots cleared to zero intensity
  for (let i = 2; i < ATMOSPHERE_LIGHT_SLOTS; i++) {
    assert.equal(target.colors[i].w, 0);
  }
});
