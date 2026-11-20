import * as THREE from 'three';

export interface ProceduralTextureSet {
  flagstoneMap: THREE.CanvasTexture;
  flagstoneNormal: THREE.CanvasTexture;
  flagstoneRoughness: THREE.CanvasTexture;
  ruinStoneMap: THREE.CanvasTexture;
  ruinStoneNormal: THREE.CanvasTexture;
  ruinStoneRoughness: THREE.CanvasTexture;
  mossGroundMap: THREE.CanvasTexture;
  mossGroundNormal: THREE.CanvasTexture;
  barkMap: THREE.CanvasTexture;
  barkNormal: THREE.CanvasTexture;
  metalNormal: THREE.CanvasTexture;
  fernMap: THREE.CanvasTexture;
  runeCircleTex: THREE.CanvasTexture;
  contactShadowTex: THREE.CanvasTexture;
  softGlowTex: THREE.CanvasTexture;
  fogWispTex: THREE.CanvasTexture;
  dispose: () => void;
}

function seededNoise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function configureTexture(
  tex: THREE.CanvasTexture,
  isColor: boolean,
  maxAniso: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a grayscale height canvas into a crisp Sobel tangent-space Normal Map.
 */
function heightCanvasToNormalTexture(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAniso: number,
  repeatX: number,
  repeatY: number
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hCtx = heightCanvas.getContext('2d')!;
  const src = hCtx.getImageData(0, 0, w, h).data;

  const nCanvas = document.createElement('canvas');
  nCanvas.width = w;
  nCanvas.height = h;
  const nCtx = nCanvas.getContext('2d')!;
  const out = nCtx.createImageData(w, h);
  const dst = out.data;

  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  nCtx.putImageData(out, 0, 0);
  return configureTexture(new THREE.CanvasTexture(nCanvas), false, maxAniso, repeatX, repeatY);
}

/**
 * 1024x1024 HD mossy carved flagstone PBR set (albedo + Sobel normal + damp-moss roughness).
 */
function makeFlagstoneTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 1024;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cHeight = document.createElement('canvas');
  cHeight.width = size;
  cHeight.height = size;
  const htx = cHeight.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = size;
  cRough.height = size;
  const rtx = cRough.getContext('2d')!;

  // Deep recessed mossy mortar base
  ctx.fillStyle = '#1b2c20';
  ctx.fillRect(0, 0, size, size);
  htx.fillStyle = '#181818';
  htx.fillRect(0, 0, size, size);
  rtx.fillStyle = '#d0d0d0'; // Rough mossy joints
  rtx.fillRect(0, 0, size, size);

  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0 ? 5 : 6;
    const colW = size / cols;
    const offset = r % 2 === 0 ? 0 : colW * 0.42;

    for (let c = -1; c <= cols; c++) {
      const n = seededNoise(c + 13, r + 29, 1);
      const n2 = seededNoise(c * 3 + 7, r * 5 + 11, 2);
      const x = c * colW + offset;
      const y = r * rowH;
      const pad = 6 + n * 4;
      const w = colW - pad * 2;
      const h = rowH - pad * 2;

      // Subtle warm/cool slate limestone variation per slab
      const base = Math.floor(80 + n * 34);
      const gTint = Math.floor(base + 7 + n2 * 12);
      const bTint = Math.floor(base + 5 + (1 - n2) * 8);

      const slabGrad = ctx.createLinearGradient(x + pad, y + pad, x + pad + w, y + pad + h);
      slabGrad.addColorStop(0, `rgb(${base + 12}, ${gTint + 12}, ${bTint + 10})`);
      slabGrad.addColorStop(0.55, `rgb(${base}, ${gTint}, ${bTint})`);
      slabGrad.addColorStop(1, `rgb(${base - 14}, ${gTint - 10}, ${bTint - 12})`);
      ctx.fillStyle = slabGrad;
      ctx.fillRect(x + pad, y + pad, w, h);

      // Chiseled edge highlight & inner ambient occlusion
      ctx.strokeStyle = 'rgba(218, 232, 226, 0.24)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + pad + 2, y + pad + 2, w - 4, h - 4);
      ctx.strokeStyle = 'rgba(10, 18, 16, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + pad, y + pad, w, h);

      // Height map slab with beveled perimeter
      const bVal = Math.floor(178 + n * 52);
      htx.fillStyle = `rgb(${bVal - 45}, ${bVal - 45}, ${bVal - 45})`;
      htx.fillRect(x + pad, y + pad, w, h);
      htx.fillStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
      htx.fillRect(x + pad + 6, y + pad + 6, w - 12, h - 12);

      // Roughness map: worn stone centers slightly smoother (rain-slicked sheen), edges rougher
      const rVal = Math.floor(165 + n2 * 52);
      rtx.fillStyle = `rgb(${rVal}, ${rVal}, ${rVal})`;
      rtx.fillRect(x + pad + 3, y + pad + 3, w - 6, h - 6);

      // Fine stone mineral pitting & grain speckles
      for (let s = 0; s < 32; s++) {
        const sx = x + pad + seededNoise(c * 23 + s, r * 7, 5) * w;
        const sy = y + pad + seededNoise(c * 5, r * 19 + s, 6) * h;
        const rad = 1.2 + seededNoise(s, r + c, 7) * 4.5;
        ctx.fillStyle =
          s % 3 === 0
            ? 'rgba(32, 54, 38, 0.28)'
            : s % 3 === 1
              ? 'rgba(16, 22, 24, 0.24)'
              : 'rgba(185, 200, 196, 0.14)';
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();

        htx.fillStyle = s % 2 === 0 ? 'rgba(60, 60, 60, 0.35)' : 'rgba(240, 240, 240, 0.2)';
        htx.beginPath();
        htx.arc(sx, sy, rad * 0.8, 0, Math.PI * 2);
        htx.fill();
      }

      // Crisp hairline cracks on ~40% of flagstones
      if (n > 0.56) {
        ctx.strokeStyle = 'rgba(14, 24, 20, 0.58)';
        ctx.lineWidth = 1.6;
        htx.strokeStyle = '#242424';
        htx.lineWidth = 2.4;
        const cx0 = x + pad + w * (0.2 + n2 * 0.5);
        const cy0 = y + pad;
        const cx1 = cx0 + (n - 0.75) * 45;
        const cy1 = y + pad + h * 0.52;
        const cx2 = cx1 + (n2 - 0.5) * 40;
        const cy2 = y + pad + h;
        for (const t of [ctx, htx]) {
          t.beginPath();
          t.moveTo(cx0, cy0);
          t.lineTo(cx1, cy1);
          t.lineTo(cx2, cy2);
          t.stroke();
        }
      }
    }
  }

  // Lush moss & lichen patches creeping along stone seams
  for (let i = 0; i < 88; i++) {
    const mx = seededNoise(i, 1, 9) * size;
    const my = seededNoise(1, i, 11) * size;
    const mr = 14 + seededNoise(i, i, 13) * 44;
    const grad = ctx.createRadialGradient(mx, my, 2, mx, my, mr);
    grad.addColorStop(0, 'rgba(44, 100, 54, 0.76)');
    grad.addColorStop(0.55, 'rgba(32, 74, 42, 0.42)');
    grad.addColorStop(1, 'rgba(32, 74, 42, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // Damp velvet moss is matte in roughness
    const rGrad = rtx.createRadialGradient(mx, my, 2, mx, my, mr);
    rGrad.addColorStop(0, 'rgba(242, 242, 242, 0.8)');
    rGrad.addColorStop(1, 'rgba(242, 242, 242, 0)');
    rtx.fillStyle = rGrad;
    rtx.beginPath();
    rtx.arc(mx, my, mr, 0, Math.PI * 2);
    rtx.fill();
  }

  return {
    map: configureTexture(new THREE.CanvasTexture(cColor), true, maxAniso, 3, 3),
    normal: heightCanvasToNormalTexture(cHeight, 3.2, maxAniso, 3, 3),
    roughness: configureTexture(new THREE.CanvasTexture(cRough), false, maxAniso, 3, 3),
  };
}

