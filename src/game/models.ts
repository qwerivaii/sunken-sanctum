import * as THREE from 'three';
import { applyFoliageWindToMaterial, FoliageWindUniforms } from './foliageShader';
import { ProceduralTextureSet } from './textures';
import { EnemyArchetype } from './types';

export interface SharedMaterials {
  ruinStone: THREE.MeshStandardMaterial;
  ruinStoneDark: THREE.MeshStandardMaterial;
  flagstone: THREE.MeshStandardMaterial;
  mossCap: THREE.MeshStandardMaterial;
  vine: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  cyanRuneOff: THREE.MeshStandardMaterial;
  cyanRuneOn: THREE.MeshStandardMaterial;
  bronzeTrim: THREE.MeshPhysicalMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  dispose: () => void;
}

export function createSharedMaterials(
  tex: ProceduralTextureSet,
  windUniforms?: FoliageWindUniforms
): SharedMaterials {
  const ruinStone = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex.ruinStoneMap,
    normalMap: tex.ruinStoneNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: tex.ruinStoneRoughness,
    roughness: 0.92,
    metalness: 0.05,
  });

  const ruinStoneDark = new THREE.MeshStandardMaterial({
    color: 0xaab9b7,
    map: tex.ruinStoneMap,
    normalMap: tex.ruinStoneNormal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughnessMap: tex.ruinStoneRoughness,
    roughness: 0.94,
    metalness: 0.08,
  });

  const flagstone = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex.flagstoneMap,
    normalMap: tex.flagstoneNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: tex.flagstoneRoughness,
    roughness: 0.88,
    metalness: 0.05,
  });

  const mossCap = new THREE.MeshStandardMaterial({
    color: 0x336039,
    normalMap: tex.mossGroundNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.94,
    metalness: 0.0,
  });

  const vine = new THREE.MeshStandardMaterial({
    color: 0x2a5430,
    roughness: 0.86,
    metalness: 0.0,
  });
  if (windUniforms) {
    applyFoliageWindToMaterial(vine, windUniforms, { swayScale: 1.15, mode: 'vine' });
  }

  const bark = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex.barkMap,
    normalMap: tex.barkNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.92,
    metalness: 0.02,
  });

  const cyanRuneOff = new THREE.MeshStandardMaterial({
    color: 0x1d5260,
    emissive: 0x14829c,
    emissiveIntensity: 0.65,
    roughness: 0.28,
    metalness: 0.4,
  });

  const cyanRuneOn = new THREE.MeshStandardMaterial({
    color: 0x26ecff,
    emissive: 0x00d8ff,
    emissiveIntensity: 1.65,
    roughness: 0.16,
    metalness: 0.15,
  });

  const bronzeTrim = new THREE.MeshPhysicalMaterial({
    color: 0xb6955d,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughness: 0.28,
    metalness: 0.86,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  });

  const contactShadow = new THREE.MeshBasicMaterial({
    map: tex.contactShadowTex,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const all = [
    ruinStone,
    ruinStoneDark,
    flagstone,
    mossCap,
    vine,
    bark,
    cyanRuneOff,
    cyanRuneOn,
    bronzeTrim,
    contactShadow,
  ];

  return {
    ruinStone,
    ruinStoneDark,
    flagstone,
    mossCap,
    vine,
    bark,
    cyanRuneOff,
    cyanRuneOn,
    bronzeTrim,
    contactShadow,
    dispose: () => {
      for (const m of all) m.dispose();
    },
  };
}

/**
 * Creates a smooth sculpted fluted column shaft (24 radial segments with 12 classical concave flutes).
 */
function createFlutedShaftGeometry(
  radiusTop: number,
  radiusBottom: number,
  height: number
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 36, 4, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.05) {
      const ang = Math.atan2(z, x);
      const yFade = Math.sin(((y + height / 2) / height) * Math.PI);
      const flute = Math.cos(ang * 12) * 0.045 * yFade;
      const scale = (r + flute * radiusBottom) / r;
      pos.setX(i, x * scale);
      pos.setZ(i, z * scale);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function addContactShadow(parent: THREE.Group, radius: number, mat: THREE.MeshBasicMaterial): void {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.025;
  parent.add(disc);
}

export interface HeroRig {
  root: THREE.Group;
  body: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  swordArm: THREE.Group;
  cloak: THREE.Mesh;
  materialsToFlash: THREE.MeshStandardMaterial[];
}

/**
 * High-detail 14-part Runeblade Sentinel hero model with brushed physical steel armor,
 * beveled pauldrons, layered tassets, bronze clasp, and runic glowing broadsword.
 */
export function buildHeroRig(shared: SharedMaterials, tex: ProceduralTextureSet): HeroRig {
  const root = new THREE.Group();
  addContactShadow(root, 0.92, shared.contactShadow);

  const body = new THREE.Group();
  root.add(body);

  const armorMat = new THREE.MeshPhysicalMaterial({
    color: 0x3f5464,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.28,
    metalness: 0.82,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
  });
  const cloakMat = new THREE.MeshStandardMaterial({
    color: 0x164a56,
    roughness: 0.84,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfa966,
    normalMap: tex.metalNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.22,
    metalness: 0.9,
    clearcoat: 0.4,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x6ef8ff,
    emissive: 0x16e6ff,
    emissiveIntensity: 2.2,
    roughness: 0.12,
    metalness: 0.1,
  });
  const bladeMat = new THREE.MeshPhysicalMaterial({
    color: 0xaafaff,
    emissive: 0x12d8f8,
    emissiveIntensity: 1.55,
    roughness: 0.14,
    metalness: 0.88,
    clearcoat: 0.6,
  });

  // Articulated greaves & armored sabatons
  const makeLeg = (offsetX: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(offsetX, 0.72, 0);
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.11, 0.62, 16), armorMat);
    greave.position.y = -0.3;
    greave.castShadow = true;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), trimMat);
    knee.position.set(0, -0.06, 0.07);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.36), armorMat);
    boot.position.set(0, -0.63, 0.06);
    boot.castShadow = true;
    leg.add(greave, knee, boot);
    return leg;
  };
  const leftLeg = makeLeg(-0.18);
  const rightLeg = makeLeg(0.18);
  body.add(leftLeg, rightLeg);

  // Sculpted cuirass + collar + layered waist belt
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.27, 0.76, 20), armorMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  body.add(torso);

  const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.065, 10, 24), trimMat);
  gorget.rotation.x = Math.PI / 2;
  gorget.position.y = 1.48;
  body.add(gorget);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.15, 20), trimMat);
  belt.position.y = 0.78;
  body.add(belt);

  const chestRune = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), visorMat);
  chestRune.position.set(0, 1.18, 0.33);
  chestRune.scale.set(0.85, 1.3, 0.45);
  body.add(chestRune);

  // Multi-layered beveled pauldrons
  const pauldronGeo = new THREE.SphereGeometry(0.26, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.65);
  const pauldronRimGeo = new THREE.TorusGeometry(0.24, 0.03, 8, 20);
  for (const side of [-1, 1]) {
    const pGroup = new THREE.Group();
    pGroup.position.set(side * 0.44, 1.39, 0);
    pGroup.rotation.z = -side * 0.35;
    const shell = new THREE.Mesh(pauldronGeo, trimMat);
    shell.castShadow = true;
    const rim = new THREE.Mesh(pauldronRimGeo, armorMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.02;
    pGroup.add(shell, rim);
    body.add(pGroup);
  }

  // Smooth Hooded Sentinel Helm + glowing cyan visor slit
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.58, 18), cloakMat);
  helm.position.set(0, 1.77, -0.02);
  helm.castShadow = true;
  const facePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.175, 0.28, 16), armorMat);
  facePlate.position.set(0, 1.66, 0.05);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.065, 0.14), visorMat);
  visor.position.set(0, 1.68, 0.18);
  body.add(helm, facePlate, visor);

  // Flowing sculpted cape (beveled ExtrudeGeometry)
  const cloakShape = new THREE.Shape();
  cloakShape.moveTo(-0.34, 0);
  cloakShape.lineTo(0.34, 0);
  cloakShape.lineTo(0.48, -1.06);
  cloakShape.lineTo(0.12, -0.94);
  cloakShape.lineTo(-0.15, -1.14);
  cloakShape.lineTo(-0.46, -1.0);
  cloakShape.closePath();
  const cloakGeo = new THREE.ExtrudeGeometry(cloakShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.position.set(0, 1.46, -0.29);
  cloak.rotation.x = 0.18;
  cloak.castShadow = true;
  body.add(cloak);

  // Off-hand vambrace arm
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.092, 0.58, 14), armorMat);
  leftArm.position.set(-0.46, 1.05, 0.08);
  leftArm.rotation.z = 0.18;
  leftArm.rotation.x = -0.22;
  body.add(leftArm);

  // Sword arm pivot + detailed Runeblade Broadsword
  const swordArm = new THREE.Group();
  swordArm.position.set(0.48, 1.32, 0.05);
  const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.092, 0.56, 14), armorMat);
  rightArmMesh.position.set(0, -0.24, 0.12);
  rightArmMesh.rotation.x = -0.5;
  swordArm.add(rightArmMesh);

  const swordGroup = new THREE.Group();
  swordGroup.position.set(0.04, -0.44, 0.34);
  swordGroup.rotation.x = 1.05;

  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 1), trimMat);
  pommel.position.y = -0.18;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.34, 12), trimMat);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.085, 0.12), trimMat);
  guard.position.y = 0.16;
  const guardGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), visorMat);
  guardGem.position.set(0, 0.16, 0.06);

  // Beveled Runeblade + inner glowing fuller
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.09, 0);
  bladeShape.lineTo(0.09, 0);
  bladeShape.lineTo(0.065, 1.32);
  bladeShape.lineTo(0, 1.58);
  bladeShape.lineTo(-0.065, 1.32);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  bladeGeo.translate(0, 0, -0.018);
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.y = 0.2;
  blade.castShadow = true;

  swordGroup.add(pommel, hilt, guard, guardGem, blade);
  swordArm.add(swordGroup);
  body.add(swordArm);

  return {
    root,
    body,
    leftLeg,
    rightLeg,
    swordArm,
    cloak,
    materialsToFlash: [armorMat, cloakMat, trimMat],
  };
}

