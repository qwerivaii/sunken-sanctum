import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AmbientTriggerController } from './ambientAudio';
import {
  ATMOSPHERE_LIGHT_SLOTS,
  AtmosphericParticleSystem,
  EnvironmentLightSample,
} from './atmosphericParticles';
import { ProceduralAudio } from './audio';
import {
  CameraShakeController,
  CameraShakeOutput,
  computeShakeFalloff,
} from './cameraShake';
import {
  createFernFoliageShaderMaterial,
  createFoliageWindUniforms,
  FoliageWindUniforms,
} from './foliageShader';
import {
  ARCHES,
  groundHeightAt,
  LEVEL_PLAYABLE_RADIUS,
  PILLARS,
  WALKWAYS,
} from './levelData';
import {
  buildCyanBrazier,
  buildCyanPortal,
  buildEnemyRig,
  buildHeroRig,
  buildLightBeamMesh,
  buildLightShaftMesh,
  buildRuinTree,
  buildRuneObelisk,
  buildStoneArch,
  buildStonePillar,
  buildSummoningCircleMesh,
  createFernClusterGeometry,
  createSharedMaterials,
  EnemyRig,
  HeroRig,
  ObeliskVisual,
  PortalVisual,
  SharedMaterials,
} from './models';
import { GameSimulation } from './simulation';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import { AbilityId, HudSnapshot, RunSummary, SimEvent, Vec2 } from './types';

export interface FloatingCombatTextItem {
  id: number;
  x: number;
  y: number;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'player_hurt' | 'milestone';
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onFloatingText: (item: FloatingCombatTextItem) => void;
  onRunComplete: (summary: RunSummary) => void;
}