/**
 * 1024x1024 HD carved weathered ruin masonry PBR set (albedo + Sobel normal + roughness).
 */
function makeRuinStoneTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 1024;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cHeight = document.createElement('canvas');
  cHeight.width = size;
  cHeight.height = size;
  const htx = cHeight.getContext('2d')!;

  const cRough = document.createElement('canvas');
  cRough.width = size;
  cRough.height = size;
  const rtx = cRough.getContext('2d')!;

  ctx.fillStyle = '#536261';
  ctx.fillRect(0, 0, size, size);
  htx.fillStyle = '#909090';
  htx.fillRect(0, 0, size, size);
  rtx.fillStyle = '#c8c8c8';
  rtx.fillRect(0, 0, size, size);

  // Carved ashlar stone courses with beveled joints
  const courses = 10;
  const ch = size / courses;
  for (let r = 0; r < courses; r++) {
    const y = r * ch;
    ctx.fillStyle = 'rgba(14, 22, 20, 0.62)';
    ctx.fillRect(0, y, size, 5);
    htx.fillStyle = '#202020';
    htx.fillRect(0, y, size, 6);

    const blocks = 5;
    const bw = size / blocks;
    const shift = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= blocks; c++) {
      const n = seededNoise(c + 4, r + 9, 21);
      const x = c * bw + shift;
      const v = Math.floor(76 + n * 38);
      ctx.fillStyle = `rgba(${v}, ${v + 8}, ${v + 6}, 0.72)`;
      ctx.fillRect(x + 4, y + 6, bw - 8, ch - 10);

      // Carved stone top bevel highlight
      ctx.fillStyle = 'rgba(210, 225, 222, 0.16)';
      ctx.fillRect(x + 6, y + 7, bw - 12, 4);

      const bv = Math.floor(145 + n * 75);
      htx.fillStyle = `rgb(${bv}, ${bv}, ${bv})`;
      htx.fillRect(x + 6, y + 8, bw - 12, ch - 14);

      const rv = Math.floor(172 + n * 58);
      rtx.fillStyle = `rgb(${rv}, ${rv}, ${rv})`;
      rtx.fillRect(x + 5, y + 6, bw - 10, ch - 10);

      // Chisel striations & weathered pits
      for (let p = 0; p < 18; p++) {
        const px = x + 6 + seededNoise(c * 17 + p, r, 23) * (bw - 12);
        const py = y + 8 + seededNoise(c, r * 19 + p, 24) * (ch - 16);
        const pr = 1.2 + seededNoise(p, r, 25) * 4;
        ctx.fillStyle = p % 2 === 0 ? 'rgba(18, 26, 24, 0.22)' : 'rgba(195, 212, 208, 0.12)';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        htx.fillStyle = p % 2 === 0 ? 'rgba(40, 40, 40, 0.35)' : 'rgba(235, 235, 235, 0.2)';
        htx.beginPath();
        htx.arc(px, py, pr, 0, Math.PI * 2);
        htx.fill();
      }
    }
  }

  // Hanging moss streaks & damp weathering
  for (let i = 0; i < 110; i++) {
    const mx = seededNoise(i, 3, 27) * size;
    const my = seededNoise(7, i, 29) * size;
    const rw = 10 + seededNoise(i, 9, 31) * 34;
    const rh = 18 + seededNoise(i, 12, 33) * 58;
    const grad = ctx.createRadialGradient(mx, my, 2, mx, my, Math.max(rw, rh));
    grad.addColorStop(0, 'rgba(38, 88, 48, 0.62)');
    grad.addColorStop(0.65, 'rgba(28, 66, 38, 0.28)');
    grad.addColorStop(1, 'rgba(28, 66, 38, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(mx, my, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    map: configureTexture(new THREE.CanvasTexture(cColor), true, maxAniso, 1, 2),
    normal: heightCanvasToNormalTexture(cHeight, 3.0, maxAniso, 1, 2),
    roughness: configureTexture(new THREE.CanvasTexture(cRough), false, maxAniso, 1, 2),
  };
}