export interface EnemyRig {
  root: THREE.Group;
  body: THREE.Group;
  flashMaterials: THREE.MeshStandardMaterial[];
  orbitRing?: THREE.Object3D;
  telegraphMesh: THREE.Mesh;
  hpBarBg: THREE.Mesh;
  hpBarFill: THREE.Mesh;
}

/**
 * Higher-detail procedural HD models for all 4 distinct enemy types.
 */
export function buildEnemyRig(
  archetype: EnemyArchetype,
  shared: SharedMaterials,
  tex: ProceduralTextureSet
): EnemyRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  let orbitRing: THREE.Object3D | undefined;
  let shadowR = 0.82;
  let hpBarY = 2.2;

  if (archetype === 'stalker') {
    shadowR = 0.82;
    hpBarY = 1.98;
    const hideMat = new THREE.MeshStandardMaterial({
      color: 0x354438,
      normalMap: tex.ruinStoneNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.86,
      metalness: 0.1,
    });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x4f6d4a,
      roughness: 0.7,
      metalness: 0.14,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffd066,
      emissive: 0xff8814,
      emissiveIntensity: 2.3,
      roughness: 0.15,
    });
    flashMaterials.push(hideMat, shardMat);

    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 1), hideMat);
    torso.position.set(0, 0.74, 0);
    torso.scale.set(0.96, 0.78, 1.38);
    torso.castShadow = true;
    body.add(torso);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 12), hideMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.84, 0.62);
    head.castShadow = true;
    body.add(head);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), eyeMat);
    eyeL.position.set(-0.14, 0.91, 0.68);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.14;
    body.add(eyeL, eyeR);

    for (let i = 0; i < 4; i++) {
      const spine = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46 - i * 0.05, 8), shardMat);
      spine.position.set(0, 1.14 - i * 0.06, 0.24 - i * 0.26);
      spine.rotation.x = -0.35;
      body.add(spine);
    }

    const legGeo = new THREE.CylinderGeometry(0.085, 0.06, 0.7, 10);
    const positions = [
      [-0.34, 0.35, 0.32],
      [0.34, 0.35, 0.32],
      [-0.32, 0.35, -0.36],
      [0.32, 0.35, -0.36],
    ];
    for (const [lx, ly, lz] of positions) {
      const leg = new THREE.Mesh(legGeo, hideMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      body.add(leg);
    }
  } else if (archetype === 'wisp') {
    shadowR = 0.74;
    hpBarY = 2.48;
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x4b5769,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.42,
      metalness: 0.58,
      clearcoat: 0.35,
    });
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: 0xffaef7,
      emissive: 0xd936e8,
      emissiveIntensity: 2.35,
      roughness: 0.12,
      metalness: 0.2,
      clearcoat: 0.8,
    });
    flashMaterials.push(shellMat, coreMat);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.39, 1), coreMat);
    core.position.y = 1.38;
    core.castShadow = true;
    body.add(core);

    const ringGroup = new THREE.Group();
    ringGroup.position.y = 1.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.075, 14, 36), shellMat);
    ring.rotation.x = Math.PI / 2.4;
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.032, 10, 28), shared.bronzeTrim);
    innerRing.rotation.y = Math.PI / 3;
    ringGroup.add(ring, innerRing);

    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), shellMat);
      shard.position.set(Math.cos(ang) * 0.75, Math.sin(ang) * 0.22, Math.sin(ang) * 0.75);
      ringGroup.add(shard);
    }
    body.add(ringGroup);
    orbitRing = ringGroup;

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.82, 12), coreMat);
    tail.rotation.x = Math.PI;
    tail.position.y = 0.68;
    body.add(tail);
  } else if (archetype === 'charger') {
    shadowR = 1.18;
    hpBarY = 2.8;
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xb4c2bf,
      map: tex.ruinStoneMap,
      normalMap: tex.ruinStoneNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.88,
      metalness: 0.1,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x355e38,
      normalMap: tex.mossGroundNormal,
      roughness: 0.94,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xffcf6b,
      emissive: 0xff6e1a,
      emissiveIntensity: 2.2,
      roughness: 0.18,
    });
    flashMaterials.push(stoneMat, mossMat);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.16, 0.94), stoneMat);
    chest.position.y = 1.32;
    chest.castShadow = true;
    body.add(chest);

    const coreRune = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), runeMat);
    coreRune.position.set(0, 1.36, 0.5);
    coreRune.scale.set(1, 1.32, 0.48);
    body.add(coreRune);

    const shoulderGeo = new THREE.IcosahedronGeometry(0.48, 1);
    const shL = new THREE.Mesh(shoulderGeo, stoneMat);
    shL.position.set(-0.78, 1.66, 0.04);
    shL.castShadow = true;
    const shR = new THREE.Mesh(shoulderGeo, stoneMat);
    shR.position.set(0.78, 1.66, 0.04);
    shR.castShadow = true;
    const mossCrown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.44, 1), mossMat);
    mossCrown.position.set(0, 2.04, -0.04);
    mossCrown.scale.set(1.42, 0.54, 1.12);
    body.add(shL, shR, mossCrown);

    const armGeo = new THREE.BoxGeometry(0.38, 0.96, 0.42);
    const armL = new THREE.Mesh(armGeo, stoneMat);
    armL.position.set(-0.84, 0.92, 0.22);
    armL.castShadow = true;
    const armR = new THREE.Mesh(armGeo, stoneMat);
    armR.position.set(0.84, 0.92, 0.22);
    armR.castShadow = true;
    const legGeo = new THREE.BoxGeometry(0.4, 0.72, 0.46);
    const legL = new THREE.Mesh(legGeo, stoneMat);
    legL.position.set(-0.35, 0.36, 0);
    const legR = new THREE.Mesh(legGeo, stoneMat);
    legR.position.set(0.35, 0.36, 0);
    body.add(armL, armR, legL, legR);
  } else {
    shadowR = 1.52;
    hpBarY = 3.92;
    const obsidianMat = new THREE.MeshPhysicalMaterial({
      color: 0x263440,
      normalMap: tex.metalNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.3,
      metalness: 0.82,
      clearcoat: 0.5,
    });
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4ad62,
      normalMap: tex.metalNormal,
      roughness: 0.22,
      metalness: 0.92,
      clearcoat: 0.45,
    });
    const riftMat = new THREE.MeshStandardMaterial({
      color: 0xff92a8,
      emissive: 0xff2b55,
      emissiveIntensity: 2.5,
      roughness: 0.14,
    });
    flashMaterials.push(obsidianMat, goldMat);

    const lowerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.94, 1.36, 18), obsidianMat);
    lowerRobe.position.y = 0.7;
    lowerRobe.castShadow = true;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.58, 1.26, 18), obsidianMat);
    torso.position.y = 1.92;
    torso.castShadow = true;
    const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 1), riftMat);
    heart.position.set(0, 1.96, 0.64);
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.94, 14), goldMat);
    helm.position.y = 3.0;
    helm.castShadow = true;
    body.add(lowerRobe, torso, heart, helm);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.085, 14, 36), goldMat);
    halo.position.set(0, 2.86, -0.2);
    body.add(halo);
    orbitRing = halo;

    const pL = new THREE.Mesh(new THREE.IcosahedronGeometry(0.49, 1), goldMat);
    pL.position.set(-1.04, 2.38, 0);
    const pR = pL.clone();
    pR.position.x = 1.04;
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 1.15, 14), obsidianMat);
    armL.position.set(-1.05, 1.65, 0.18);
    const armR = armL.clone();
    armR.position.x = 1.05;

    const spearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.7, 14), goldMat);
    spearShaft.position.set(1.18, 1.85, 0.52);
    spearShaft.rotation.x = 0.32;
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.94, 8), riftMat);
    spearTip.position.set(1.18, 3.66, 1.12);
    spearTip.rotation.x = 0.32;

    body.add(pL, pR, armL, armR, spearShaft, spearTip);
  }

  addContactShadow(root, shadowR, shared.contactShadow);

  const telegraphMat = new THREE.MeshBasicMaterial({
    color: archetype === 'warden' || archetype === 'charger' ? 0xff4938 : 0xffaa2b,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const telegraphMesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 36), telegraphMat);
  telegraphMesh.rotation.x = -Math.PI / 2;
  telegraphMesh.position.y = 0.06;
  telegraphMesh.visible = false;
  root.add(telegraphMesh);

  const barW = archetype === 'warden' ? 2.1 : 1.15;
  const hpBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(barW, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x0b1218, side: THREE.DoubleSide })
  );
  hpBarBg.position.set(0, hpBarY, 0);
  hpBarBg.visible = false;

  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barW - 0.06, 0.09),
    new THREE.MeshBasicMaterial({
      color: archetype === 'warden' ? 0xff4668 : 0xe85a4a,
      side: THREE.DoubleSide,
    })
  );
  hpBarFill.position.set(0, 0, 0.01);
  hpBarBg.add(hpBarFill);
  root.add(hpBarBg);

  return {
    root,
    body,
    flashMaterials,
    orbitRing,
    telegraphMesh,
    hpBarBg,
    hpBarFill,
  };
}

