import { useEffect, useRef } from 'react';
import { ARCHES, LEVEL_PLAYABLE_RADIUS, WALKWAYS } from '../game/levelData';
import { HudSnapshot } from '../game/types';

interface MinimapProps {
  hud: HudSnapshot;
}

export function Minimap({ hud }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 124;
    const dpr = 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = size / 2;
    const scale = (size * 0.43) / LEVEL_PLAYABLE_RADIUS;

    const toMapX = (wx: number) => half + wx * scale;
    const toMapY = (wz: number) => half + wz * scale;

    ctx.clearRect(0, 0, size, size);

    // Circular sumi-e ink terrain disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.clip();

    // Dark ink-wash obsidian parchment radial backdrop
    const bgGrad = ctx.createRadialGradient(half, half, 4, half, half, half);
    bgGrad.addColorStop(0, '#1a1b1e');
    bgGrad.addColorStop(0.75, '#101114');
    bgGrad.addColorStop(1, '#08090b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle compass crosshairs
    ctx.strokeStyle = 'rgba(220, 214, 202, 0.08)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(half, 6);
    ctx.lineTo(half, size - 6);
    ctx.moveTo(6, half);
    ctx.lineTo(size - 6, half);
    ctx.stroke();

    // Walkable flagstone paths in muted bone-ash ink
    ctx.fillStyle = '#383633';
    for (const w of WALKWAYS) {
      const rx = toMapX(w.x - w.width * 0.5);
      const ry = toMapY(w.z - w.depth * 0.5);
      ctx.fillRect(rx, ry, w.width * scale, w.depth * scale);
    }

    // Archway lintels in brushed steel
    ctx.strokeStyle = '#7d7870';
    ctx.lineWidth = 1.6;
    for (const a of ARCHES) {
      const ax = toMapX(a.x);
      const ay = toMapY(a.z);
      const halfSpan = a.span * 0.5 * scale;
      const cos = Math.cos(a.rotationY);
      const sin = Math.sin(a.rotationY);
      ctx.beginPath();
      ctx.moveTo(ax - cos * halfSpan, ay + sin * halfSpan);
      ctx.lineTo(ax + cos * halfSpan, ay - sin * halfSpan);
      ctx.stroke();
    }

    // Click-to-move destination waypoint ring
    if (hud.moveTarget) {
      const tx = toMapX(hud.moveTarget.x);
      const ty = toMapY(hud.moveTarget.z);
      ctx.strokeStyle = 'rgba(226, 220, 208, 0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(tx, ty, 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rune Obelisks (amber-gold when unattuned, luminous pale-gold/bone when attuned)
    for (const ob of hud.obelisks) {
      const ox = toMapX(ob.x);
      const oy = toMapY(ob.z);
      ctx.fillStyle = ob.attuned ? '#e9e4d8' : '#c89128';
      ctx.strokeStyle = '#090a0c';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(ox, oy - 4.8);
      ctx.lineTo(ox + 4.4, oy);
      ctx.lineTo(ox, oy + 4.8);
      ctx.lineTo(ox - 4.4, oy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Northern Sanctum Portal
    const px = toMapX(hud.portal.x);
    const py = toMapY(hud.portal.z);
    ctx.fillStyle = hud.portal.active ? '#f0ece1' : '#4a6970';
    ctx.strokeStyle = hud.portal.active ? '#d8a234' : '#859da2';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(px, py, hud.portal.active ? 5.0 : 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Living enemies in vermilion crimson & burnt ochre
    for (const e of hud.enemies) {
      const ex = toMapX(e.x);
      const ey = toMapY(e.z);
      ctx.fillStyle =
        e.archetype === 'warden'
          ? '#d92632'
          : e.archetype === 'wisp'
            ? '#c97856'
            : e.archetype === 'charger'
              ? '#d48d2a'
              : '#b82e34';
      ctx.beginPath();
      ctx.arc(ex, ey, e.archetype === 'warden' ? 4.6 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hero directional blade pointer
    const hx = toMapX(hud.heroX);
    const hy = toMapY(hud.heroZ);
    ctx.save();
    ctx.translate(hx, hy);
    const angle = Math.atan2(Math.sin(hud.heroFacing), Math.cos(hud.heroFacing));
    ctx.rotate(-angle + Math.PI);
    ctx.fillStyle = '#f2eee4';
    ctx.strokeStyle = '#08090b';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -5.8);
    ctx.lineTo(3.8, 4.2);
    ctx.lineTo(0, 1.8);
    ctx.lineTo(-3.8, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Fine brushed-steel hairline outer bezel with subtle cardinal notches
    ctx.strokeStyle = 'rgba(176, 169, 156, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(half, half, half - 2.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(214, 155, 39, 0.32)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(half, half, half - 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }, [hud]);

  return (
    <div
      className="relative flex flex-col items-center pointer-events-none"
      aria-label="Ruins Minimap"
    >
      <div className="relative rounded-full p-[3px] bg-[#0a0b0e]/85 shadow-[0_8px_22px_rgba(0,0,0,0.75)] border border-[#5f5b53]/70">
        <canvas
          ref={canvasRef}
          width={248}
          height={248}
          className="block w-[124px] h-[124px] rounded-full"
        />
        <span className="font-display absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-[0.22em] text-[#d9d3c7] hud-text-shadow">
          N
        </span>
      </div>
    </div>
  );
}