/**
 * 1024x1024 HD overgrown forest moss earth PBR set (albedo + Sobel normal).
 */
function makeMossGroundTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const size = 1024;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cHeight = document.createElement('canvas');
  cHeight.width = size;
  cHeight.height = size;
  const htx = cHeight.getContext('2d')!;

  ctx.fillStyle = '#122018';
  ctx.fillRect(0, 0, size, size);
  htx.fillStyle = '#6e6e6e';
  htx.fillRect(0, 0, size, size);

  // Layered moss clumps, dark soil patches, and fallen pine needles
  for (let i = 0; i < 480; i++) {
    const x = seededNoise(i, 2, 41) * size;
    const y = seededNoise(5, i, 43) * size;
    const rad = 14 + seededNoise(i, i, 47) * 62;
    const pick = i % 4;
    const col =
      pick === 0
        ? 'rgba(28, 58, 34, 0.56)'
        : pick === 1
          ? 'rgba(16, 32, 24, 0.62)'
          : pick === 2
            ? 'rgba(38, 50, 32, 0.44)'
            : 'rgba(22, 46, 34, 0.5)';
    const g = ctx.createRadialGradient(x, y, 2, x, y, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(12, 22, 16, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    const bv = Math.floor(80 + seededNoise(i, 8, 51) * 140);
    htx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.28)`;
    htx.beginPath();
    htx.arc(x, y, rad * 0.58, 0, Math.PI * 2);
    htx.fill();
  }

  // Fine organic twigs, pebbles, and grass blade flecks for HD surface micro-detail
  for (let i = 0; i < 900; i++) {
    const x = seededNoise(i, 17, 55) * size;
    const y = seededNoise(29, i, 57) * size;
    const len = 4 + seededNoise(i, 3, 59) * 10;
    const ang = seededNoise(i, 9, 61) * Math.PI * 2;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(54, 96, 52, 0.42)' : 'rgba(26, 36, 26, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();

    htx.strokeStyle = 'rgba(210, 210, 210, 0.35)';
    htx.lineWidth = 1.5;
    htx.beginPath();
    htx.moveTo(x, y);
    htx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    htx.stroke();
  }

  return {
    map: configureTexture(new THREE.CanvasTexture(cColor), true, maxAniso, 14, 14),
    normal: heightCanvasToNormalTexture(cHeight, 2.4, maxAniso, 14, 14),
  };
}

/**
 * 512x512 HD gnarled tree bark PBR texture + normal map.
 */
function makeBarkTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
} {
  const size = 512;
  const cColor = document.createElement('canvas');
  cColor.width = size;
  cColor.height = size;
  const ctx = cColor.getContext('2d')!;

  const cHeight = document.createElement('canvas');
  cHeight.width = size;
  cHeight.height = size;
  const htx = cHeight.getContext('2d')!;

  ctx.fillStyle = '#332d26';
  ctx.fillRect(0, 0, size, size);
  htx.fillStyle = '#707070';
  htx.fillRect(0, 0, size, size);

  for (let i = 0; i < 160; i++) {
    const x = seededNoise(i, 3, 71) * size;
    const w = 3 + seededNoise(i, 7, 73) * 14;
    const v = Math.floor(38 + seededNoise(i, 11, 75) * 34);
    ctx.fillStyle = `rgb(${v + 8}, ${v + 4}, ${v - 2})`;
    ctx.fillRect(x, 0, w, size);

    const hv = Math.floor(55 + seededNoise(i, 13, 77) * 165);
    htx.fillStyle = `rgb(${hv}, ${hv}, ${hv})`;
    htx.fillRect(x, 0, w * 0.8, size);
  }

  // Mossy bark crevices
  for (let i = 0; i < 40; i++) {
    const x = seededNoise(i, 19, 79) * size;
    const y = seededNoise(23, i, 81) * size;
    const r = 10 + seededNoise(i, i, 83) * 28;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, 'rgba(42, 82, 46, 0.55)');
    g.addColorStop(1, 'rgba(42, 82, 46, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    map: configureTexture(new THREE.CanvasTexture(cColor), true, maxAniso, 2, 3),
    normal: heightCanvasToNormalTexture(cHeight, 3.2, maxAniso, 2, 3),
  };
}

/**
 * 512x512 brushed forged-steel normal map for HD hero & boss armor sheen.
 */
function makeBrushedMetalNormal(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const cHeight = document.createElement('canvas');
  cHeight.width = size;
  cHeight.height = size;
  const htx = cHeight.getContext('2d')!;

  htx.fillStyle = '#808080';
  htx.fillRect(0, 0, size, size);

  for (let i = 0; i < 600; i++) {
    const y = seededNoise(i, 5, 91) * size;
    const v = Math.floor(105 + seededNoise(i, 9, 93) * 50);
    htx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.45)`;
    htx.fillRect(0, y, size, 1.5);
  }

  return heightCanvasToNormalTexture(cHeight, 1.4, maxAniso, 2, 2);
}