/**
 * High-detail carved mossy stone archway with fluted columns, torus necking rings,
 * high-segment beveled voussoir arch, bronze keystone emblem, and draping TubeGeometry vines.
 */
export function buildStoneArch(
  span: number,
  height: number,
  shared: SharedMaterials
): THREE.Group {
  const group = new THREE.Group();
  const half = span / 2;
  const colH = height * 0.62;
  const shaftGeo = createFlutedShaftGeometry(0.56, 0.64, colH);

  for (const side of [-1, 1]) {
    const x = side * half;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.5, 1.62), shared.ruinStoneDark);
    plinth.position.set(x, 0.25, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const baseCollar = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.1, 10, 24), shared.ruinStoneDark);
    baseCollar.rotation.x = Math.PI / 2;
    baseCollar.position.set(x, 0.56, 0);

    const shaft = new THREE.Mesh(shaftGeo, shared.ruinStone);
    shaft.position.set(x, 0.55 + colH / 2, 0);
    shaft.castShadow = true;
    shaft.receiveShadow = true;

    const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 10, 24), shared.bronzeTrim);
    neckRing.rotation.x = Math.PI / 2;
    neckRing.position.set(x, 0.55 + colH - 0.04, 0);

    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 1.52), shared.ruinStoneDark);
    capital.position.set(x, 0.55 + colH + 0.18, 0);
    capital.castShadow = true;

    group.add(plinth, baseCollar, shaft, neckRing, capital);
  }

  // Smooth high-segment extruded curved arch voussoir
  const outerR = half + 0.56;
  const innerR = half - 0.52;
  const archShape = new THREE.Shape();
  archShape.absarc(0, 0, outerR, 0, Math.PI, false);
  archShape.absarc(0, 0, innerR, Math.PI, 0, true);
  archShape.closePath();

  const archGeo = new THREE.ExtrudeGeometry(archShape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 4,
    curveSegments: 32,
  });
  archGeo.translate(0, 0, -0.59);
  const archMesh = new THREE.Mesh(archGeo, shared.ruinStone);
  archMesh.position.y = 0.55 + colH + 0.24;
  archMesh.castShadow = true;
  archMesh.receiveShadow = true;
  group.add(archMesh);

  // Carved keystone with bronze inlay & organic moss cushions
  const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.32, 1.44), shared.ruinStoneDark);
  keystone.position.set(0, 0.55 + colH + outerR - 0.14, 0);
  keystone.castShadow = true;
  const keyInlay = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), shared.bronzeTrim);
  keyInlay.position.set(0, 0.55 + colH + outerR - 0.14, 0.74);
  keyInlay.scale.set(0.85, 1.3, 0.35);
  group.add(keystone, keyInlay);

  const mossLump1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 1), shared.mossCap);
  mossLump1.position.set(-half * 0.48, 0.55 + colH + outerR * 0.87, 0.14);
  mossLump1.scale.set(1.55, 0.44, 1.12);
  const mossLump2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), shared.mossCap);
  mossLump2.position.set(half * 0.56, 0.55 + colH + outerR * 0.79, -0.1);
  mossLump2.scale.set(1.32, 0.42, 1.04);
  group.add(mossLump1, mossLump2);

  // Smooth draping TubeGeometry vines
  for (let i = 0; i < 4; i++) {
    const vx = (i - 1.5) * (span * 0.2);
    const startY = 0.55 + colH + Math.sqrt(Math.max(0.2, innerR * innerR - vx * vx)) + 0.18;
    const drop = 1.2 + (i % 2) * 0.75;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(vx, startY, 0.48),
      new THREE.Vector3(vx + 0.14, startY - drop * 0.42, 0.56),
      new THREE.Vector3(vx - 0.08, startY - drop * 0.8, 0.48),
      new THREE.Vector3(vx + 0.05, startY - drop, 0.42),
    ]);
    const vineMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.055, 8, false), shared.vine);
    group.add(vineMesh);
  }

  return group;
}

