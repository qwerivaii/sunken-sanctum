import * as THREE from 'three';
import { FoliageWindUniforms } from './foliageShader';

export const ATMOSPHERE_LIGHT_SLOTS = 5;

export interface EnvironmentLightSample {
  x: number;
  y: number;
  z: number;
  range: number;
  colorHex: number;
  intensity: number;
}

export interface PackedLightUniforms {
  positions: THREE.Vector4[];
  colors: THREE.Vector4[];
}

export interface AtmosphericParticleOptions {
  windUniforms: FoliageWindUniforms;
  fogColor: THREE.Color;
  fogDensity: number;
  isSoftwareGl: boolean;
  maxAnisotropy: number;
}

/**
 * Pure deterministic PRNG (Mulberry32-style hash) for repeatable particle seeds.
 */
export function deterministicSeed(index: number, salt: number): number {
  const x = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Pure helper mirroring the GPU toroidal wrapping math so particle volumes
 * stay seamlessly centered around the active focus without edge popping.
 */
export function wrapCoordAroundFocus(
  baseCoord: number,
  drift: number,
  focusCoord: number,
  span: number
): number {
  const half = span * 0.5;
  const rel = baseCoord + drift - focusCoord + half;
  const wrapped = ((rel % span) + span) % span;
  return wrapped - half + focusCoord;
}

/**
 * Packs up to ATMOSPHERE_LIGHT_SLOTS dynamic scene point lights into pre-allocated
 * Vector4 uniform arrays (zero allocation per frame).
 */
export function packEnvironmentLights(
  samples: readonly EnvironmentLightSample[],
  target: PackedLightUniforms
): void {
  const count = Math.min(samples.length, target.positions.length);
  for (let i = 0; i < count; i++) {
    const s = samples[i];
    const r = ((s.colorHex >> 16) & 0xff) / 255;
    const g = ((s.colorHex >> 8) & 0xff) / 255;
    const b = (s.colorHex & 0xff) / 255;
    target.positions[i].set(s.x, s.y, s.z, Math.max(0.5, s.range));
    target.colors[i].set(r, g, b, Math.max(0, s.intensity));
  }
  for (let i = count; i < target.positions.length; i++) {
    target.positions[i].set(0, -100, 0, 1);
    target.colors[i].set(0, 0, 0, 0);
  }
}

/**
 * Procedural 256x256 botanical ruin leaf texture (pointed serrated forest leaf with midrib & veins).
 */
function createLeafAlphaTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const grad = ctx.createLinearGradient(cx, size * 0.92, cx, size * 0.08);
  grad.addColorStop(0, '#5a6e3e');
  grad.addColorStop(0.5, '#9ab56d');
  grad.addColorStop(1, '#d8e39e');

  // Pointed forest leaf silhouette
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.93);
  ctx.bezierCurveTo(size * 0.14, size * 0.72, size * 0.18, size * 0.28, cx, size * 0.06);
  ctx.bezierCurveTo(size * 0.82, size * 0.28, size * 0.86, size * 0.72, cx, size * 0.93);
  ctx.closePath();
  ctx.fill();

  // Short petiole stem
  ctx.strokeStyle = '#6c7c48';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.98);
  ctx.lineTo(cx, size * 0.88);
  ctx.stroke();

  // Central vein & side venation
  ctx.strokeStyle = 'rgba(235, 245, 195, 0.58)';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.9);
  ctx.lineTo(cx, size * 0.12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(55, 76, 36, 0.45)';
  ctx.lineWidth = 2;
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const y = size * (0.86 - t * 0.68);
    const spread = Math.sin(t * Math.PI) * size * 0.24;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx - spread, y - 16);
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + spread, y - 16);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Curved 3D leaf blade geometry (6 vertices with gentle longitudinal arch + midrib cup)
 * so tumbling leaves catch realistic directional, rim, and point-light reflections.
 */
function createCurvedLeafGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array([
    // Base (v = 0)
    0.0, 0.0, -0.22,
    // Mid-left, mid-center (raised arch), mid-right (v = 0.5)
    -0.16, 0.02, 0.0,
    0.0, 0.055, 0.0,
    0.16, 0.02, 0.0,
    // Tip (v = 1)
    0.0, -0.02, 0.22,
  ]);
  const uvs = new Float32Array([
    0.5, 0.0,
    0.0, 0.5,
    0.5, 0.5,
    1.0, 0.5,
    0.5, 1.0,
  ]);
  const indices = [
    0, 1, 2,
    0, 2, 3,
    1, 4, 2,
    2, 4, 3,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Global GPU-driven atmospheric particle system for the overgrown ruins:
 * 1. Falling & spiraling 3D leaves interacting with dusk sun, twilight rim, and 5 live cyan PointLights
 * 2. Subtle wind-slanted drizzle rain streaks that shimmer brightly near glowing portals, braziers & obelisks
 * 3. Delicate expanding wet-stone raindrop ripple rings on the mossy courtyards
 */
export class AtmosphericParticleSystem {
  readonly group = new THREE.Group();

  private readonly leafMesh: THREE.InstancedMesh;
  private readonly rainMesh: THREE.InstancedMesh;
  private readonly rippleMesh: THREE.InstancedMesh;
  private readonly leafTexture: THREE.CanvasTexture;
  private readonly leafMaterial: THREE.ShaderMaterial;
  private readonly rainMaterial: THREE.ShaderMaterial;
  private readonly rippleMaterial: THREE.ShaderMaterial;

  private readonly focusUniform = { value: new THREE.Vector3(0, 0, 18) };
  private readonly lightUniforms: PackedLightUniforms;

  constructor(options: AtmosphericParticleOptions) {
    const { windUniforms, fogColor, fogDensity, isSoftwareGl, maxAnisotropy } = options;

    this.lightUniforms = {
      positions: Array.from({ length: ATMOSPHERE_LIGHT_SLOTS }, () => new THREE.Vector4(0, -100, 0, 1)),
      colors: Array.from({ length: ATMOSPHERE_LIGHT_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)),
    };

    this.leafTexture = createLeafAlphaTexture(maxAnisotropy);

    // 1. Falling Ruin Leaves (220 GPU-animated instances)
    const leafCount = 220;
    const leafGeo = createCurvedLeafGeometry();
    const leafSeeds = new Float32Array(leafCount * 4);
    const leafParams = new Float32Array(leafCount * 4);
    const leafTints = new Float32Array(leafCount * 3);
    const tmpColor = new THREE.Color();

    // Overgrown ruins palette: mossy emerald, weathered olive, warm amber-gold, muted russet
    const palette = [0x3d7d44, 0x528f48, 0x76994d, 0xb88f46, 0x9c6e3d, 0x2f6841];

    for (let i = 0; i < leafCount; i++) {
      leafSeeds[i * 4 + 0] = (deterministicSeed(i, 1) - 0.5) * 44; // base X
      leafSeeds[i * 4 + 1] = deterministicSeed(i, 2) * 16; // initial Y phase
      leafSeeds[i * 4 + 2] = (deterministicSeed(i, 3) - 0.5) * 44; // base Z
      leafSeeds[i * 4 + 3] = deterministicSeed(i, 4) * Math.PI * 2; // tumble phase

      leafParams[i * 4 + 0] = 0.85 + deterministicSeed(i, 5) * 0.75; // fall speed (m/s)
      leafParams[i * 4 + 1] = 0.72 + deterministicSeed(i, 6) * 0.62; // leaf scale
      leafParams[i * 4 + 2] = 0.9 + deterministicSeed(i, 7) * 1.4; // flutter freq
      leafParams[i * 4 + 3] = 0.4 + deterministicSeed(i, 8) * 0.75; // spiral radius

      tmpColor.setHex(palette[i % palette.length]);
      tmpColor.offsetHSL(
        (deterministicSeed(i, 9) - 0.5) * 0.03,
        (deterministicSeed(i, 10) - 0.5) * 0.08,
        (deterministicSeed(i, 11) - 0.5) * 0.08
      );
      leafTints[i * 3 + 0] = tmpColor.r;
      leafTints[i * 3 + 1] = tmpColor.g;
      leafTints[i * 3 + 2] = tmpColor.b;
    }

    leafGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(leafSeeds, 4));
    leafGeo.setAttribute('aParams', new THREE.InstancedBufferAttribute(leafParams, 4));
    leafGeo.setAttribute('aTint', new THREE.InstancedBufferAttribute(leafTints, 3));

    const useAlphaToCoverage = !isSoftwareGl;
    this.leafMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.leafTexture },
        uTime: windUniforms.uTime,
        uWindStrength: windUniforms.uWindStrength,
        uWindDirection: windUniforms.uWindDirection,
        uFocus: this.focusUniform,
        uAlphaCutoff: { value: 0.36 },
        uAlphaDiscard: { value: useAlphaToCoverage ? 0.06 : 0.45 },
        uSunDir: { value: new THREE.Vector3(22, 34, 18).normalize() },
        uSunColor: { value: new THREE.Color(0xffdcb0) },
        uRimDir: { value: new THREE.Vector3(-18, 16, -24).normalize() },
        uRimColor: { value: new THREE.Color(0x3ad0f0) },
        uSkyColor: { value: new THREE.Color(0x40768f) },
        uGroundColor: { value: new THREE.Color(0x111d16) },
        uFogColor: { value: fogColor.clone() },
        uFogDensity: { value: fogDensity },
        uPointLightPos: { value: this.lightUniforms.positions },
        uPointLightColor: { value: this.lightUniforms.colors },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        attribute vec4 aParams;
        attribute vec3 aTint;

        uniform float uTime;
        uniform float uWindStrength;
        uniform vec2 uWindDirection;
        uniform vec3 uFocus;

        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vTint;
        varying float vFogDepth;
        varying float vHeightFade;

        mat3 rotXYZ(vec3 r) {
          float cx = cos(r.x), sx = sin(r.x);
          float cy = cos(r.y), sy = sin(r.y);
          float cz = cos(r.z), sz = sin(r.z);
          return mat3(
            cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
            cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
            -sy,     sx * cy,                cx * cy
          );
        }

        void main() {
          vUv = uv;
          vTint = aTint;

          float spanXZ = 44.0;
          float spanY = 16.0;
          float fallSpeed = aParams.x;
          float leafScale = aParams.y;
          float freq = aParams.z;
          float spiralR = aParams.w;
          float phase = aSeed.w;

          // Seamless vertical fall loop in [0.15 .. spanY]
          float rawY = aSeed.y - uTime * fallSpeed;
          float y = mod(rawY, spanY);
          if (y < 0.0) y += spanY;
          float worldY = y + 0.18;

          // Smooth scale-in at canopy top & settle-fade near ground
          float topFade = smoothstep(spanY, spanY - 2.2, y);
          float botFade = smoothstep(0.0, 0.85, y);
          vHeightFade = topFade * botFade;

          // Wind-driven horizontal drift wrapped seamlessly around active focus
          float windSpeed = 1.65 + uWindStrength * 6.5;
          vec2 drift = uWindDirection * (uTime * windSpeed);
          vec2 relXZ = aSeed.xz + drift - uFocus.xz + spanXZ * 0.5;
          vec2 wrappedXZ = mod(relXZ, spanXZ);
          wrappedXZ = mix(wrappedXZ, wrappedXZ + spanXZ, step(wrappedXZ, vec2(0.0)));
          vec2 centerXZ = wrappedXZ - spanXZ * 0.5 + uFocus.xz;

          // Gentle aerodynamic spiral flutter as leaf glides downward
          float tWave = uTime * freq + phase;
          centerXZ.x += sin(tWave) * spiralR;
          centerXZ.y += cos(tWave * 0.83 + phase) * spiralR * 0.85;
          worldY += sin(tWave * 1.7) * 0.14;

          // 3D leaf tumble rotation
          vec3 euler = vec3(
            sin(tWave * 1.15) * 0.95 + uTime * 0.55,
            uTime * (0.85 + freq * 0.4) + phase,
            cos(tWave * 1.35) * 0.85
          );
          mat3 rot = rotXYZ(euler);

          vec3 localPos = rot * (position * leafScale * (0.35 + 0.65 * vHeightFade));
          vec3 worldPos = vec3(centerXZ.x, worldY, centerXZ.y) + localPos;

          vWorldPos = worldPos;
          vWorldNormal = normalize(rot * normal);

          vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uAlphaCutoff;
        uniform float uAlphaDiscard;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uRimDir;
        uniform vec3 uRimColor;
        uniform vec3 uSkyColor;
        uniform vec3 uGroundColor;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec4 uPointLightPos[${ATMOSPHERE_LIGHT_SLOTS}];
        uniform vec4 uPointLightColor[${ATMOSPHERE_LIGHT_SLOTS}];

        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vTint;
        varying float vFogDepth;
        varying float vHeightFade;

        void main() {
          if (vHeightFade < 0.04) discard;
          vec4 texel = texture2D(uMap, vUv);
          float edgeW = max(fwidth(texel.a), 0.002);
          float alpha = clamp((texel.a - uAlphaCutoff) / edgeW + 0.5, 0.0, 1.0) * vHeightFade;
          if (alpha < uAlphaDiscard) discard;

          vec3 N = normalize(vWorldNormal);
          if (!gl_FrontFacing) N = -N;
          vec3 V = normalize(cameraPosition - vWorldPos);

          vec3 albedo = texel.rgb * vTint;

          // Hemisphere fill + wrapped directional dusk sun + backlit leaf translucency
          vec3 lighting = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5) * 0.65;
          float sunDiff = clamp((dot(N, uSunDir) + 0.35) / 1.35, 0.0, 1.0);
          lighting += uSunColor * sunDiff * 1.1;

          float rimDiff = clamp((dot(N, uRimDir) + 0.3) / 1.3, 0.0, 1.0);
          lighting += uRimColor * rimDiff * 0.55;

          // Backlit warm sun translucency through thin leaves
          float sunBack = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 2.2);
          vec3 emissiveGlow = albedo * uSunColor * sunBack * 0.45;

          // Live dynamic interaction with environment PointLights (Portal, Obelisks, Braziers, Hero Blade)
          for (int i = 0; i < ${ATMOSPHERE_LIGHT_SLOTS}; i++) {
            vec4 lp = uPointLightPos[i];
            vec4 lc = uPointLightColor[i];
            if (lc.a <= 0.001) continue;
            vec3 toLight = lp.xyz - vWorldPos;
            float dist = length(toLight);
            float range = lp.w;
            if (dist < range) {
              vec3 L = toLight / max(dist, 0.001);
              float atten = pow(clamp(1.0 - dist / range, 0.0, 1.0), 1.85) * lc.a * 0.42;
              float wrapNdotL = clamp(abs(dot(N, L)) * 0.75 + 0.35, 0.0, 1.0);
              lighting += lc.rgb * wrapNdotL * atten;
              // Luminous translucent glow when leaf drifts close to cyan magic lights
              float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.0);
              emissiveGlow += lc.rgb * atten * (0.38 + fresnel * 0.55);
            }
          }

          vec3 color = albedo * lighting + emissiveGlow;

          // Exact scene FogExp2 integration
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(color, alpha);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: false,
      alphaToCoverage: useAlphaToCoverage,
      depthWrite: true,
      depthTest: true,
    });

    this.leafMesh = new THREE.InstancedMesh(leafGeo, this.leafMaterial, leafCount);
    this.leafMesh.frustumCulled = false;
    this.group.add(this.leafMesh);

    // 2. Subtle Light-Catching Twilight Mist-Rain Streaks (240 GPU-animated streaks)
    const rainCount = 240;
    const rainGeo = new THREE.PlaneGeometry(0.032, 0.92);
    const rainSeeds = new Float32Array(rainCount * 4);
    for (let i = 0; i < rainCount; i++) {
      rainSeeds[i * 4 + 0] = (deterministicSeed(i, 21) - 0.5) * 42;
      rainSeeds[i * 4 + 1] = deterministicSeed(i, 22) * 18;
      rainSeeds[i * 4 + 2] = (deterministicSeed(i, 23) - 0.5) * 42;
      rainSeeds[i * 4 + 3] = 10.5 + deterministicSeed(i, 24) * 5.0; // fall speed
    }
    rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rainSeeds, 4));

    this.rainMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: windUniforms.uTime,
        uWindDirection: windUniforms.uWindDirection,
        uWindStrength: windUniforms.uWindStrength,
        uFocus: this.focusUniform,
        uFogColor: { value: fogColor.clone() },
        uFogDensity: { value: fogDensity },
        uPointLightPos: { value: this.lightUniforms.positions },
        uPointLightColor: { value: this.lightUniforms.colors },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;

        uniform float uTime;
        uniform vec2 uWindDirection;
        uniform float uWindStrength;
        uniform vec3 uFocus;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        varying float vFade;

        void main() {
          vUv = uv;
          float spanXZ = 42.0;
          float spanY = 18.0;
          float speed = aSeed.w;

          float rawY = aSeed.y - uTime * speed;
          float y = mod(rawY, spanY);
          if (y < 0.0) y += spanY;
          float worldY = y + 0.35;

          vFade = smoothstep(0.0, 1.4, y) * smoothstep(spanY, spanY - 2.5, y);

          vec2 drift = uWindDirection * (uTime * (2.6 + uWindStrength * 4.0));
          vec2 relXZ = aSeed.xz + drift - uFocus.xz + spanXZ * 0.5;
          vec2 wrappedXZ = mod(relXZ, spanXZ);
          wrappedXZ = mix(wrappedXZ, wrappedXZ + spanXZ, step(wrappedXZ, vec2(0.0)));
          vec2 centerXZ = wrappedXZ - spanXZ * 0.5 + uFocus.xz;

          vec3 center = vec3(centerXZ.x, worldY, centerXZ.y);

          // Cylindrical billboard aligned to wind-slanted rain fall axis
          vec3 fallAxis = normalize(vec3(uWindDirection.x * 0.22, -1.0, uWindDirection.y * 0.22));
          vec3 toCam = normalize(cameraPosition - center);
          vec3 rightAxis = normalize(cross(toCam, fallAxis));

          vec3 worldPos = center + rightAxis * position.x + (-fallAxis) * position.y;
          vWorldPos = worldPos;

          vec4 mvPos = viewMatrix * vec4(worldPos, 1.0);
          vFogDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec4 uPointLightPos[${ATMOSPHERE_LIGHT_SLOTS}];
        uniform vec4 uPointLightColor[${ATMOSPHERE_LIGHT_SLOTS}];

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vFogDepth;
        varying float vFade;

        void main() {
          // Soft tapered raindrop streak profile
          float horiz = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float vert = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.15, vUv.y);
          float shape = pow(max(horiz, 0.0), 1.6) * vert;

          // Subtle ambient silver-blue twilight drizzle base
          vec3 col = vec3(0.42, 0.66, 0.78);
          float boost = 0.0;

          // Rain streaks visibly glint & illuminate when falling through cyan/golden environment lights!
          for (int i = 0; i < ${ATMOSPHERE_LIGHT_SLOTS}; i++) {
            vec4 lp = uPointLightPos[i];
            vec4 lc = uPointLightColor[i];
            if (lc.a <= 0.001) continue;
            float dist = length(lp.xyz - vWorldPos);
            float range = lp.w;
            if (dist < range) {
              float atten = pow(clamp(1.0 - dist / range, 0.0, 1.0), 1.65) * lc.a * 0.32;
              col += lc.rgb * atten * 2.1;
              boost += atten;
            }
          }

          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          float alpha = shape * vFade * (0.14 + min(boost, 0.55)) * (1.0 - clamp(fogFactor, 0.0, 0.92));
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(col, alpha);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.rainMesh = new THREE.InstancedMesh(rainGeo, this.rainMaterial, rainCount);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 4;
    this.group.add(this.rainMesh);

    // 3. Delicate Wet-Stone Raindrop Ripples on Flagstones & Moss (44 GPU-wrapped rings)
    const rippleCount = 44;
    const rippleGeo = new THREE.PlaneGeometry(0.95, 0.95);
    rippleGeo.rotateX(-Math.PI / 2);
    const rippleSeeds = new Float32Array(rippleCount * 4);
    for (let i = 0; i < rippleCount; i++) {
      rippleSeeds[i * 4 + 0] = (deterministicSeed(i, 41) - 0.5) * 32;
      rippleSeeds[i * 4 + 1] = deterministicSeed(i, 42); // cycle offset
      rippleSeeds[i * 4 + 2] = (deterministicSeed(i, 43) - 0.5) * 32;
      rippleSeeds[i * 4 + 3] = 0.75 + deterministicSeed(i, 44) * 0.65; // cycle speed
    }
    rippleGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(rippleSeeds, 4));

    this.rippleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: windUniforms.uTime,
        uFocus: this.focusUniform,
        uPointLightPos: { value: this.lightUniforms.positions },
        uPointLightColor: { value: this.lightUniforms.colors },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;

        uniform float uTime;
        uniform vec3 uFocus;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vAge;

        void main() {
          vUv = uv;
          float span = 32.0;
          float age = fract(uTime * aSeed.w + aSeed.y);
          vAge = age;

          // Shift seed each cycle so ripples never repeat on the exact same pixel
          float cycle = floor(uTime * aSeed.w + aSeed.y);
          vec2 jitter = vec2(
            fract(sin(cycle * 12.9898 + aSeed.x) * 43758.5453) - 0.5,
            fract(sin(cycle * 78.233 + aSeed.z) * 43758.5453) - 0.5
          ) * 6.0;

          vec2 relXZ = aSeed.xz + jitter - uFocus.xz + span * 0.5;
          vec2 wrappedXZ = mod(relXZ, span);
          wrappedXZ = mix(wrappedXZ, wrappedXZ + span, step(wrappedXZ, vec2(0.0)));
          vec2 centerXZ = wrappedXZ - span * 0.5 + uFocus.xz;

          float scale = 0.25 + age * 1.15;
          vec3 worldPos = vec3(centerXZ.x + position.x * scale, 0.095, centerXZ.y + position.z * scale);
          vWorldPos = worldPos;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec4 uPointLightPos[${ATMOSPHERE_LIGHT_SLOTS}];
        uniform vec4 uPointLightColor[${ATMOSPHERE_LIGHT_SLOTS}];

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vAge;

        void main() {
          float dist = length((vUv - 0.5) * 2.0);
          float ring = smoothstep(0.72, 0.88, dist) * (1.0 - smoothstep(0.88, 1.0, dist));
          float fade = (1.0 - vAge) * smoothstep(0.0, 0.12, vAge);

          vec3 col = vec3(0.45, 0.72, 0.82);
          float glow = 0.0;
          for (int i = 0; i < ${ATMOSPHERE_LIGHT_SLOTS}; i++) {
            vec4 lp = uPointLightPos[i];
            vec4 lc = uPointLightColor[i];
            if (lc.a <= 0.001) continue;
            float d = length(lp.xyz - vWorldPos);
            if (d < lp.w) {
              float atten = pow(clamp(1.0 - d / lp.w, 0.0, 1.0), 1.7) * lc.a * 0.25;
              col += lc.rgb * atten * 2.2;
              glow += atten;
            }
          }

          float alpha = ring * fade * (0.16 + min(glow, 0.45));
          if (alpha < 0.01) discard;

          gl_FragColor = vec4(col, alpha);

          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    this.rippleMesh = new THREE.InstancedMesh(rippleGeo, this.rippleMaterial, rippleCount);
    this.rippleMesh.frustumCulled = false;
    this.rippleMesh.renderOrder = 3;
    this.group.add(this.rippleMesh);
  }

  /**
   * Updates focus anchor & live environment PointLight uniforms (zero per-frame GC).
   */
  update(focusX: number, focusY: number, focusZ: number, lights: readonly EnvironmentLightSample[]): void {
    this.focusUniform.value.set(focusX, focusY, focusZ);
    packEnvironmentLights(lights, this.lightUniforms);
  }

  dispose(): void {
    this.leafMesh.geometry.dispose();
    this.leafMaterial.dispose();
    this.leafTexture.dispose();
    this.rainMesh.geometry.dispose();
    this.rainMaterial.dispose();
    this.rippleMesh.geometry.dispose();
    this.rippleMaterial.dispose();
  }
}