/**
 * 512x512 crisp serrated pinnate fern frond texture with alpha transparency,
 * curved leaflets (pinnae), central rachis, and subtle backlit edge veining.
 */
function makeFernTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const baseY = size - 6;
  const tipY = 10;
  const spanY = baseY - tipY;

  // Draw 15 pairs of serrated curving fern pinnae from base to tip
  const pairs = 15;
  for (let i = 0; i < pairs; i++) {
    const t = i / (pairs - 1); // 0 = base, 1 = tip
    const y = baseY - (0.07 + t * 0.87) * spanY;
    // Organic fern envelope: fuller in lower-mid frond, tapering gracefully to tip
    const env = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.94) * (1 - t * 0.25);
    const pinnaLen = Math.max(24, env * (size * 0.45));
    const pinnaWidth = Math.max(10, (1 - t * 0.55) * 26);

    for (const side of [-1, 1]) {
      const tipX = cx + side * pinnaLen;
      const tipLift = y - pinnaLen * (0.28 + t * 0.22);

      // Leaflet gradient (deep forest base -> luminous emerald tip)
      const grad = ctx.createLinearGradient(cx, y, tipX, tipLift);
      grad.addColorStop(0, '#1d4426');
      grad.addColorStop(0.5, '#34723d');
      grad.addColorStop(0.88, '#559c52');
      grad.addColorStop(1, '#79bd6a');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, y + pinnaWidth * 0.26);

      // Upper serrated edge (3 subtle lobes along each leaflet)
      const lobes = 3;
      for (let l = 1; l <= lobes; l++) {
        const lt = l / lobes;
        const prevT = (l - 0.5) / lobes;
        const bulge = Math.sin(lt * Math.PI * 0.85) * pinnaWidth * 0.52;
        const cpx = cx + side * pinnaLen * prevT;
        const cpy = y + (tipLift - y) * prevT - bulge * 1.15;
        const px = cx + side * pinnaLen * lt;
        const py = y + (tipLift - y) * lt - (l === lobes ? 0 : bulge * 0.35);
        ctx.quadraticCurveTo(cpx, cpy, px, py);
      }

      // Lower returning edge with gentle curve
      ctx.quadraticCurveTo(
        cx + side * pinnaLen * 0.55,
        y + (tipLift - y) * 0.42 + pinnaWidth * 0.62,
        cx,
        y + pinnaWidth * 0.42
      );
      ctx.closePath();
      ctx.fill();

      // Subtle central leaflet vein
      ctx.strokeStyle = 'rgba(132, 206, 118, 0.45)';
      ctx.lineWidth = Math.max(1.4, (1 - t * 0.6) * 2.6);
      ctx.beginPath();
      ctx.moveTo(cx, y + pinnaWidth * 0.14);
      ctx.quadraticCurveTo(
        cx + side * pinnaLen * 0.5,
        y + (tipLift - y) * 0.46,
        tipX - side * 4,
        tipLift + 2
      );
      ctx.stroke();
    }
  }

  // Terminal spear tip leaflet
  const tipGrad = ctx.createLinearGradient(cx, tipY + 56, cx, tipY);
  tipGrad.addColorStop(0, '#3a7d43');
  tipGrad.addColorStop(1, '#84c973');
  ctx.fillStyle = tipGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 16, tipY + 52);
  ctx.quadraticCurveTo(cx - 10, tipY + 18, cx, tipY);
  ctx.quadraticCurveTo(cx + 10, tipY + 18, cx + 16, tipY + 52);
  ctx.closePath();
  ctx.fill();

  // Central tapered stem / rachis
  const stemGrad = ctx.createLinearGradient(cx, baseY, cx, tipY);
  stemGrad.addColorStop(0, '#2a522c');
  stemGrad.addColorStop(0.5, '#599652');
  stemGrad.addColorStop(1, '#8dd17a');
  ctx.fillStyle = stemGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 8, baseY);
  ctx.lineTo(cx + 8, baseY);
  ctx.lineTo(cx + 2, tipY + 14);
  ctx.lineTo(cx - 2, tipY + 14);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 1024x1024 ultra-crisp intricate arcane summoning circle with concentric filigree & glyphs.
 */
function makeRuneCircleTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Soft outer arcane bloom halo
  const halo = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.49);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  halo.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.44, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.365, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.23, 0, Math.PI * 2);
  ctx.stroke();

  // Inner hexagram + octagon star
  ctx.lineWidth = 3.5;
  for (let t = 0; t < 2; t++) {
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const ang = (i * Math.PI * 2) / 3 + (t * Math.PI) / 3;
      const px = cx + Math.cos(ang) * size * 0.36;
      const py = cy + Math.sin(ang) * size * 0.36;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Fine radial ticks around inner ring
  ctx.lineWidth = 2;
  for (let i = 0; i < 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    const r0 = size * 0.23;
    const r1 = size * (i % 4 === 0 ? 0.27 : 0.25);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
    ctx.stroke();
  }

  // 24 crisp procedural arcane glyphs around outer ring
  const glyphCount = 24;
  ctx.lineWidth = 4.2;
  for (let i = 0; i < glyphCount; i++) {
    const ang = (i / glyphCount) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * size * 0.402, cy + Math.sin(ang) * size * 0.402);
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.lineTo(0, 14);
    ctx.lineTo(10, -14);
    if (i % 3 === 0) {
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
    } else if (i % 3 === 1) {
      ctx.moveTo(0, -18);
      ctx.lineTo(0, 18);
    } else {
      ctx.moveTo(-8, 8);
      ctx.lineTo(8, -8);
    }
    ctx.stroke();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

function makeRadialSpriteTexture(
  innerColor: string,
  midColor: string,
  outerColor: string
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.5, midColor);
  grad.addColorStop(1, outerColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const flagstone = makeFlagstoneTextures(maxAniso);
  const ruinStone = makeRuinStoneTextures(maxAniso);
  const mossGround = makeMossGroundTextures(maxAniso);
  const bark = makeBarkTextures(maxAniso);
  const metalNormal = makeBrushedMetalNormal(maxAniso);
  const fernMap = makeFernTexture(maxAniso);
  const runeCircleTex = makeRuneCircleTexture(maxAniso);

  const contactShadowTex = makeRadialSpriteTexture(
    'rgba(0, 0, 0, 0.76)',
    'rgba(0, 0, 0, 0.34)',
    'rgba(0, 0, 0, 0)'
  );
  const softGlowTex = makeRadialSpriteTexture(
    'rgba(255, 255, 255, 1.0)',
    'rgba(165, 245, 255, 0.45)',
    'rgba(0, 220, 255, 0)'
  );
  const fogWispTex = makeRadialSpriteTexture(
    'rgba(145, 200, 210, 0.22)',
    'rgba(105, 155, 170, 0.09)',
    'rgba(80, 120, 135, 0)'
  );

  const all = [
    flagstone.map,
    flagstone.normal,
    flagstone.roughness,
    ruinStone.map,
    ruinStone.normal,
    ruinStone.roughness,
    mossGround.map,
    mossGround.normal,
    bark.map,
    bark.normal,
    metalNormal,
    fernMap,
    runeCircleTex,
    contactShadowTex,
    softGlowTex,
    fogWispTex,
  ];

  return {
    flagstoneMap: flagstone.map,
    flagstoneNormal: flagstone.normal,
    flagstoneRoughness: flagstone.roughness,
    ruinStoneMap: ruinStone.map,
    ruinStoneNormal: ruinStone.normal,
    ruinStoneRoughness: ruinStone.roughness,
    mossGroundMap: mossGround.map,
    mossGroundNormal: mossGround.normal,
    barkMap: bark.map,
    barkNormal: bark.normal,
    metalNormal,
    fernMap,
    runeCircleTex,
    contactShadowTex,
    softGlowTex,
    fogWispTex,
    dispose: () => {
      for (const t of all) t.dispose();
    },
  };
}