/**
 * High-detail fluted standing or broken stone pillar with torus moldings & sculpted moss crown.
 */
export function buildStonePillar(
  height: number,
  radius: number,
  broken: boolean,
  shared: SharedMaterials
): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 2.45, 0.44, radius * 2.45),
    shared.ruinStoneDark
  );
  base.position.y = 0.22;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const baseTorus = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.06, radius * 0.16, 10, 24),
    shared.ruinStoneDark
  );
  baseTorus.rotation.x = Math.PI / 2;
  baseTorus.position.y = 0.52;
  group.add(baseTorus);

  const shaftH = Math.max(1.2, height - 0.68);
  const shaft = new THREE.Mesh(
    createFlutedShaftGeometry(radius * 0.92, radius, shaftH),
    shared.ruinStone
  );
  shaft.position.y = 0.64 + shaftH / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  if (broken) {
    const shard = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.52, radius * 0.9, 0.58, 12),
      shared.ruinStone
    );
    shard.position.set(0.06, 0.64 + shaftH + 0.14, -0.05);
    shard.rotation.z = 0.28;
    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.74, 1), shared.mossCap);
    moss.position.set(-0.08, 0.64 + shaftH + 0.16, 0.08);
    moss.scale.set(1.18, 0.44, 1.06);
    group.add(shard, moss);
  } else {
    const neck = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.95, radius * 0.13, 10, 24),
      shared.bronzeTrim
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.y = 0.64 + shaftH - 0.04;

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 2.38, 0.36, radius * 2.38),
      shared.ruinStoneDark
    );
    cap.position.y = 0.64 + shaftH + 0.16;
    cap.castShadow = true;

    const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.76, 1), shared.mossCap);
    moss.position.set(0.16, 0.64 + shaftH + 0.4, 0.1);
    moss.scale.set(1.24, 0.38, 1.12);
    group.add(neck, cap, moss);
  }

  return group;
}

