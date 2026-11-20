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

    const size = 132;
    const dpr = 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = size / 2;
    const scale = (size * 0.44) / LEVEL_PLAYABLE_RADIUS;

    const toMapX = (wx: number) => half + wx * scale;
    const toMapY = (wz: number) => half + wz * scale;

    ctx.clearRect(0, 0, size, size);

    // Clip to octagonal carved slate map disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.clip();

    // Deep overgrown ruins basin background
    ctx.fillStyle = '#0d1a1f';
    ctx.fillRect(0, 0, size, size);

    // Subtle mossy radial gradient
    const bgGrad = ctx.createRadialGradient(half, half, 6, half, half, half);
    bgGrad.addColorStop(0, '#182b27');
    bgGrad.addColorStop(1, '#0a1419');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Walkable flagstone walkways & courtyards
    ctx.fillStyle = '#334946';
    for (const w of WALKWAYS) {
      const rx = toMapX(w.x - w.width * 0.5);
      const ry = toMapY(w.z - w.depth * 0.5);
      ctx.fillRect(rx, ry, w.width * scale, w.depth * scale);
    }

    // Archway markers
    ctx.strokeStyle = '#65807b';
    ctx.lineWidth = 2;
    for (const a of ARCHES) {
      const ax = toMapX(a.x);
      const ay = toMapY(a.z);
      const halfSpan = (a.span * 0.5) * scale;
      const cos = Math.cos(a.rotationY);
      const sin = Math.sin(a.rotationY);
      ctx.beginPath();
      ctx.moveTo(ax - cos * halfSpan, ay + sin * halfSpan);
      ctx.lineTo(ax + cos * halfSpan, ay - sin * halfSpan);
      ctx.stroke();
    }

    // Click-to-move destination marker
    if (hud.moveTarget) {
      const tx = toMapX(hud.moveTarget.x);
      const ty = toMapY(hud.moveTarget.z);
      ctx.strokeStyle = 'rgba(84, 244, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rune Obelisks
    for (const ob of hud.obelisks) {
      const ox = toMapX(ob.x);
      const oy = toMapY(ob.z);
      ctx.fillStyle = ob.attuned ? '#4cf5ff' : '#3a8696';
      ctx.strokeStyle = '#071217';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oy - 5);
      ctx.lineTo(ox + 4.5, oy);
      ctx.lineTo(ox, oy + 5);
      ctx.lineTo(ox - 4.5, oy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Northern Sanctum Portal
    const px = toMapX(hud.portal.x);
    const py = toMapY(hud.portal.z);
    ctx.fillStyle = hud.portal.active ? '#8afbff' : '#1f5e6e';
    ctx.strokeStyle = hud.portal.active ? '#ffffff' : '#4097ab';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(px, py, hud.portal.active ? 5.5 : 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Living enemies
    for (const e of hud.enemies) {
      const ex = toMapX(e.x);
      const ey = toMapY(e.z);
      ctx.fillStyle =
        e.archetype === 'warden'
          ? '#ff3d68'
          : e.archetype === 'wisp'
            ? '#e263ff'
            : e.archetype === 'charger'
              ? '#ff8c38'
              : '#f05a46';
      ctx.beginPath();
      ctx.arc(ex, ey, e.archetype === 'warden' ? 4.8 : 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hero directional arrow
    const hx = toMapX(hud.heroX);
    const hy = toMapY(hud.heroZ);
    ctx.save();
    ctx.translate(hx, hy);
    // In XZ world space: facing = atan2(dx, dz), so sin(facing) = X, cos(facing) = Z (+Y on map)
    const angle = Math.atan2(Math.sin(hud.heroFacing), Math.cos(hud.heroFacing));
    ctx.rotate(-angle + Math.PI);
    ctx.fillStyle = '#e8ffff';
    ctx.strokeStyle = '#07141a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.2, 4.5);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-4.2, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Carved bronze outer rim
    ctx.strokeStyle = '#7d6c4d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(72, 232, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, half - 5, 0, Math.PI * 2);
    ctx.stroke();
  }, [hud]);

  return (
    <div
      className="relative flex flex-col items-center pointer-events-none"
      aria-label="Ruins Minimap"
    >
      <div className="relative rounded-full p-1 bg-[#0b151b]/90 shadow-[0_6px_18px_rgba(0,0,0,0.65)] border border-[#6e5e44]/70">
        <canvas ref={canvasRef} width={264} height={264} className="block w-[132px] h-[132px] rounded-full" />
        <span className="font-ui absolute top-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-widest text-[#9fc3c6] hud-text-shadow">
          N
        </span>
      </div>
    </div>
  );
}
