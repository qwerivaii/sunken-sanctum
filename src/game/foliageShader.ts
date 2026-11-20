import * as THREE from 'three';

export interface FoliageWindUniforms {
  uTime: { value: number };
  uWindStrength: { value: number };
  uWindDirection: { value: THREE.Vector2 };
  uHeroPos: { value: THREE.Vector3 };
}

export function createFoliageWindUniforms(): FoliageWindUniforms {
  return {
    uTime: { value: 0 },
    uWindStrength: { value: 0.19 },
    uWindDirection: { value: new THREE.Vector2(0.84, 0.54).normalize() },
    uHeroPos: { value: new THREE.Vector3(0, 0, 22) },
  };
}

export interface FernFoliageShaderOptions {
  fernMap: THREE.Texture;
  windUniforms: FoliageWindUniforms;
  fogColor: THREE.Color;
  fogDensity: number;
  useAlphaToCoverage?: boolean;
}

/**
 * Custom GLSL ShaderMaterial for instanced overgrown ruin ferns featuring:
 * - World-space dual-octave rolling wind gust & tip-flutter vertex displacement
 * - Interactive proximity bend when the hero walks past foliage
 * - Order-independent alphaToCoverage (MSAA GPU) + fwidth derivative-sharpened alpha
 *   rendered in the opaque depth-writing pass so portals, fog, and spells never sort behind ferns
 * - Wrapped twilight lighting, backlit subsurface translucency, root AO, and FogExp2
 * - Full ACESFilmic tone-mapping & sRGB color-space integration
 */
export function createFernFoliageShaderMaterial(
  options: FernFoliageShaderOptions
): THREE.ShaderMaterial {
  const { fernMap, windUniforms, fogColor, fogDensity, useAlphaToCoverage = true } = options;

  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: fernMap },
      uTime: windUniforms.uTime,
      uWindStrength: windUniforms.uWindStrength,
      uWindDirection: windUniforms.uWindDirection,
      uHeroPos: windUniforms.uHeroPos,
      uAlphaCutoff: { value: 0.42 },
      uAlphaDiscard: { value: useAlphaToCoverage ? 0.06 : 0.48 },
      uSunDir: { value: new THREE.Vector3(22, 34, 18).normalize() },
      uSunColor: { value: new THREE.Color(0xffdcb0) },
      uRimDir: { value: new THREE.Vector3(-18, 16, -24).normalize() },
      uRimColor: { value: new THREE.Color(0x3ad0f0) },
      uSkyColor: { value: new THREE.Color(0x40768f) },
      uGroundColor: { value: new THREE.Color(0x111d16) },
      uFogColor: { value: fogColor.clone() },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWindStrength;
      uniform vec2 uWindDirection;
      uniform vec3 uHeroPos;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstanceTint;
      varying float vFogDepth;
      varying float vWindBend;

      void main() {
        vUv = uv;

        #ifdef USE_INSTANCING_COLOR
          vInstanceTint = instanceColor;
        #else
          vInstanceTint = vec3(1.0);
        #endif

        // Compute instance root world position for coherent rolling wind gusts
        #ifdef USE_INSTANCING
          vec4 localWorld = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 instanceOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          mat3 normalMatWorld = mat3(modelMatrix) * mat3(instanceMatrix);
        #else
          vec4 localWorld = modelMatrix * vec4(position, 1.0);
          vec3 instanceOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          mat3 normalMatWorld = mat3(modelMatrix);
        #endif

        vec3 worldPos = localWorld.xyz;

        // Flexibility mask: roots (uv.y == 0) stay pinned to ground, frond tips sway freely
        float bendFactor = pow(clamp(uv.y, 0.0, 1.0), 1.45);

        // Primary rolling wind wave + secondary subtle high-frequency leaf flutter
        float gustPhase = dot(instanceOrigin.xz, uWindDirection) * 0.24 - uTime * 1.55;
        float gust = sin(gustPhase) * 0.65 + sin(gustPhase * 1.9 + 1.3) * 0.35;
        float flutter = sin(worldPos.x * 2.4 + worldPos.z * 1.9 - uTime * 3.9) * 0.3;
        float sway = (gust + flutter * uv.y) * uWindStrength * bendFactor;

        vec2 crossDir = vec2(-uWindDirection.y, uWindDirection.x);
        worldPos.xz += uWindDirection * sway + crossDir * (flutter * uWindStrength * 0.34 * bendFactor);
        // Subtle vertical dip as the arched frond bends under a gust
        worldPos.y -= abs(sway) * 0.22;

        // Interactive hero brush-past displacement when hero walks close to a fern
        vec2 toFern = worldPos.xz - uHeroPos.xz;
        float heroDist = length(toFern);
        float pushMask = smoothstep(1.9, 0.35, heroDist) * bendFactor;
        if (pushMask > 0.001) {
          vec2 pushDir = toFern / max(heroDist, 0.001);
          worldPos.xz += pushDir * pushMask * 0.36;
          worldPos.y -= pushMask * 0.14;
        }

        vWorldPos = worldPos;
        vWindBend = sway;
        vWorldNormal = normalize(normalMatWorld * normal);

        vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
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

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vInstanceTint;
      varying float vFogDepth;
      varying float vWindBend;

      void main() {
        vec4 texel = texture2D(uMap, vUv);

        // Derivative-sharpened (fwidth) alpha coverage:
        // Preserves crisp, mipmap-stable serrated leaflet edges with sub-pixel MSAA
        // alphaToCoverage on hardware GPUs and clean depth-buffered cutout everywhere.
        float edgeWidth = max(fwidth(texel.a), 0.0015);
        float smoothAlpha = clamp((texel.a - uAlphaCutoff) / edgeWidth + 0.5, 0.0, 1.0);
        if (smoothAlpha < uAlphaDiscard) discard;

        // Flip normal cleanly for double-sided leaf faces
        vec3 N = normalize(vWorldNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vWorldPos);

        // Rich albedo tinted per-instance with subtle root-to-tip ambient occlusion
        float rootAo = mix(0.5, 1.06, smoothstep(0.0, 0.45, vUv.y));
        vec3 albedo = texel.rgb * vInstanceTint * rootAo;

        // Hemisphere twilight fill (sky + mossy forest floor bounce)
        float hemiFactor = N.y * 0.5 + 0.5;
        vec3 ambient = mix(uGroundColor, uSkyColor, hemiFactor) * 0.58;

        // Soft wrapped directional key light (warmer dusk sunlight)
        float sunWrap = clamp((dot(N, uSunDir) + 0.35) / 1.35, 0.0, 1.0);
        vec3 directSun = uSunColor * sunWrap * 0.92;

        // Cool cyan twilight back-rim accent along leaf silhouette
        float rimWrap = clamp((dot(N, uRimDir) + 0.3) / 1.3, 0.0, 1.0);
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
        vec3 rimLight = uRimColor * (rimWrap * 0.42 + fresnel * 0.28);

        // Backlit subsurface translucency through thinner upper leaflets & tips
        float sssView = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 2.5);
        float thinness = smoothstep(0.15, 0.95, vUv.y);
        vec3 translucency = vec3(0.32, 0.72, 0.24) * uSunColor * (0.14 + sssView * 0.48) * thinness;

        // Subtle specular dew sheen catching moonlight when fronds tilt in the wind
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), 28.0) * (0.12 + abs(vWindBend) * 0.25);
        vec3 specular = mix(uSunColor, uRimColor, 0.35) * spec;

        vec3 color = albedo * (ambient + directSun + rimLight) + translucency + specular;

        // Exact FogExp2 atmospheric integration matching scene.fog
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

        gl_FragColor = vec4(color, smoothAlpha);

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
}