export interface ObeliskVisual {
  group: THREE.Group;
  crystal: THREE.Mesh;
  runeBands: THREE.Mesh[];
  circleMesh: THREE.Mesh;
  progressRing: THREE.Mesh;
  light: THREE.PointLight;
  setAttunedState: (progress: number, attuned: boolean, time: number) => void;
}

export function buildRuneObelisk(
  shared: SharedMaterials,
  tex: ProceduralTextureSet
): ObeliskVisual {
  const group = new THREE.Group();

  const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.32, 2.4), shared.ruinStoneDark);
  step1.position.y = 0.16;
  step1.receiveShadow = true;
  step1.castShadow = true;
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.34, 1.72), shared.ruinStone);
  step2.position.y = 0.49;
  step2.castShadow = true;
  const bronzePlinth = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.12, 1.36), shared.bronzeTrim);
  bronzePlinth.position.y = 0.7;
  group.add(step1, step2, bronzePlinth);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.68, 3.85, 4), shared.ruinStoneDark);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 2.6;
  shaft.castShadow = true;
  group.add(shaft);

  const runeMat = shared.cyanRuneOff.clone();
  const runeBands: THREE.Mesh[] = [];
  for (const ry of [1.58, 2.48, 3.38]) {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.57 - (ry - 1.5) * 0.09, 0.61 - (ry - 1.5) * 0.09, 0.15, 4),
      runeMat
    );
    band.rotation.y = Math.PI / 4;
    band.position.y = ry;
    group.add(band);
    runeBands.push(band);
  }

  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: 0x52f2ff,
    emissive: 0x0ec6eb,
    emissiveIntensity: 1.55,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 1.0,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 0), crystalMat);
  crystal.position.y = 5.12;
  group.add(crystal);

  const circleMat = new THREE.MeshBasicMaterial({
    map: tex.runeCircleTex,
    color: 0x26d8ff,
    transparent: true,
    opacity: 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const circleMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4), circleMat);
  circleMesh.rotation.x = -Math.PI / 2;
  circleMesh.position.y = 0.06;
  group.add(circleMesh);

  const progMat = new THREE.MeshBasicMaterial({
    color: 0x7dfbff,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const progressRing = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.88, 48), progMat);
  progressRing.rotation.x = -Math.PI / 2;
  progressRing.position.y = 0.075;
  group.add(progressRing);

  const light = new THREE.PointLight(0x2ce8ff, 2.4, 12, 2);
  light.position.y = 3.3;
  group.add(light);

  return {
    group,
    crystal,
    runeBands,
    circleMesh,
    progressRing,
    light,
    setAttunedState: (progress: number, attuned: boolean, time: number) => {
      crystal.position.y = 5.12 + Math.sin(time * 2.4) * 0.18;
      crystal.rotation.y = time * (attuned ? 1.8 : 0.7);
      circleMesh.rotation.z = time * (attuned ? 0.55 : 0.2);

      const power = attuned ? 1.0 : progress;
      runeMat.emissiveIntensity = 0.55 + power * 2.2 + Math.sin(time * 3) * 0.15;
      crystalMat.emissiveIntensity = 1.1 + power * 2.1;
      circleMat.opacity = attuned ? 0.78 + Math.sin(time * 2.5) * 0.1 : 0.36 + progress * 0.42;
      progMat.opacity = attuned ? 0.7 : progress > 0.02 ? 0.78 : 0;
      progressRing.scale.setScalar(0.7 + power * 0.3);
      light.intensity = attuned ? 5.6 + Math.sin(time * 3.2) * 0.5 : 2.2 + progress * 2.8;
    },
  };
}