interface ActiveTempVfx {
  obj: THREE.Object3D;
  kind: 'beam' | 'circle' | 'slash';
  elapsed: number;
  duration: number;
  baseScale: number;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface FogWisp {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  speedX: number;
  speedZ: number;
  phase: number;
}

const PARTICLE_POOL_SIZE = 240;

// Pre-allocated scratch vectors (zero GC inside render loop)
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _v3Proj = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.06);
const BASE_CAMERA_FOV = 38;
const _shakeOut: CameraShakeOutput = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  rollRad: 0,
  fovDelta: 0,
};

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SanctumGameEngine {
  readonly sim: GameSimulation;
  readonly audio: ProceduralAudio;
  readonly isSoftwareGl: boolean;

  private mountEl: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private foliageWind: FoliageWindUniforms;
  private fernShaderMat: THREE.ShaderMaterial | null = null;
  private shared: SharedMaterials;

  private heroRig: HeroRig;
  private enemyRigs = new Map<string, EnemyRig>();
  private enemyPickMeshes: THREE.Mesh[] = [];
  private projectileMeshes = new Map<string, THREE.Mesh>();
  private obeliskVisuals = new Map<string, ObeliskVisual>();
  private portalVisual!: PortalVisual;

  private clickMarker: THREE.Group;
  private clickMarkerTimer = 0;
  private heroLight: THREE.PointLight;
  private southArchGlow!: THREE.PointLight;
  private keyLight!: THREE.DirectionalLight;
  private atmosphere!: AtmosphericParticleSystem;
  private atmosphereLightSamples: EnvironmentLightSample[] = Array.from(
    { length: ATMOSPHERE_LIGHT_SLOTS },
    () => ({ x: 0, y: 0, z: 0, range: 10, colorHex: 0x2ce8ff, intensity: 0 })
  );
  private ambientController = new AmbientTriggerController();
  private attunedObeliskIds: string[] = [];

  private tempVfx: ActiveTempVfx[] = [];
  private fogWisps: FogWisp[] = [];

  // Zero-GC pooled particle ring buffer
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;
  private particleMesh: THREE.InstancedMesh;

  // Ambient cyan dust motes
  private dustPoints!: THREE.Points;

  private raycaster = new THREE.Raycaster();
  private keysPressed = new Set<string>();
  private pointerDown = false;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private lastAimWorld: Vec2 | null = null;

  private cameraTarget = new THREE.Vector3(0, 0.8, 22);
  private cameraPos = new THREE.Vector3(12, 17, 36);
  private cameraShake = new CameraShakeController();
  private titleClock = 0;
  private lastFrameMs = 0;
  private hudEmitAccum = 0;
  private floatId = 1;
  private lastReportedPhase: string = '';

  private frameId = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(mountEl: HTMLElement, callbacks: EngineCallbacks) {
    this.mountEl = mountEl;
    this.callbacks = callbacks;
    this.sim = new GameSimulation();
    this.audio = new ProceduralAudio();
    this.isSoftwareGl = detectSoftwareGl();

    // Renderer configured per Three.js skill & software-WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.mountEl.appendChild(this.renderer.domElement);

    // Scene & moody twilight-moss horizon fog
    this.scene = new THREE.Scene();
    const fogColor = 0x0c171f;
    this.scene.background = new THREE.Color(fogColor);
    this.scene.fog = new THREE.FogExp2(fogColor, 0.0175);

    // Mandatory RoomEnvironment PMREM at calibrated moody intensity (crisp armor/bronze highlights without washing out dark ruins)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    // High-angled isometric PerspectiveCamera (38° FOV gives classic crisp ARPG depth)
    const w = Math.max(1, mountEl.clientWidth);
    const h = Math.max(1, mountEl.clientHeight);
    this.camera = new THREE.PerspectiveCamera(BASE_CAMERA_FOV, w / h, 0.5, 160);
    this.renderer.setSize(w, h, false);

    this.textures = createProceduralTextures(this.renderer);
    this.foliageWind = createFoliageWindUniforms();
    this.shared = createSharedMaterials(this.textures, this.foliageWind);

    this.setupLighting();
    this.buildRuinsEnvironment();
    this.heroRig = buildHeroRig(this.shared, this.textures);
    this.scene.add(this.heroRig.root);

    // Subtle cyan blade aura following hero
    this.heroLight = new THREE.PointLight(0x3ce8ff, 2.2, 8.5, 2);
    this.heroLight.position.set(0, 2.1, 22);
    this.scene.add(this.heroLight);

    // Global light-reactive atmospheric falling leaves, mist-rain streaks & wet-stone ripples
    const sceneFog = this.scene.fog as THREE.FogExp2;
    this.atmosphere = new AtmosphericParticleSystem({
      windUniforms: this.foliageWind,
      fogColor: sceneFog.color,
      fogDensity: sceneFog.density,
      isSoftwareGl: this.isSoftwareGl,
      maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy(),
    });
    this.scene.add(this.atmosphere.group);

    // Click-to-move animated ring marker
    this.clickMarker = this.createClickMarker();
    this.scene.add(this.clickMarker);

    // Pooled instanced particle system
    const pGeo = new THREE.OctahedronGeometry(0.14, 0);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -99,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0,
        color: new THREE.Color(0x4ef2ff),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0x4ef2ff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;

    this.syncEnemies();
    this.bindInputEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.mountEl);

    if (!this.isSoftwareGl) {
      // Selective HD HDR Bloom pipeline with 4x MSAA render target so alphaToCoverage foliage stays silky smooth
      const msaaTarget = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      this.composer = new EffectComposer(this.renderer, msaaTarget);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.36, 0.55, 0.85);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.emitHud();
    this.lastFrameMs = performance.now();
    this.scheduleNextTick(true);
  }

  private setupLighting(): void {
    // Cool twilight-moss sky/ground hemisphere fill
    const hemi = new THREE.HemisphereLight(0x40768f, 0x111d16, 0.68);
    this.scene.add(hemi);

    // Warm golden-amber directional dusk sun breaking through misty ruin canopy (single high-res shadow caster)
    this.keyLight = new THREE.DirectionalLight(0xffdcb0, 1.58);
    this.keyLight.position.set(22, 34, 18);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.radius = 2.4;
    this.keyLight.shadow.camera.near = 6;
    this.keyLight.shadow.camera.far = 85;
    const d = 28;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.022;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // Cool cyan twilight back-rim light accenting stone arches & silhouettes
    const rim = new THREE.DirectionalLight(0x3ad0f0, 0.86);
    rim.position.set(-18, 16, -24);
    this.scene.add(rim);
  }

  private buildRuinsEnvironment(): void {
    // 1. Extended mossy forest ground extending far into horizon fog (no boxed floating floor!)
    const groundGeo = new THREE.PlaneGeometry(180, 180, 28, 28);
    groundGeo.rotateX(-Math.PI / 2);
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.hypot(x, z);
      const hill = Math.max(0, (dist - 31) * 0.22);
      const wave = Math.sin(x * 0.13) * Math.cos(z * 0.13) * 0.22;
      posAttr.setY(i, dist < 30 ? -0.02 : hill + wave);
    }
    groundGeo.computeVertexNormals();

    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.textures.mossGroundMap,
      normalMap: this.textures.mossGroundNormal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughness: 0.92,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Raised mossy flagstone walkways & courtyards with matched PBR albedo/normal/roughness tiling
    for (const w of WALKWAYS) {
      const slabGeo = new THREE.BoxGeometry(w.width, 0.28, w.depth);
      const slabMat = this.shared.flagstone.clone();
      const repX = Math.max(1, w.width / 4.2);
      const repY = Math.max(1, w.depth / 4.2);

      const mapClone = this.textures.flagstoneMap.clone();
      mapClone.colorSpace = THREE.SRGBColorSpace;
      mapClone.wrapS = THREE.RepeatWrapping;
      mapClone.wrapT = THREE.RepeatWrapping;
      mapClone.repeat.set(repX, repY);
      mapClone.needsUpdate = true;

      const normClone = this.textures.flagstoneNormal.clone();
      normClone.colorSpace = THREE.NoColorSpace;
      normClone.wrapS = THREE.RepeatWrapping;
      normClone.wrapT = THREE.RepeatWrapping;
      normClone.repeat.set(repX, repY);
      normClone.needsUpdate = true;

      const roughClone = this.textures.flagstoneRoughness.clone();
      roughClone.colorSpace = THREE.NoColorSpace;
      roughClone.wrapS = THREE.RepeatWrapping;
      roughClone.wrapT = THREE.RepeatWrapping;
      roughClone.repeat.set(repX, repY);
      roughClone.needsUpdate = true;

      slabMat.map = mapClone;
      slabMat.normalMap = normClone;
      slabMat.roughnessMap = roughClone;

      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.position.set(w.x, w.y - 0.14, w.z);
      slab.receiveShadow = true;
      this.scene.add(slab);
    }

    // Scattered cracked walkway edge stones strictly outside main flagstone slabs
    const stepCoords: Array<[number, number, number]> = [];
    for (let i = 0; i < 64; i++) {
      const ang = (i / 64) * Math.PI * 2 + (i % 3) * 0.2;
      const rad = 8.5 + ((i * 7.3) % 21);
      const sx = Math.cos(ang) * rad;
      const sz = Math.sin(ang) * rad;
      let overlapsWalkway = false;
      for (const w of WALKWAYS) {
        if (Math.abs(sx - w.x) < w.width * 0.54 && Math.abs(sz - w.z) < w.depth * 0.54) {
          overlapsWalkway = true;
          break;
        }
      }
      if (!overlapsWalkway) {
        stepCoords.push([sx, sz, ang]);
      }
    }
    const stepGeo = new THREE.BoxGeometry(1.35, 0.14, 1.05);
    const stepMesh = new THREE.InstancedMesh(stepGeo, this.shared.ruinStoneDark, stepCoords.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < stepCoords.length; i++) {
      const [sx, sz, ang] = stepCoords[i];
      dummy.position.set(sx, 0.03, sz);
      dummy.rotation.set(0, ang * 1.7, 0);
      const s = 0.72 + (i % 5) * 0.14;
      dummy.scale.set(s, 0.8 + (i % 3) * 0.2, s * 0.9);
      dummy.updateMatrix();
      stepMesh.setMatrixAt(i, dummy.matrix);
    }
    stepMesh.receiveShadow = true;
    stepMesh.instanceMatrix.needsUpdate = true;
    stepMesh.computeBoundingSphere();
    this.scene.add(stepMesh);

    // Ornate Glowing Cyan Waystone Braziers framing key ruin gateways
    const brazierSpots: Array<[number, number]> = [
      [-4.6, 16.5],
      [4.6, 16.5],
      [-5.2, -10.8],
      [5.2, -10.8],
    ];
    for (const [bx, bz] of brazierSpots) {
      const br = buildCyanBrazier(this.shared);
      br.position.set(bx, groundHeightAt(bx, bz), bz);
      this.scene.add(br);
    }
    // Single shared cyan gateway glow at South Arch (stays within 5-PointLight budget)
    this.southArchGlow = new THREE.PointLight(0x2ae8ff, 3.2, 13, 2);
    this.southArchGlow.position.set(0, 2.8, 15.2);
    this.scene.add(this.southArchGlow);

    // 3. Grand Mossy Stone Arches
    for (const a of ARCHES) {
      const arch = buildStoneArch(a.span, a.height, this.shared);
      arch.position.set(a.x, groundHeightAt(a.x, a.z), a.z);
      arch.rotation.y = a.rotationY;
      this.scene.add(arch);
    }

    // 4. Fluted Standing & Broken Pillars + Fallen Column Drums
    for (const p of PILLARS) {
      const pillar = buildStonePillar(p.height, p.radius, p.broken, this.shared);
      pillar.position.set(p.x, groundHeightAt(p.x, p.z), p.z);
      if (p.leanX) pillar.rotation.x = p.leanX;
      if (p.leanZ) pillar.rotation.z = p.leanZ;
      this.scene.add(pillar);
    }

    // Low mossy ruin wall segments matching box colliders
    for (const b of this.sim.colliders.boxes) {
      const bw = b.maxX - b.minX;
      const bd = b.maxZ - b.minZ;
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;
      const wallGroup = new THREE.Group();
      const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(bw, 1.55, bd), this.shared.ruinStone);
      mainBlock.position.y = 0.78;
      mainBlock.castShadow = true;
      mainBlock.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.16, 0.26, bd + 0.16), this.shared.ruinStoneDark);
      cap.position.y = 1.62;
      const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 1), this.shared.mossCap);
      moss.position.set(0.3, 1.82, 0);
      moss.scale.set(2.2, 0.4, 0.9);
      wallGroup.add(mainBlock, cap, moss);
      wallGroup.position.set(cx, 0, cz);
      this.scene.add(wallGroup);
    }

    // 5. Ancient Rune Obelisks (Western & Eastern Waystones)
    for (const ob of this.sim.obelisks) {
      const vis = buildRuneObelisk(this.shared, this.textures);
      vis.group.position.set(ob.x, groundHeightAt(ob.x, ob.z), ob.z);
      this.scene.add(vis.group);
      this.obeliskVisuals.set(ob.id, vis);
    }

    // 6. Glowing Cyan Northern Sanctum Portal
    this.portalVisual = buildCyanPortal(this.shared, this.textures);
    this.portalVisual.group.position.set(
      this.sim.portal.x,
      groundHeightAt(this.sim.portal.x, this.sim.portal.z),
      this.sim.portal.z
    );
    this.scene.add(this.portalVisual.group);

    // 7. Subtle Volumetric Twilight Light Shafts framing key ruin landmarks
    const shaftSpots: Array<[number, number, number, number, number]> = [
      [0, 14.5, 17, 1.3, 3.8],
      [-17, 2, 16, 1.2, 3.4],
      [17, 0, 16, 1.2, 3.4],
      [0, -20.5, 20, 1.6, 4.6],
    ];
    for (const [sx, sz, sh, rt, rb] of shaftSpots) {
      const shaft = buildLightShaftMesh(sh, rt, rb);
      shaft.position.set(sx, groundHeightAt(sx, sz) + sh * 0.44, sz);
      this.scene.add(shaft);
    }

    // 8. Instanced Overgrown Foliage (veined ferns, groves) & Outer Natural Cliff/Boulder Perimeter
    this.buildInstancedFoliageAndPerimeter();

    // 9. Drifting Low Ground Fog Wisps & Floating Cyan Ruin Motes
    this.buildDriftingFogAndMotes();
  }

  private buildInstancedFoliageAndPerimeter(): void {
    const dummy = new THREE.Object3D();

    // Natural sculpted perimeter boulders with stone normal detail framing the sunken valley
    const boulderGeo = new THREE.IcosahedronGeometry(1.9, 1);
    const boulderMat = new THREE.MeshStandardMaterial({
      color: 0x4b5c58,
      normalMap: this.textures.ruinStoneNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.9,
      metalness: 0.04,
    });
    const boulderCount = 46;
    const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderCount);
    for (let i = 0; i < boulderCount; i++) {
      const ang = (i / boulderCount) * Math.PI * 2 + (i % 3) * 0.07;
      const rad = LEVEL_PLAYABLE_RADIUS + 2.5 + (i % 5) * 1.9;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const s = 0.85 + ((i * 13) % 10) * 0.14;
      dummy.position.set(x, groundHeightAt(x, z) + s * 0.75, z);
      dummy.rotation.set(i * 0.4, i * 0.9, i * 0.2);
      dummy.scale.set(s * 1.35, s * 0.95, s * 1.15);
      dummy.updateMatrix();
      boulders.setMatrixAt(i, dummy.matrix);
      _color.setHSL(0.42 + (i % 4) * 0.02, 0.14, 0.26 + (i % 5) * 0.03);
      boulders.setColorAt(i, _color);
    }
    boulders.receiveShadow = true;
    boulders.instanceMatrix.needsUpdate = true;
    if (boulders.instanceColor) boulders.instanceColor.needsUpdate = true;
    boulders.computeBoundingSphere();
    this.scene.add(boulders);

    // Outer Ruin Forest Grove (26 composite gnarled trees with wind-swaying canopies ringing the ruins)
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2 + 0.12;
      const rad = LEVEL_PLAYABLE_RADIUS + 4.5 + (i % 4) * 2.8;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const tree = buildRuinTree(i + 1, this.shared, this.foliageWind);
      tree.position.set(x, groundHeightAt(x, z) - 0.1, z);
      const sc = 0.92 + (i % 4) * 0.14;
      tree.scale.setScalar(sc);
      this.scene.add(tree);
    }

    // Instanced Multi-Frond Fern Clusters with custom GLSL wind & alphaToCoverage transparency shader
    const fernGeo = createFernClusterGeometry();
    const fog = this.scene.fog as THREE.FogExp2;
    this.fernShaderMat = createFernFoliageShaderMaterial({
      fernMap: this.textures.fernMap,
      windUniforms: this.foliageWind,
      fogColor: fog.color,
      fogDensity: fog.density,
      useAlphaToCoverage: !this.isSoftwareGl,
    });
    const fernCoords: Array<[number, number, number]> = [];
    for (let i = 0; i < 240; i++) {
      const ang = i * 2.39996; // Golden angle distribution
      const rad = 4.8 + Math.sqrt(i / 240) * 33;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      let onWalkway = false;
      for (const w of WALKWAYS) {
        if (
          Math.abs(x - w.x) < w.width * 0.48 &&
          Math.abs(z - w.z) < w.depth * 0.48
        ) {
          onWalkway = true;
          break;
        }
      }
      if (!onWalkway) {
        fernCoords.push([x, groundHeightAt(x, z), z]);
      }
    }

    const ferns = new THREE.InstancedMesh(fernGeo, this.fernShaderMat, fernCoords.length);
    for (let i = 0; i < fernCoords.length; i++) {
      const [bx, by, bz] = fernCoords[i];
      const sc = 0.85 + ((i * 7) % 10) * 0.1;
      dummy.position.set(bx, by, bz);
      dummy.rotation.set(0, i * 1.37, 0);
      dummy.scale.set(sc * 1.15, sc, sc * 1.15);
      dummy.updateMatrix();
      ferns.setMatrixAt(i, dummy.matrix);
      // Natural botanical tint variation across instanced fern clusters
      _color.setHSL(0.34 + (i % 5) * 0.015, 0.24, 0.78 + (i % 4) * 0.06);
      ferns.setColorAt(i, _color);
    }
    ferns.instanceMatrix.needsUpdate = true;
    if (ferns.instanceColor) ferns.instanceColor.needsUpdate = true;
    ferns.computeBoundingSphere();
    this.scene.add(ferns);
  }

  private buildDriftingFogAndMotes(): void {
    // Low drifting translucent mist layers hovering over the ruins
    const wispGeo = new THREE.PlaneGeometry(18, 18);
    const wispMat = new THREE.MeshBasicMaterial({
      map: this.textures.fogWispTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(wispGeo, wispMat);
      m.rotation.x = -Math.PI / 2;
      const bx = ((i % 4) - 1.5) * 18 + (i % 2) * 4;
      const bz = (Math.floor(i / 4) - 1.5) * 16;
      m.position.set(bx, 0.55 + (i % 3) * 0.38, bz);
      this.scene.add(m);
      this.fogWisps.push({
        mesh: m,
        baseX: bx,
        baseZ: bz,
        speedX: 0.35 + (i % 3) * 0.14,
        speedZ: 0.18 + (i % 2) * 0.1,
        phase: i * 1.3,
      });
    }

    // Floating mystical cyan spores/dust motes
    const moteCount = 110;
    const positions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 68;
      positions[i * 3 + 1] = 0.6 + Math.random() * 6.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 68;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const moteMat = new THREE.PointsMaterial({
      map: this.textures.softGlowTex,
      color: 0x6ff5ff,
      size: 0.48,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(moteGeo, moteMat);
    this.scene.add(this.dustPoints);
  }

  private createClickMarker(): THREE.Group {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x58f7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.58, 24), ringMat);
    outer.rotation.x = -Math.PI / 2;
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.22, 16), ringMat);
    inner.rotation.x = -Math.PI / 2;
    group.add(outer, inner);
    group.position.y = 0.1;
    group.visible = false;
    return group;
  }

  private bindInputEvents(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private screenToGround(clientX: number, clientY: number): Vec2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(_groundPlane, _v3A);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }

  private pickEnemyAt(clientX: number, clientY: number): string | null {
    if (this.enemyPickMeshes.length === 0) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.enemyPickMeshes, false);
    if (hits.length > 0 && typeof hits[0].object.userData.enemyId === 'string') {
      return hits[0].object.userData.enemyId;
    }
    return null;
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.audio.unlock();
    if (this.sim.phase !== 'playing') return;
    if (e.button !== 0 && e.button !== 2) return;

    this.pointerDown = true;
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;

    const worldPt = this.screenToGround(e.clientX, e.clientY);
    if (worldPt) this.lastAimWorld = worldPt;

    // Right-click triggers basic melee slash toward cursor
    if (e.button === 2) {
      this.sim.triggerBasicAttack(worldPt ?? undefined);
      return;
    }

    // Left-click: pick enemy to attack, or click ground to move
    const enemyId = this.pickEnemyAt(e.clientX, e.clientY);
    if (enemyId) {
      this.sim.setAttackTarget(enemyId);
      return;
    }

    if (worldPt) {
      // Also allow generous proximity click on enemies near cursor
      const nearEnemy = this.sim.enemies.find(
        (en) =>
          en.state !== 'dying' &&
          Math.hypot(en.x - worldPt.x, en.z - worldPt.z) <= en.radius + 1.05
      );
      if (nearEnemy) {
        this.sim.setAttackTarget(nearEnemy.id);
        return;
      }

      this.sim.setMoveTarget(worldPt.x, worldPt.z);
      this.clickMarker.position.set(worldPt.x, groundHeightAt(worldPt.x, worldPt.z) + 0.08, worldPt.z);
      this.clickMarker.visible = true;
      this.clickMarkerTimer = 0.55;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;
    if (this.sim.phase !== 'playing') return;

    const worldPt = this.screenToGround(e.clientX, e.clientY);
    if (worldPt) {
      this.lastAimWorld = worldPt;
      if (this.pointerDown) {
        this.sim.setMoveTarget(worldPt.x, worldPt.z);
      }
    }
  };

  private onPointerUp = (): void => {
    this.pointerDown = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.audio.unlock();
    if (this.sim.phase !== 'playing') return;
    if (e.repeat) return;

    const code = e.code;
    this.keysPressed.add(code);

    if (code === 'Space') {
      e.preventDefault();
      this.sim.triggerBasicAttack(this.lastAimWorld ?? undefined);
    } else if (code === 'Digit1' || code === 'KeyQ') {
      this.sim.castAbility('cleave', this.lastAimWorld ?? undefined);
    } else if (code === 'Digit2' || code === 'ShiftLeft' || code === 'ShiftRight') {
      this.sim.castAbility('dash', this.lastAimWorld ?? undefined);
    } else if (code === 'Digit3' || code === 'KeyE') {
      this.sim.castAbility('sigil', this.lastAimWorld ?? undefined);
    } else if (code === 'Digit4' || code === 'KeyF') {
      this.sim.castAbility('beam', this.lastAimWorld ?? undefined);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keysPressed.clear();
    this.pointerDown = false;
    this.sim.setKeyboardMove(0, 0);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysPressed.clear();
      this.pointerDown = false;
      this.sim.setKeyboardMove(0, 0);
    }
  };

  // Public API for React UI
  startGame(): void {
    this.audio.unlock();
    this.keysPressed.clear();
    this.pointerDown = false;
    this.clearTempVfx();
    this.ambientController.reset();
    this.cameraShake.reset();
    if (Math.abs(this.camera.fov - BASE_CAMERA_FOV) > 0.005) {
      this.camera.fov = BASE_CAMERA_FOV;
      this.camera.updateProjectionMatrix();
    }
    this.sim.startGame();
    this.syncEnemies();
    this.cameraTarget.set(this.sim.hero.x, 0.8, this.sim.hero.z);
    this.cameraPos.set(this.sim.hero.x + 11.5, 16.5, this.sim.hero.z + 14.5);
    this.emitHud();
  }

  restartGame(): void {
    this.startGame();
  }

  returnToTitle(): void {
    this.keysPressed.clear();
    this.pointerDown = false;
    this.clearTempVfx();
    this.cameraShake.reset();
    if (Math.abs(this.camera.fov - BASE_CAMERA_FOV) > 0.005) {
      this.camera.fov = BASE_CAMERA_FOV;
      this.camera.updateProjectionMatrix();
    }
    this.sim.resetWorld('title');
    this.syncEnemies();
    this.emitHud();
  }

  setPaused(paused: boolean): void {
    this.keysPressed.clear();
    this.pointerDown = false;
    this.sim.setPaused(paused);
    this.emitHud();
  }

  toggleMute(): boolean {
    return this.audio.toggleMute();
  }

  castAbilityFromHud(id: AbilityId): void {
    if (this.sim.phase !== 'playing') return;
    // When triggered from HUD click, use nearest enemy / facing instead of bottom-bar pointer coords
    this.sim.castAbility(id, undefined);
    this.emitHud();
  }

  triggerBasicAttackFromHud(): void {
    if (this.sim.phase !== 'playing') return;
    this.sim.triggerBasicAttack(undefined);
    this.emitHud();
  }

  private clearTempVfx(): void {
    for (const v of this.tempVfx) {
      this.scene.remove(v.obj);
    }
    this.tempVfx = [];
    for (const [, m] of this.projectileMeshes) {
      this.scene.remove(m);
    }
    this.projectileMeshes.clear();
    this.clickMarker.visible = false;
  }

  private updateKeyboardDirection(): void {
    if (this.sim.phase !== 'playing') {
      this.sim.setKeyboardMove(0, 0);
      return;
    }
    let up = 0;
    let right = 0;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) up += 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) up -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) right += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) right -= 1;

    if (up === 0 && right === 0) {
      this.sim.setKeyboardMove(0, 0);
      return;
    }

    // Camera-aligned XZ movement basis so W always moves visually up-screen
    this.camera.getWorldDirection(_v3A);
    _v3A.y = 0;
    if (_v3A.lengthSq() < 0.0001) _v3A.set(0, 0, -1);
    _v3A.normalize();
    _v3B.set(-_v3A.z, 0, _v3A.x); // Screen-right in XZ

    const mx = _v3A.x * up + _v3B.x * right;
    const mz = _v3A.z * up + _v3B.z * right;
    this.sim.setKeyboardMove(mx, mz);
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    colorKey: 'cyan' | 'amber' | 'magenta' | 'stone' | 'crimson',
    count: number
  ): void {
    const hex =
      colorKey === 'cyan'
        ? 0x55f6ff
        : colorKey === 'amber'
          ? 0xffb84d
          : colorKey === 'magenta'
            ? 0xe85cff
            : colorKey === 'crimson'
              ? 0xff405c
              : 0x8ea09a;

    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 5.2;
      slot.active = true;
      slot.x = x + (Math.random() - 0.5) * 0.4;
      slot.y = y + Math.random() * 0.4;
      slot.z = z + (Math.random() - 0.5) * 0.4;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = 2.2 + Math.random() * 4.5;
      slot.vz = Math.sin(ang) * spd;
      slot.life = 0;
      slot.maxLife = 0.35 + Math.random() * 0.35;
      slot.size = 0.65 + Math.random() * 0.85;
      slot.color.setHex(hex);
    }
  }

  private processSimEvents(): void {
    const events: SimEvent[] = this.sim.drainEvents();
    for (const ev of events) {
      if (ev.type === 'sound') {
        this.audio.play(ev.sound);
      } else if (ev.type === 'camera_shake') {
        const attenuation =
          ev.sourceX !== undefined && ev.sourceZ !== undefined
            ? computeShakeFalloff(
                Math.hypot(ev.sourceX - this.sim.hero.x, ev.sourceZ - this.sim.hero.z),
                28
              )
            : 1;
        this.cameraShake.trigger({
          trauma: ev.trauma,
          style: ev.style,
          dirX: ev.dirX,
          dirZ: ev.dirZ,
          attenuation,
        });
      } else if (ev.type === 'burst') {
        this.spawnParticles(ev.x, ev.y, ev.z, ev.color, ev.count);
      } else if (ev.type === 'slash') {
        const arcMat = new THREE.MeshBasicMaterial({
          color: ev.heavy ? 0x6bf9ff : 0xaefbff,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const arcSpan = ev.heavy ? Math.PI * 1.15 : Math.PI * 0.82;
        const arcGeo = new THREE.RingGeometry(ev.radius * 0.48, ev.radius, 20, 1, -arcSpan / 2, arcSpan);
        const arcMesh = new THREE.Mesh(arcGeo, arcMat);
        arcMesh.rotation.x = -Math.PI / 2;
        arcMesh.rotation.z = ev.facing - Math.PI / 2;
        arcMesh.position.set(ev.x, groundHeightAt(ev.x, ev.z) + 1.05, ev.z);
        this.scene.add(arcMesh);
        this.tempVfx.push({
          obj: arcMesh,
          kind: 'slash',
          elapsed: 0,
          duration: ev.heavy ? 0.28 : 0.2,
          baseScale: 1,
        });
      } else if (ev.type === 'summon_circle') {
        const hex = ev.color === 'crimson' ? 0xff3b66 : 0x36eeff;
        const mesh = buildSummoningCircleMesh(ev.radius, hex, this.textures);
        mesh.position.set(ev.x, groundHeightAt(ev.x, ev.z) + 0.09, ev.z);
        this.scene.add(mesh);
        this.tempVfx.push({
          obj: mesh,
          kind: 'circle',
          elapsed: 0,
          duration: ev.duration,
          baseScale: 1,
        });
      } else if (ev.type === 'light_beam') {
        const hex = ev.color === 'crimson' ? 0xff365d : ev.color === 'gold' ? 0xffd266 : 0x36f0ff;
        const beam = buildLightBeamMesh(ev.radius, hex, this.textures);
        beam.position.set(ev.x, groundHeightAt(ev.x, ev.z), ev.z);
        this.scene.add(beam);
        this.tempVfx.push({
          obj: beam,
          kind: 'beam',
          elapsed: 0,
          duration: ev.duration,
          baseScale: 1,
        });
      } else if (ev.type === 'floating_text') {
        _v3Proj.set(ev.x, ev.y, ev.z);
        _v3Proj.project(this.camera);
        if (_v3Proj.z >= -1 && _v3Proj.z <= 1) {
          const rect = this.renderer.domElement.getBoundingClientRect();
          const sx = ((_v3Proj.x + 1) * 0.5) * rect.width;
          const sy = (-(_v3Proj.y - 1) * 0.5) * rect.height;
          this.callbacks.onFloatingText({
            id: this.floatId++,
            x: Math.round(sx),
            y: Math.round(sy),
            text: ev.text,
            kind: ev.kind,
          });
        }
      }
    }
  }

  private syncEnemies(): void {
    const aliveIds = new Set<string>();
    for (const e of this.sim.enemies) {
      aliveIds.add(e.id);
      if (!this.enemyRigs.has(e.id)) {
        const rig = buildEnemyRig(e.archetype, this.shared, this.textures);
        // Invisible simplified raycast hit cylinder so clicking enemies is effortless
        const pickH = e.archetype === 'warden' ? 3.2 : 2.1;
        const pickMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(e.radius * 1.25, e.radius * 1.25, pickH, 8),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        pickMesh.position.y = pickH * 0.5;
        pickMesh.userData.enemyId = e.id;
        rig.root.add(pickMesh);
        this.enemyPickMeshes.push(pickMesh);
        this.scene.add(rig.root);
        this.enemyRigs.set(e.id, rig);
      }
    }

    // Remove meshes for cleaned-up defeated enemies
    for (const [id, rig] of this.enemyRigs) {
      if (!aliveIds.has(id)) {
        this.scene.remove(rig.root);
        this.enemyRigs.delete(id);
        this.enemyPickMeshes = this.enemyPickMeshes.filter((m) => m.userData.enemyId !== id);
      }
    }
  }

  private updateVisuals(dt: number, time: number): void {
    const h = this.sim.hero;
    const hy = groundHeightAt(h.x, h.z);
    this.heroRig.root.position.set(h.x, hy, h.z);
    this.heroRig.root.rotation.y = h.facing;

    // Drive shared foliage wind shader uniforms (zero allocation)
    this.foliageWind.uTime.value = time;
    this.foliageWind.uHeroPos.value.set(h.x, hy, h.z);

    // Distance-synced walk cycle + subtle squash-and-stretch on dash/attack
    const stride = Math.sin(h.walkDistance * 2.8);
    const moving = h.dashTimer > 0 || h.moveTarget !== null || this.keysPressed.size > 0;
    this.heroRig.leftLeg.rotation.x = moving ? stride * 0.55 : 0;
    this.heroRig.rightLeg.rotation.x = moving ? -stride * 0.55 : 0;
    this.heroRig.body.position.y = moving ? Math.abs(Math.cos(h.walkDistance * 2.8)) * 0.08 : Math.sin(time * 2.4) * 0.03;
    this.heroRig.cloak.rotation.x = 0.16 + (moving ? 0.25 + Math.abs(stride) * 0.12 : Math.sin(time * 2) * 0.04);

    if (h.dashTimer > 0) {
      this.heroRig.body.scale.set(0.82, 1.16, 1.25);
    } else {
      this.heroRig.body.scale.lerp(_v3A.set(1, 1, 1), 1 - Math.exp(-14 * dt));
    }

    // Crisp sword swing curve (windup -> active -> recovery)
    if (h.attackAnimTimer > 0) {
      const p = 1 - h.attackAnimTimer / h.attackAnimDuration;
      const swing = p < 0.25 ? -0.9 * (p / 0.25) : -0.9 + Math.min(1, (p - 0.25) / 0.35) * 2.6;
      const dir = h.comboStep % 2 === 0 ? -1 : 1;
      this.heroRig.swordArm.rotation.y = swing * dir;
      this.heroRig.swordArm.rotation.x = -0.35 - Math.sin(p * Math.PI) * 0.65;
    } else {
      this.heroRig.swordArm.rotation.y *= Math.exp(-12 * dt);
      this.heroRig.swordArm.rotation.x *= Math.exp(-12 * dt);
    }

    // Hero hurt emissive flash
    const heroFlash = h.hitFlashTimer > 0 ? 1 : 0;
    for (const m of this.heroRig.materialsToFlash) {
      m.emissive.setHex(heroFlash ? 0xff4b5c : 0x000000);
      m.emissiveIntensity = heroFlash ? 1.4 : 0;
    }

    this.heroLight.position.set(h.x, hy + 2.2, h.z);

    // Keep directional light centered around hero so shadow map stays razor-sharp
    this.keyLight.position.set(h.x + 20, 32, h.z + 16);
    this.keyLight.target.position.set(h.x, 0, h.z);

    // Sync & animate enemies
    this.syncEnemies();
    for (const e of this.sim.enemies) {
      const rig = this.enemyRigs.get(e.id);
      if (!rig) continue;
      const ey = groundHeightAt(e.x, e.z);
      rig.root.position.set(e.x, ey, e.z);
      rig.body.rotation.y = e.facing;

      if (e.state === 'dying') {
        const t = Math.max(0, e.koTimer / 0.45);
        rig.body.scale.setScalar(0.25 + t * 0.75);
        rig.body.rotation.x = (1 - t) * 1.45;
        rig.telegraphMesh.visible = false;
        rig.hpBarBg.visible = false;
      } else {
        rig.body.rotation.x = 0;
        const bob = e.archetype === 'wisp' ? Math.sin(time * 3.8 + e.x) * 0.22 : Math.abs(Math.sin(time * 6 + e.z)) * 0.06;
        rig.body.position.y = bob;
        if (rig.orbitRing) {
          rig.orbitRing.rotation.y = time * 2.2;
          rig.orbitRing.rotation.z = time * 1.3;
        }

        // Telegraph crouch/pulse & ground ring
        if (e.state === 'telegraph') {
          const pulse = 1 + Math.sin(time * 28) * 0.08;
          rig.body.scale.set(1.12 * pulse, 0.86, 1.12 * pulse);
          rig.telegraphMesh.visible = true;
          rig.telegraphMesh.scale.setScalar(e.telegraphRadius);
          rig.telegraphMesh.position.set(e.telegraphX - e.x, 0.07, e.telegraphZ - e.z);
        } else {
          rig.body.scale.set(1, 1, 1);
          rig.telegraphMesh.visible = false;
        }

        // Overhead diegetic HP bar (shown when damaged or boss)
        const showBar = e.hp < e.maxHp || e.archetype === 'warden';
        rig.hpBarBg.visible = showBar;
        if (showBar) {
          rig.hpBarBg.lookAt(this.camera.position);
          const ratio = Math.max(0.01, e.hp / e.maxHp);
          rig.hpBarFill.scale.x = ratio;
          const barW = e.archetype === 'warden' ? 2.04 : 1.09;
          rig.hpBarFill.position.x = -(1 - ratio) * barW * 0.5;
        }
      }

      // Hit flash
      const flash = e.hitFlashTimer > 0;
      const teleFlash = e.state === 'telegraph';
      for (const m of rig.flashMaterials) {
        if (flash) {
          m.emissive.setHex(0xffffff);
          m.emissiveIntensity = 1.6;
        } else if (teleFlash) {
          m.emissive.setHex(0xff7722);
          m.emissiveIntensity = 0.7;
        } else {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
      }
    }

    // Sync projectiles
    const activeProjIds = new Set<string>();
    for (const p of this.sim.projectiles) {
      activeProjIds.add(p.id);
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        const pMat = new THREE.MeshStandardMaterial({
          color: 0xffa8ff,
          emissive: 0xe636ff,
          emissiveIntensity: 2.4,
          roughness: 0.1,
        });
        mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), pMat);
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, groundHeightAt(p.x, p.z) + 1.15, p.z);
      mesh.rotation.y = time * 8;
      mesh.rotation.x = time * 5;
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (!activeProjIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectileMeshes.delete(id);
      }
    }

    // Obelisks & Cyan Portal updates
    for (const ob of this.sim.obelisks) {
      this.obeliskVisuals.get(ob.id)?.setAttunedState(ob.progress, ob.attuned, time);
    }
    this.portalVisual.update(this.sim.portal.active, time);

    // Click-to-move ground ring stays softly pulsing while moving to destination
    if (this.sim.hero.moveTarget) {
      const mt = this.sim.hero.moveTarget;
      this.clickMarker.position.set(mt.x, groundHeightAt(mt.x, mt.z) + 0.09, mt.z);
      this.clickMarker.visible = true;
      this.clickMarker.scale.setScalar(0.85 + Math.sin(time * 8) * 0.14);
      this.clickMarker.rotation.y = time * 2.8;
    } else if (this.clickMarkerTimer > 0) {
      this.clickMarkerTimer -= dt;
      const t = Math.max(0, this.clickMarkerTimer / 0.55);
      this.clickMarker.scale.setScalar(0.6 + (1 - t) * 0.7);
      this.clickMarker.rotation.y = time * 3;
      if (this.clickMarkerTimer <= 0) this.clickMarker.visible = false;
    } else {
      this.clickMarker.visible = false;
    }

    // Temp VFX (Light Beams, Summoning Circles, Slash Arcs)
    for (let i = this.tempVfx.length - 1; i >= 0; i--) {
      const v = this.tempVfx[i];
      v.elapsed += dt;
      const p = Math.min(1, v.elapsed / v.duration);
      if (v.kind === 'slash') {
        v.obj.scale.setScalar(0.85 + p * 0.35);
        const mat = (v.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = (1 - p) * 0.85;
      } else if (v.kind === 'circle') {
        v.obj.rotation.z += dt * 1.4;
        const scale = p < 0.15 ? p / 0.15 : 1 + Math.sin(p * Math.PI) * 0.06;
        v.obj.scale.setScalar(scale);
        const mat = (v.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = p > 0.72 ? (1 - (p - 0.72) / 0.28) * 0.9 : 0.9;
      } else if (v.kind === 'beam') {
        const widthScale = p < 0.12 ? p / 0.12 : 1 - p * 0.65;
        v.obj.scale.set(Math.max(0.05, widthScale), 1, Math.max(0.05, widthScale));
        v.obj.rotation.y += dt * 2.2;
      }

      if (v.elapsed >= v.duration) {
        this.scene.remove(v.obj);
        this.tempVfx.splice(i, 1);
      }
    }

    // Update pooled particles in-place (zero GC)
    let dirtyParticles = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirtyParticles = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 9.5 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const s = p.size * (1 - p.life / p.maxLife);
      _v3A.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(s, s, s);
      _mat4.compose(_v3A, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirtyParticles) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }

    // Drift ground fog & float cyan motes
    for (const w of this.fogWisps) {
      w.mesh.position.x = w.baseX + Math.sin(time * 0.18 * w.speedX + w.phase) * 4.5;
      w.mesh.position.z = w.baseZ + Math.cos(time * 0.15 * w.speedZ + w.phase) * 3.8;
    }
    this.dustPoints.position.y = Math.sin(time * 0.55) * 0.4;
    this.dustPoints.rotation.y = time * 0.012;

    // Sync live environment point lights into global falling leaves & rain shader (zero GC)
    const samples = this.atmosphereLightSamples;
    samples[0].x = this.heroLight.position.x;
    samples[0].y = this.heroLight.position.y;
    samples[0].z = this.heroLight.position.z;
    samples[0].range = 10.5;
    samples[0].colorHex = 0x3ce8ff;
    samples[0].intensity = this.heroLight.intensity;

    samples[1].x = this.southArchGlow.position.x;
    samples[1].y = this.southArchGlow.position.y;
    samples[1].z = this.southArchGlow.position.z;
    samples[1].range = 13.5;
    samples[1].colorHex = 0x2ae8ff;
    samples[1].intensity = this.southArchGlow.intensity;

    let slotIdx = 2;
    for (const ob of this.sim.obelisks) {
      if (slotIdx >= 4) break;
      const vis = this.obeliskVisuals.get(ob.id);
      if (vis) {
        samples[slotIdx].x = ob.x;
        samples[slotIdx].y = groundHeightAt(ob.x, ob.z) + 3.3;
        samples[slotIdx].z = ob.z;
        samples[slotIdx].range = 14.0;
        samples[slotIdx].colorHex = 0x2ce8ff;
        samples[slotIdx].intensity = vis.light.intensity;
        slotIdx++;
      }
    }

    samples[4].x = this.sim.portal.x;
    samples[4].y = groundHeightAt(this.sim.portal.x, this.sim.portal.z) + 3.6;
    samples[4].z = this.sim.portal.z + 1.8;
    samples[4].range = 20.0;
    samples[4].colorHex = 0x28ebff;
    samples[4].intensity = this.portalVisual.light.intensity;

    const focusX = this.sim.phase === 'title' ? -2.0 : h.x;
    const focusZ = this.sim.phase === 'title' ? -18.5 : h.z;
    this.atmosphere.update(focusX, 0, focusZ, samples);

    // Update spatial ambient audio triggers & proximity-driven portal/obelisk/wind beds
    this.camera.getWorldDirection(_v3A);
    _v3A.y = 0;
    if (_v3A.lengthSq() < 0.0001) _v3A.set(0, 0, -1);
    _v3A.normalize();
    _v3B.set(-_v3A.z, 0, _v3A.x); // Screen-right XZ vector for isometric stereo panning

    this.attunedObeliskIds.length = 0;
    for (const ob of this.sim.obelisks) {
      if (ob.attuned) this.attunedObeliskIds.push(ob.id);
    }

    const ambientActive = this.sim.phase === 'playing' && !document.hidden;
    const ambientRes = this.ambientController.update({
      dt: ambientActive ? dt : 0,
      heroX: h.x,
      heroZ: h.z,
      cameraRightX: _v3B.x,
      cameraRightZ: _v3B.z,
      portalActive: this.sim.portal.active,
      attunedObeliskIds: this.attunedObeliskIds,
    });
    this.audio.updateSpatialBeds(ambientRes.beds, ambientActive);

    if (ambientActive) {
      for (const trigger of ambientRes.triggers) {
        this.audio.playSpatialAmbient(trigger);
        if (trigger.kind === 'stone_crumble') {
          this.spawnParticles(trigger.x, 1.85, trigger.z, 'stone', 5);
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.sim.phase === 'title') {
      // Live World Camera Tour showcasing glowing Northern Cyan Portal, mossy arches, & cyan braziers on center-right
      this.titleClock += dt;
      const t = this.titleClock * 0.16;
      const desiredX = 10.2 + Math.sin(t) * 4.5;
      const desiredZ = -5.5 + Math.cos(t) * 3.5;
      const desiredY = 11.4 + Math.sin(t * 1.2) * 1.0;
      const damp = 1 - Math.exp(-3 * dt);
      if (this.titleClock <= 0.15) {
        this.cameraPos.set(desiredX, desiredY, desiredZ);
        this.cameraTarget.set(-2.5, 2.6, -20.0);
      } else {
        this.cameraPos.lerp(_v3A.set(desiredX, desiredY, desiredZ), damp);
        this.cameraTarget.lerp(_v3B.set(-2.5, 2.6, -20.0), damp);
      }
      this.camera.position.copy(this.cameraPos);
      this.camera.lookAt(this.cameraTarget);
      if (Math.abs(this.camera.fov - BASE_CAMERA_FOV) > 0.005) {
        this.camera.fov = BASE_CAMERA_FOV;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // Smooth high-angled isometric follow camera with style-aware trauma shake
    const h = this.sim.hero;
    const desiredTargetX = h.x;
    const desiredTargetZ = h.z - 1.2;
    const desiredPosX = h.x + 10.5;
    const desiredPosY = 16.5;
    const desiredPosZ = h.z + 14.2;

    const damp = 1 - Math.exp(-7.5 * dt);
    this.cameraTarget.lerp(_v3A.set(desiredTargetX, 0.85, desiredTargetZ), damp);
    this.cameraPos.lerp(_v3B.set(desiredPosX, desiredPosY, desiredPosZ), damp);

    this.cameraShake.update(dt, _shakeOut);

    this.camera.position.set(
      this.cameraPos.x + _shakeOut.offsetX,
      this.cameraPos.y + _shakeOut.offsetY,
      this.cameraPos.z + _shakeOut.offsetZ
    );
    _v3A.set(
      this.cameraTarget.x + _shakeOut.offsetX * 0.35,
      this.cameraTarget.y + _shakeOut.offsetY * 0.25,
      this.cameraTarget.z + _shakeOut.offsetZ * 0.35
    );
    this.camera.lookAt(_v3A);
    if (Math.abs(_shakeOut.rollRad) > 0.00005) {
      this.camera.rotation.z += _shakeOut.rollRad;
    }

    const targetFov = BASE_CAMERA_FOV + _shakeOut.fovDelta;
    if (Math.abs(this.camera.fov - targetFov) > 0.005) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private emitHud(): void {
    const snap = this.sim.getHudSnapshot();
    this.callbacks.onHudUpdate(snap);
    if (
      (this.sim.phase === 'victory' || this.sim.phase === 'defeat') &&
      this.lastReportedPhase !== this.sim.phase &&
      this.sim.runSummary
    ) {
      this.callbacks.onRunComplete(this.sim.runSummary);
    }
    this.lastReportedPhase = this.sim.phase;
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private scheduleNextTick(immediate = false): void {
    if (this.disposed) return;
    if (immediate) {
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private renderFrame(): void {
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private tick = (nowMs: number): void => {
    if (this.disposed) return;
    const rawDt = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    const time = nowMs * 0.001;

    this.updateKeyboardDirection();
    this.sim.step(dt);
    this.processSimEvents();
    this.updateVisuals(dt, time);
    this.updateCamera(dt);

    this.renderFrame();

    // Throttle React HUD updates to ~10 Hz (plus instant phase change updates)
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1 || this.sim.phase !== this.lastReportedPhase) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.scheduleNextTick(false);
  };

  private handleResize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.mountEl.clientWidth);
    const h = Math.max(1, this.mountEl.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(w, h);
    }
    this.renderFrame();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.composer?.dispose();
    this.atmosphere.dispose();
    this.fernShaderMat?.dispose();
    this.textures.dispose();
    this.shared.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.mountEl) {
      this.mountEl.removeChild(dom);
    }
  }
}