export interface WindPatchOptions {
  swayScale: number;
  mode: 'canopy' | 'vine';
}

/**
 * Injects coherent world-space wind vertex displacement into built-in PBR foliage
 * materials (hanging arch vines & tree canopies) via onBeforeCompile, preserving
 * full shadows, normal lighting, and RoomEnvironment reflections.
 */
export function applyFoliageWindToMaterial(
  material: THREE.MeshStandardMaterial,
  windUniforms: FoliageWindUniforms,
  options: WindPatchOptions
): void {
  const { swayScale, mode } = options;

  material.customProgramCacheKey = () => `sanctum-foliage-wind-${mode}-${swayScale.toFixed(2)}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uWindDirection = windUniforms.uWindDirection;
    shader.uniforms.uSwayScale = { value: swayScale };

    shader.vertexShader =
      `uniform float uTime;\nuniform float uWindStrength;\nuniform vec2 uWindDirection;\nuniform float uSwayScale;\n` +
      shader.vertexShader;

    const displacementSnippet =
      mode === 'vine'
        ? /* glsl */ `
          #include <begin_vertex>
          vec4 windWorldPos = modelMatrix * vec4(transformed, 1.0);
          // Hanging arch vines sway more near their lower dangling tips (uv.x along tube length)
          float hangWeight = pow(clamp(uv.x, 0.0, 1.0), 1.6);
          float vineWave = sin(windWorldPos.x * 0.45 + windWorldPos.z * 0.35 - uTime * 1.85) * 0.7
                         + sin(windWorldPos.y * 1.4 - uTime * 3.1) * 0.3;
          float vineShift = vineWave * uWindStrength * uSwayScale * hangWeight;
          transformed.x += uWindDirection.x * vineShift;
          transformed.z += uWindDirection.y * vineShift;
        `
        : /* glsl */ `
          #include <begin_vertex>
          vec4 windWorldPos = modelMatrix * vec4(transformed, 1.0);
          float crownWeight = clamp((transformed.y + 1.0) * 0.5, 0.15, 1.0);
          float canopyWave = sin(windWorldPos.x * 0.22 + windWorldPos.z * 0.18 - uTime * 1.3) * 0.7
                           + sin(windWorldPos.x * 0.85 - uTime * 2.5 + windWorldPos.z * 0.7) * 0.3;
          float canopyShift = canopyWave * uWindStrength * uSwayScale * crownWeight;
          transformed.x += uWindDirection.x * canopyShift;
          transformed.z += uWindDirection.y * canopyShift;
        `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      displacementSnippet
    );
  };
}