export interface PortalVisual {
  group: THREE.Group;
  vortexMaterial: THREE.ShaderMaterial;
  circleMesh: THREE.Mesh;
  light: THREE.PointLight;
  update: (active: boolean, time: number) => void;
}

/**
 * HD Northern Sanctum Portal with stepped dais, fluted carved arch, brushed bronze ring,
 * and multi-layered procedural FBM swirling cyan rift shader.
 */
export function buildCyanPortal(
  shared: SharedMaterials,
  tex: ProceduralTextureSet
): PortalVisual {
  const group = new THREE.Group();

  const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.65, 5.2, 0.34, 32), shared.ruinStoneDark);
  dais.position.y = 0.17;
  dais.receiveShadow = true;
  group.add(dais);

  const daisRim = new THREE.Mesh(new THREE.TorusGeometry(4.62, 0.11, 10, 48), shared.bronzeTrim);
  daisRim.rotation.x = Math.PI / 2;
  daisRim.position.y = 0.34;
  group.add(daisRim);

  const arch = buildStoneArch(6.4, 7.6, shared);
  arch.position.y = 0.25;
  group.add(arch);

  const innerFrame = new THREE.Mesh(
    new THREE.TorusGeometry(2.68, 0.2, 16, 48),
    shared.bronzeTrim
  );
  innerFrame.position.set(0, 3.65, 0);
  group.add(innerFrame);

  // HD Multi-Layer Procedural Arcane Vortex GLSL Shader
  const vortexMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uActive: { value: 0.34 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uActive;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        if (r > 1.0) discard;

        float angle = atan(p.y, p.x);
        float twist = angle + (1.0 - r) * 3.8 - uTime * 1.1;
        vec2 swirled = vec2(cos(twist), sin(twist)) * r * 3.2;

        float plasma = fbm(swirled + vec2(uTime * 0.45, -uTime * 0.35));
        float wisps = sin(angle * 6.0 - uTime * 3.2 + r * 11.0 + plasma * 3.0) * 0.5 + 0.5;
        float rings = sin(r * 18.0 - uTime * 4.4) * 0.5 + 0.5;
        float core = smoothstep(0.95, 0.04, r);
        float rim = smoothstep(0.66, 0.96, r) * (1.0 - smoothstep(0.96, 1.0, r));

        vec3 abyss = vec3(0.02, 0.16, 0.25);
        vec3 teal = vec3(0.08, 0.62, 0.78);
        vec3 cyan = vec3(0.32, 0.96, 1.0);
        vec3 hotCore = vec3(0.92, 1.0, 1.0);

        float energy = mix(0.45, 1.15, uActive);
        vec3 col = mix(abyss, teal, clamp(plasma * 1.25, 0.0, 1.0));
        col = mix(col, cyan, clamp(wisps * 0.55 + rings * 0.35, 0.0, 1.0) * energy);
        col += hotCore * (pow(core, 3.2) * 0.85 + rim * 1.35) * energy;

        float alpha = smoothstep(1.0, 0.78, r) * mix(0.68, 0.96, uActive);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const vortexMesh = new THREE.Mesh(new THREE.CircleGeometry(2.65, 48), vortexMaterial);
  vortexMesh.position.set(0, 3.65, 0);
  group.add(vortexMesh);

  const circleMat = new THREE.MeshBasicMaterial({
    map: tex.runeCircleTex,
    color: 0x3ef2ff,
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const circleMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 8.8), circleMat);
  circleMesh.rotation.x = -Math.PI / 2;
  circleMesh.position.y = 0.37;
  group.add(circleMesh);

  const light = new THREE.PointLight(0x28ebff, 5.2, 20, 2);
  light.position.set(0, 3.6, 1.8);
  group.add(light);

  let smoothActive = 0.34;

  return {
    group,
    vortexMaterial,
    circleMesh,
    light,
    update: (active: boolean, time: number) => {
      const target = active ? 1.0 : 0.34;
      smoothActive += (target - smoothActive) * 0.06;
      vortexMaterial.uniforms.uTime.value = time;
      vortexMaterial.uniforms.uActive.value = smoothActive;
      circleMesh.rotation.z = -time * (active ? 0.65 : 0.18);
      circleMat.opacity = active ? 0.88 : 0.44;
      light.intensity = (active ? 10.5 : 4.6) + Math.sin(time * 3.5) * 0.8;
    },
  };
}

/**
 * HD gnarled ruin tree with bark-textured curved trunk, split branches, mossy roots,
 * and smooth layered multi-cluster wind-swaying canopies.
 */
export function buildRuinTree(
  seed: number,
  shared: SharedMaterials,
  windUniforms?: FoliageWindUniforms
): THREE.Group {
  const group = new THREE.Group();
  const leafHue = 0.35 + ((seed * 17) % 10) * 0.006;
  const canopyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(leafHue, 0.4, 0.19),
    roughness: 0.88,
    metalness: 0.0,
  });
  if (windUniforms) {
    applyFoliageWindToMaterial(canopyMat, windUniforms, { swayScale: 1.05, mode: 'canopy' });
  }

  const height = 4.4 + ((seed * 31) % 24) * 0.12;
  const bend = ((seed % 5) - 2) * 0.18;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(bend * 0.5, height * 0.45, -bend * 0.3),
    new THREE.Vector3(bend, height, bend * 0.25),
  ]);
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 10, 0.34, 10, false), shared.bark);
  trunk.castShadow = true;
  group.add(trunk);

  // Two split upper limbs
  for (const dir of [-1, 1]) {
    const limbCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bend * 0.7, height * 0.68, 0),
      new THREE.Vector3(bend + dir * 1.15, height * 0.96, dir * 0.55),
    ]);
    const limb = new THREE.Mesh(new THREE.TubeGeometry(limbCurve, 6, 0.16, 8, false), shared.bark);
    limb.castShadow = true;
    group.add(limb);
  }

  const rootFlare = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 1), shared.mossCap);
  rootFlare.position.y = 0.22;
  rootFlare.scale.set(1.2, 0.52, 1.2);
  group.add(rootFlare);

  const clusters = [
    [bend, height + 0.65, 0, 1.72],
    [bend - 1.15, height + 0.15, 0.65, 1.28],
    [bend + 1.15, height + 0.25, -0.58, 1.35],
    [bend + 0.2, height + 0.1, -1.05, 1.12],
  ];
  for (const [cx, cy, cz, cr] of clusters) {
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(cr, 1), canopyMat);
    foliage.position.set(cx, cy, cz);
    foliage.scale.set(1.18, 0.68, 1.08);
    foliage.castShadow = true;
    group.add(foliage);
  }

  return group;
}

/**
 * HD 12-frond two-tier arched fern cluster geometry with 3D midrib crease and
 * full unpinched UVs so the serrated pinnate alpha texture renders crisp leaflets.
 */
export function createFernClusterGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const tiers: Array<{ count: number; lenBase: number; archBase: number; yawOffset: number }> = [
    { count: 7, lenBase: 0.98, archBase: 0.36, yawOffset: 0 },
    { count: 5, lenBase: 0.72, archBase: 0.56, yawOffset: 0.33 },
  ];

  let vOffset = 0;
  for (const tier of tiers) {
    for (let f = 0; f < tier.count; f++) {
      const yaw = (f / tier.count) * Math.PI * 2 + tier.yawOffset + (f % 2) * 0.14;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const len = tier.lenBase + (f % 3) * 0.14;
      const halfW = 0.34 + (f % 2) * 0.05;
      const archH = tier.archBase + (f % 3) * 0.09;

      // 6 smoothly-curved rings along the frond; alpha cutout handles organic tapering
      const rings: Array<[number, number, number, number, number]> = [
        [0.02, 0.01, halfW * 0.82, 0.02, 0.0],
        [len * 0.2, archH * 0.55, halfW * 0.96, 0.045, 0.2],
        [len * 0.42, archH * 0.9, halfW * 1.0, 0.055, 0.42],
        [len * 0.64, archH * 1.0, halfW * 0.96, 0.05, 0.64],
        [len * 0.84, archH * 0.86, halfW * 0.86, 0.035, 0.84],
        [len, archH * 0.52, halfW * 0.7, 0.015, 1.0],
      ];

      for (let r = 0; r < rings.length; r++) {
        const [dist, y, w, cupDrop, vCoord] = rings[r];
        const cx = cosY * dist;
        const cz = sinY * dist;
        const lx = cx - sinY * w;
        const lz = cz + cosY * w;
        const rx = cx + sinY * w;
        const rz = cz - cosY * w;
        // 3 vertices across each ring: left edge, raised center rachis, right edge
        positions.push(lx, y - cupDrop, lz, cx, y, cz, rx, y - cupDrop, rz);
        uvs.push(0, vCoord, 0.5, vCoord, 1, vCoord);
      }

      for (let r = 0; r < rings.length - 1; r++) {
        const row0 = vOffset + r * 3;
        const row1 = row0 + 3;
        // Left blade strip
        indices.push(row0, row1, row0 + 1, row0 + 1, row1, row1 + 1);
        // Right blade strip
        indices.push(row0 + 1, row1 + 1, row0 + 2, row0 + 2, row1 + 1, row1 + 2);
      }
      vOffset += rings.length * 3;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Ornate carved stone-and-bronze ruin brazier holding a glowing cyan rune crystal.
 */
export function buildCyanBrazier(shared: SharedMaterials): THREE.Group {
  const group = new THREE.Group();

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.28, 0.94), shared.ruinStoneDark);
  base.position.y = 0.14;
  base.castShadow = true;

  const pedestal = new THREE.Mesh(createFlutedShaftGeometry(0.28, 0.38, 1.05), shared.ruinStone);
  pedestal.position.y = 0.8;
  pedestal.castShadow = true;

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.26, 0.32, 16), shared.bronzeTrim);
  bowl.position.y = 1.44;

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.29, 0), shared.cyanRuneOn);
  crystal.position.y = 2.02;
  crystal.scale.set(0.85, 1.38, 0.85);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.036, 10, 28), shared.cyanRuneOn);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.9;

  group.add(base, pedestal, bowl, crystal, halo);
  return group;
}

/**
 * Subtle volumetric warm dusk god-ray shaft cutting diagonally across ancient stone arches.
 */
export function buildLightShaftMesh(height = 18, radiusTop = 1.4, radiusBottom = 4.2): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x9ce8e2) },
      uOpacity: { value: 0.085 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        float verticalFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
        float edgeSoft = pow(abs(dot(normalize(vNormal), normalize(vViewPos))), 1.6);
        float alpha = verticalFade * edgeSoft * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 20, 1, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = height * 0.45;
  mesh.rotation.z = -0.34;
  mesh.rotation.x = 0.2;
  return mesh;
}

/**
 * Builds an animated vertical Light Beam visual effect (inner core + volumetric halo + collar + ground flare).
 */
export function buildLightBeamMesh(
  radius: number,
  colorHex: number,
  tex: ProceduralTextureSet
): THREE.Group {
  const group = new THREE.Group();

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.56, 30, 24, 1, true), coreMat);
  core.position.y = 15;

  const haloMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.66,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.96, radius * 1.25, 30, 28, 1, true), haloMat);
  halo.position.y = 15;

  const collarMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const collar = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.4, 40), collarMat);
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = 0.14;

  const groundFlareMat = new THREE.MeshBasicMaterial({
    map: tex.softGlowTex,
    color: colorHex,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const groundFlare = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4.6, radius * 4.6), groundFlareMat);
  groundFlare.rotation.x = -Math.PI / 2;
  groundFlare.position.y = 0.09;

  group.add(core, halo, collar, groundFlare);
  return group;
}

/**
 * Builds a Magic Summoning Circle decal mesh with rotating runic glyph ring.
 */
export function buildSummoningCircleMesh(
  radius: number,
  colorHex: number,
  tex: ProceduralTextureSet
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: tex.runeCircleTex,
    color: colorHex,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.15, radius * 2.15), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.08;
  return mesh;
}
