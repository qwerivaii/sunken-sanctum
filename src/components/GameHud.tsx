import { useEffect, useState } from 'react';
import { FloatingCombatTextItem } from '../game/engine';
import { ABILITIES, AbilityId, HudSnapshot, RunSummary } from '../game/types';
import { Minimap } from './Minimap';

interface GameHudProps {
  hud: HudSnapshot;
  floatingTexts: FloatingCombatTextItem[];
  runSummary: RunSummary | null;
  muted: boolean;
  onCastAbility: (id: AbilityId) => void;
  onBasicAttack: () => void;
  onToggleMute: () => void;
  onPauseToggle: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

function AbilityIcon({ id, ready }: { id: AbilityId; ready: boolean }) {
  const mainStroke = ready ? '#ece8df' : '#7b766d';
  const accentStroke = ready ? '#d69b27' : '#5c5851';

  if (id === 'cleave') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path
          d="M4 18 C8 6, 17 4, 21 6 C17 9, 13 13, 10 20 Z"
          fill={ready ? '#e6e2da' : '#6c6860'}
          stroke="#0a0b0d"
          strokeWidth="1.4"
        />
        <path d="M3 20 L9 14" stroke="#c92831" strokeWidth="2.1" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'dash') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <path
          d="M3 12 H16 M11 6 L19 12 L11 18"
          fill="none"
          stroke={mainStroke}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 8 H10 M4 16 H10"
          stroke={accentStroke}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (id === 'sigil') {
    return (
      <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
        <polygon
          points="12,3 21,12 12,21 3,12"
          fill="none"
          stroke={mainStroke}
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="4.5" fill="none" stroke={accentStroke} strokeWidth="1.4" />
        <circle cx="12" cy="12" r="1.8" fill={ready ? '#d69b27' : '#6e6a62'} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="18" stroke={mainStroke} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 6 L12 2 L15 6" fill="none" stroke={accentStroke} strokeWidth="1.5" />
      <ellipse cx="12" cy="19.5" rx="7" ry="2.2" fill="none" stroke="#c92831" strokeWidth="1.6" />
    </svg>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function GameHud({
  hud,
  floatingTexts,
  runSummary,
  muted,
  onCastAbility,
  onBasicAttack,
  onToggleMute,
  onPauseToggle,
  onRestart,
  onReturnTitle,
}: GameHudProps) {
  // Delayed trailing damage ghost bar for visceral hit feedback
  const [ghostHp, setGhostHp] = useState(hud.hp);

  useEffect(() => {
    if (hud.hp > ghostHp) {
      setGhostHp(hud.hp);
      return;
    }
    if (hud.hp < ghostHp) {
      const id = window.setTimeout(() => setGhostHp(hud.hp), 280);
      return () => clearTimeout(id);
    }
  }, [hud.hp, ghostHp]);

  const hpPct = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const ghostPct = Math.max(hpPct, Math.min(100, (ghostHp / hud.maxHp) * 100));
  const isCriticalHp = hud.phase === 'playing' && hud.hp > 0 && hpPct <= 34;

  // Live secondary amber "Sha-Chi / Resonance" bar reflects real-time ready ability charge
  const readyFraction =
    ABILITIES.reduce((acc, ab) => {
      const cd = hud.cooldowns[ab.id];
      const frac = Math.max(0, Math.min(1, 1 - cd / ab.cooldown));
      return acc + frac;
    }, 0) / ABILITIES.length;
  const resonancePct = Math.round(readyFraction * 100);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Subtle borderless ink corner scrims for effortless HUD legibility over sunlit ferns & stone */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 w-[380px] h-[160px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top left, rgba(6, 7, 9, 0.72) 0%, rgba(6, 7, 9, 0.32) 48%, rgba(6, 7, 9, 0) 76%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 w-[440px] h-[150px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, rgba(6, 7, 9, 0.74) 0%, rgba(6, 7, 9, 0.34) 50%, rgba(6, 7, 9, 0) 78%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 w-[480px] h-[160px] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at bottom right, rgba(6, 7, 9, 0.78) 0%, rgba(6, 7, 9, 0.38) 54%, rgba(6, 7, 9, 0) 80%)',
        }}
      />

      {/* Subtle critical low-HP crimson peripheral vignette */}
      {isCriticalHp && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0) 56%, rgba(145, 16, 24, 0.42) 100%)',
          }}
        />
      )}

      {/* Floating Screen-Projected Combat Feedback */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {floatingTexts.map((ft) => {
          const colorClass =
            ft.kind === 'crit'
              ? 'text-[#f0c05a] text-xl font-bold tracking-wider'
              : ft.kind === 'heal'
                ? 'text-[#d8efe2] text-base font-semibold'
                : ft.kind === 'player_hurt'
                  ? 'text-[#e03842] text-lg font-bold'
                  : ft.kind === 'milestone'
                    ? 'text-[#e8e3d8] text-sm font-semibold tracking-[0.22em]'
                    : 'text-[#ece8df] text-base font-semibold';
          return (
            <span
              key={ft.id}
              className={`combat-float-anim font-ui tabular-nums hud-stroke absolute whitespace-nowrap ${colorClass}`}
              style={{ left: `${ft.x}px`, top: `${ft.y}px` }}
            >
              {ft.text}
            </span>
          );
        })}
      </div>

      {/* TOP-LEFT: Quiet Unboxed Ink-Wash Objective Cue */}
      <div className="absolute top-5 left-7 max-w-[300px]">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="w-2 h-2 rotate-45 bg-[#c92831] border border-[#f2dfd0]/60 shrink-0"
          />
          <span
            className="font-display text-sm font-semibold tracking-[0.14em] text-[#ece8df] hud-text-shadow"
            data-testid="hud-objective"
          >
            {hud.objectiveTitle}
          </span>
        </div>
        <div className="mt-1.5 h-px w-48 bg-gradient-to-r from-[#b5aea0]/55 via-[#b5aea0]/25 to-transparent" />
        <p className="font-serif-editorial text-sm text-[#dcd6ca] leading-snug mt-1 hud-text-shadow">
          {hud.objectiveDetail}
        </p>
        <div className="mt-1 flex items-center gap-2.5 font-ui text-[11px] text-[#c2bcb0] tabular-nums hud-text-shadow">
          <span>{formatTime(hud.elapsedTime)}</span>
          <span aria-hidden="true">·</span>
          <span>Slain {hud.kills}</span>
          <span aria-hidden="true">·</span>
          <span>Score {hud.score}</span>
        </div>
      </div>

      {/* TOP-CENTER: Phantom Blade Zero Unboxed Beveled Boss Bar & Chapter/Milestone Banner */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 w-[90vw] max-w-[460px]">
        {hud.wardenHp !== null && hud.wardenMaxHp !== null && (
          <div className="w-full flex flex-col items-center">
            {/* Primary Boss Bone-White Blade Bar */}
            <div className="relative w-full h-[10px] bg-[#0b0c0e]/90 border border-[#726d64]/85 pbz-bar-boss shadow-[0_4px_14px_rgba(0,0,0,0.85)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#d4cfc4] via-[#f0ece3] to-[#dcd6ca] transition-all duration-100"
                style={{ width: `${Math.max(0, (hud.wardenHp / hud.wardenMaxHp) * 100)}%` }}
              />
            </div>
            {/* Tucked Thin Burnished Amber Guard/Posture Accent Line */}
            <div className="relative w-[68%] h-[4px] mt-[3px] bg-[#0b0c0e]/85 border border-[#5e5645]/75 pbz-bar-boss overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#a66d14] via-[#df9f28] to-[#b87b1a] transition-all duration-150"
                style={{ width: `${Math.max(0, (hud.wardenHp / hud.wardenMaxHp) * 100)}%` }}
              />
            </div>
            {/* Boss Name Below Bar — Classic Phantom Blade Zero Small-Caps Serif */}
            <div className="mt-1.5 flex items-baseline gap-3">
              <span className="font-display text-sm font-semibold tracking-[0.18em] text-[#f0ece3] hud-text-shadow">
                Sanctum Warden, Keeper of the Rift
              </span>
              <span className="font-ui text-[11px] font-medium tabular-nums text-[#b8b1a4] hud-text-shadow">
                {hud.wardenHp}/{hud.wardenMaxHp}
              </span>
            </div>
          </div>
        )}

        {hud.activeBanner && (
          <div className="px-7 py-2 pbz-ink-ribbon text-center">
            <div className="font-display text-xs font-semibold tracking-[0.28em] text-[#f2eee6] hud-text-shadow">
              {hud.activeBanner.title}
            </div>
            <div className="h-px w-32 mx-auto my-1 bg-gradient-to-r from-transparent via-[#d69b27]/70 to-transparent" />
            <div className="font-serif-editorial text-sm italic text-[#cfc9bd] hud-text-shadow">
              {hud.activeBanner.subtitle}
            </div>
          </div>
        )}
      </div>

      {/* TOP-RIGHT: Minimal Obsidian/Steel Utility Buttons + Ink-Wash Compass Minimap */}
      <div className="absolute top-5 right-7 flex flex-col items-end gap-2.5">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title={muted ? 'Unmute [M]' : 'Mute [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-9 h-9 flex items-center justify-center bg-[#0c0d10]/85 hover:bg-[#1b1719] border border-[#656057]/80 hover:border-[#c92831] text-[#dcd7cd] transition-colors cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M19 5a9 9 0 0 1 0 14" />
              </svg>
            )}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause game (P)"
            title="Pause [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPauseToggle();
            }}
            className="w-9 h-9 flex items-center justify-center bg-[#0c0d10]/85 hover:bg-[#1b1719] border border-[#656057]/80 hover:border-[#c92831] text-[#dcd7cd] transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6.5" y="5" width="3.5" height="14" />
              <rect x="14" y="5" width="3.5" height="14" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart level (R)"
            title="Restart [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-9 h-9 flex items-center justify-center bg-[#0c0d10]/85 hover:bg-[#1b1719] border border-[#656057]/80 hover:border-[#c92831] text-[#dcd7cd] transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
        <Minimap hud={hud} />
      </div>

      {/* BOTTOM-LEFT: Phantom Blade Zero Diamond Emblem + Tapered Bone-White Vitality & Amber Sha-Chi Bars */}
      <div className="absolute bottom-7 left-8 flex items-end gap-3">
        {/* Stacked Twin Obsidian Diamonds (Secondary Waystone Counter + Primary Vitality Crest) */}
        <div className="relative w-[58px] h-[64px] shrink-0">
          {/* Secondary upper-left small diamond showing Waystone attunement */}
          <div
            className="absolute -top-3.5 -left-2.5 w-[26px] h-[26px] rotate-45 bg-[#0b0c0f]/90 border border-[#6e695f]/85 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
            title={`Waystones Attuned: ${hud.obelisksAttuned}/${hud.obelisksTotal}`}
          >
            <span className="-rotate-45 font-ui text-[9px] font-bold tabular-nums text-[#dfaa38]">
              {hud.obelisksAttuned}/{hud.obelisksTotal}
            </span>
          </div>

          {/* Primary 45°-rotated Sentinel Obsidian Diamond Emblem */}
          <div className="absolute bottom-1 left-2 w-[44px] h-[44px] rotate-45 bg-[#0c0d10]/92 border border-[#8e887d]/90 shadow-[0_6px_18px_rgba(0,0,0,0.85)] flex items-center justify-center">
            <div className="w-[36px] h-[36px] border border-[#4a463f]/80 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="-rotate-45 w-5 h-5" aria-hidden="true">
                {/* Stylized Sentinel Blade-Seal Emblem */}
                <path
                  d="M12 3 L15 9 L12 20 L9 9 Z"
                  fill={isCriticalHp ? '#c92831' : '#e6e2da'}
                  stroke="#08090b"
                  strokeWidth="1"
                />
                <path
                  d="M7 10 H17"
                  stroke="#d69b27"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Tapered Blade-Edge Bars extending right from the Diamond */}
        <div className="flex flex-col pb-2 w-[260px] sm:w-[300px]">
          {/* Subtle numeric vitality readout tucked cleanly above the blade bar */}
          <div className="flex items-baseline justify-between mb-1 pr-3">
            <span
              className="font-ui text-xs font-semibold tabular-nums tracking-wider text-[#ece8df] hud-text-shadow"
              data-testid="hud-hp"
            >
              {hud.hp}
              <span className="text-[#969086] font-normal">/{hud.maxHp}</span>
            </span>
            <span className="font-ui text-[10px] font-medium tracking-[0.16em] text-[#c79e46] tabular-nums hud-text-shadow">
              RESONANCE {resonancePct}%
            </span>
          </div>

          {/* Primary Bone-White Health Bar with Crimson Trailing Ghost */}
          <div className="relative h-[10px] w-full bg-[#090a0c]/92 border border-[#746e65]/90 pbz-bar-blade shadow-[0_4px_14px_rgba(0,0,0,0.85)] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#a81d25] transition-all duration-300"
              style={{ width: `${ghostPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 transition-all duration-100"
              style={{
                width: `${hpPct}%`,
                background: isCriticalHp
                  ? 'linear-gradient(90deg, #a61c24 0%, #db3740 100%)'
                  : 'linear-gradient(90deg, #cfcac0 0%, #f1ede4 55%, #dbd5ca 100%)',
              }}
            />
          </div>

          {/* Tucked Secondary Burnished Amber-Gold Focus / Readiness Bar */}
          <div className="relative h-[5px] w-[62%] mt-[4px] bg-[#090a0c]/90 border border-[#5e5645]/85 pbz-bar-blade shadow-[0_3px_10px_rgba(0,0,0,0.75)] overflow-hidden">
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${resonancePct}%`,
                background: 'linear-gradient(90deg, #9c6210 0%, #df9d25 65%, #f0bd52 100%)',
              }}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: Phantom Blade Zero Interlocking Rotated Diamond Martial Arts & Blade Slots */}
      <div className="absolute bottom-6 right-8 flex items-end gap-3 pointer-events-auto">
        {/* Basic Attack Diamond Slot */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative w-[56px] h-[56px] flex items-center justify-center">
            <button
              type="button"
              tabIndex={-1}
              aria-label="Runeblade Strike (Space)"
              onClick={(e) => {
                e.currentTarget.blur();
                onBasicAttack();
              }}
              className="group relative w-[42px] h-[42px] rotate-45 bg-[#0c0d10]/90 hover:bg-[#1a1416] border border-[#7c766b]/90 hover:border-[#d69b27] shadow-[0_6px_18px_rgba(0,0,0,0.85)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <span className="w-[34px] h-[34px] border border-[#3e3b36]/80 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="-rotate-45 w-4 h-4" aria-hidden="true">
                  <path
                    d="M5 19 L18 6 M14 5 L19 5 L19 10"
                    stroke="#ece8df"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              </span>
            </button>
            <span className="font-ui pointer-events-none absolute -bottom-0.5 -left-1 px-1 py-[1px] bg-[#ece8df] text-[#0c0d10] text-[9px] font-bold leading-none tracking-tight shadow-sm">
              SPC
            </span>
          </div>
          <span className="font-ui text-[10px] font-medium tracking-wider text-[#b7b1a6] hud-text-shadow whitespace-nowrap">
            Strike
          </span>
        </div>

        <div className="w-px h-10 mb-5 bg-gradient-to-b from-transparent via-[#6c675e]/70 to-transparent" />

        {/* 4 Core Martial / Arcane Arts in Interlocking Diamond Frames */}
        {ABILITIES.map((ab) => {
          const cd = hud.cooldowns[ab.id];
          const ready = cd <= 0.05;
          const cdPct = Math.min(100, (cd / ab.cooldown) * 100);
          return (
            <div key={ab.id} className="flex flex-col items-center gap-1.5">
              <div className="relative w-[60px] h-[60px] flex items-center justify-center">
                <button
                  type="button"
                  tabIndex={-1}
                  disabled={!ready}
                  aria-label={`${ab.name} (${ab.key}) — ${ab.role}`}
                  data-testid={`ability-${ab.id}`}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCastAbility(ab.id);
                  }}
                  className={`group relative w-[44px] h-[44px] rotate-45 border shadow-[0_6px_18px_rgba(0,0,0,0.88)] flex items-center justify-center overflow-hidden transition-colors ${
                    ready
                      ? 'bg-[#0c0d10]/92 hover:bg-[#1e1215] border-[#968f83] hover:border-[#c92831] cursor-pointer'
                      : 'bg-[#08090b]/90 border-[#43403b] cursor-not-allowed'
                  }`}
                >
                  {/* Subtle inner steel diamond bevel */}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-[3px] border ${
                      ready
                        ? 'border-[#5a554c]/75 group-hover:border-[#d69b27]/75'
                        : 'border-[#2b2926]/70'
                    }`}
                  />

                  {/* Cooldown dark ink sweep */}
                  {!ready && (
                    <div
                      className="absolute inset-0 bg-[#050507]/75 pointer-events-none origin-bottom"
                      style={{ transform: `scaleY(${cdPct / 100})` }}
                    />
                  )}

                  {/* Upright Ability Icon */}
                  <div className={`-rotate-45 relative z-10 ${ready ? 'opacity-100' : 'opacity-35'}`}>
                    <AbilityIcon id={ab.id} ready={ready} />
                  </div>
                </button>

                {/* Crisp PBZ-style Square Keycap Pip at Bottom-Left of Diamond */}
                <span
                  className={`font-ui pointer-events-none absolute bottom-0 left-0 w-[17px] h-[17px] flex items-center justify-center text-[10px] font-bold leading-none shadow-sm ${
                    ready
                      ? 'bg-[#e6e2da] text-[#0c0d10]'
                      : 'bg-[#2a2927] text-[#8a857c] border border-[#4a4741]'
                  }`}
                >
                  {ab.key}
                </span>

                {/* Upright Tabular Cooldown Seconds */}
                {!ready && (
                  <span className="font-ui tabular-nums pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-[#f2eee6] hud-stroke">
                    {cd.toFixed(1)}
                  </span>
                )}
              </div>

              <span
                className={`font-ui text-[10px] font-medium tracking-wider hud-text-shadow whitespace-nowrap ${
                  ready ? 'text-[#ece8df]' : 'text-[#b5afa3]'
                }`}
              >
                {ab.name.replace('Runic ', '').replace('Phase ', '').replace('Rune ', '').replace('Skyward ', '')}
              </span>
            </div>
          );
        })}
      </div>

      {/* PAUSE MODAL — Phantom Blade Zero Bonfire Ink-Brush Menu */}
      {hud.phase === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#060709]/76 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Game Paused"
            className="w-full max-w-sm mx-4 px-8 py-9 bg-[#0b0c0f]/96 border border-[#5d5850]/80 shadow-[0_24px_64px_rgba(0,0,0,0.92)] text-center"
          >
            <div className="font-display text-2xl font-semibold tracking-[0.28em] text-[#f0ece3]">
              PAUSED
            </div>
            <div className="h-px w-28 mx-auto my-2.5 bg-gradient-to-r from-transparent via-[#c92831]/80 to-transparent" />
            <p className="font-serif-editorial text-sm italic text-[#aba498]">
              Act I · Sunken Sanctum
            </p>

            {/* Unboxed hairline-divided run telemetry */}
            <div className="flex items-center justify-center gap-6 my-6 py-3 border-y border-[#383531] font-ui tabular-nums">
              <div>
                <div className="text-[10px] tracking-[0.18em] text-[#8b857b]">WAYSTONES</div>
                <div className="text-lg font-semibold text-[#dfaa38] mt-0.5">
                  {hud.obelisksAttuned}/{hud.obelisksTotal}
                </div>
              </div>
              <div className="w-px h-8 bg-[#383531]" />
              <div>
                <div className="text-[10px] tracking-[0.18em] text-[#8b857b]">SLAIN</div>
                <div className="text-lg font-semibold text-[#ece8df] mt-0.5">{hud.kills}</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onPauseToggle}
                className="group relative flex items-center justify-center gap-3 w-full py-3 pbz-ink-ribbon-crimson hover:brightness-110 text-[#f5f1e9] font-display font-semibold tracking-[0.22em] text-sm cursor-pointer transition-all"
              >
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rotate-45 bg-[#e03842] border border-[#f5dede]/70"
                />
                <span>RESUME</span>
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 pbz-ink-ribbon hover:pbz-ink-ribbon-crimson text-[#d6d0c4] hover:text-white font-display font-medium tracking-[0.18em] text-xs cursor-pointer transition-colors"
              >
                RESTART LEVEL
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 bg-transparent hover:pbz-ink-ribbon text-[#9d968a] hover:text-[#ece8df] font-display font-medium tracking-[0.18em] text-xs cursor-pointer transition-colors"
              >
                RETURN TO TITLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY OR DEFEAT MODAL — Inspired by Phantom Blade Zero Crimson Ink-Splatter End Screen */}
      {(hud.phase === 'victory' || hud.phase === 'defeat') && runSummary && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#050608]/84 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={runSummary.victory ? 'Sanctum Cleared' : 'Fallen in the Ruins'}
            className="w-full max-w-md mx-4 px-9 py-10 bg-[#0a0b0e]/96 border border-[#5a554c]/75 shadow-[0_26px_72px_rgba(0,0,0,0.95)] text-center"
          >
            {/* Ink-wash calligraphic crest emblem */}
            <svg
              viewBox="0 0 120 56"
              className="w-28 h-14 mx-auto mb-3 overflow-visible"
              aria-hidden="true"
            >
              {runSummary.victory ? (
                <>
                  <path
                    d="M12 28 Q60 10 108 28 Q60 46 12 28 Z"
                    fill="#d69b27"
                    fillOpacity="0.16"
                  />
                  <polygon
                    points="60,6 72,28 60,50 48,28"
                    fill="none"
                    stroke="#dfaa38"
                    strokeWidth="1.6"
                  />
                  <polygon points="60,14 66,28 60,42 54,28" fill="#ece8df" />
                </>
              ) : (
                <>
                  {/* Crimson ink splatter motif inspired by PBZ Game Over */}
                  <circle cx="58" cy="28" r="18" fill="#9e161d" fillOpacity="0.34" />
                  <circle cx="76" cy="22" r="7" fill="#b81b23" fillOpacity="0.48" />
                  <circle cx="40" cy="36" r="5" fill="#8f1318" fillOpacity="0.52" />
                  <path
                    d="M36 44 L84 12 M44 12 L76 44"
                    stroke="#d92b34"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                </>
              )}
            </svg>

            <div
              className="font-ui text-[11px] font-semibold tracking-[0.32em]"
              style={{ color: runSummary.victory ? '#dfaa38' : '#c92e36' }}
            >
              {runSummary.victory ? 'ACT I COMPLETE' : 'DEAD'}
            </div>
            <h2 className="font-display text-3xl font-semibold tracking-[0.18em] text-[#f2eee6] mt-1.5">
              {runSummary.victory ? 'SANCTUM UNSEALED' : 'FALLEN IN BATTLE'}
            </h2>
            <p className="font-serif-editorial text-base italic text-[#b3aca0] mt-2">
              {runSummary.victory
                ? 'The Overgrown Rift yields to steel and resolve.'
                : 'Your blade falls silent among the moss. Rise once more.'}
            </p>

            {/* Unboxed hairline-separated run summary */}
            <div className="grid grid-cols-3 gap-4 my-7 py-4 border-y border-[#36332e] font-ui tabular-nums">
              <div>
                <div className="text-[10px] tracking-[0.18em] text-[#8a847a]">TIME</div>
                <div className="text-lg font-semibold text-[#ece8df] mt-0.5">
                  {formatTime(runSummary.elapsedTime)}
                </div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.18em] text-[#8a847a]">SCORE</div>
                <div className="text-lg font-semibold text-[#dfaa38] mt-0.5">{runSummary.score}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-[0.18em] text-[#8a847a]">
                  {runSummary.victory ? 'DAMAGE' : 'WAYSTONES'}
                </div>
                <div className="text-lg font-semibold text-[#ece8df] mt-0.5">
                  {runSummary.victory
                    ? runSummary.damageTaken
                    : `${runSummary.obelisksAttuned}/${runSummary.obelisksTotal}`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="flex-1 flex items-center justify-center gap-2.5 py-3 pbz-ink-ribbon-crimson hover:brightness-110 text-[#f5f1e9] font-display font-semibold tracking-[0.22em] text-sm cursor-pointer transition-all"
              >
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rotate-45 bg-[#e03842] border border-[#f5dede]/70"
                />
                <span>{runSummary.victory ? 'PLAY AGAIN' : 'TRY AGAIN'}</span>
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="px-6 py-3 pbz-ink-ribbon hover:pbz-ink-ribbon-crimson text-[#cbc5b8] hover:text-white font-display font-medium tracking-[0.18em] text-xs cursor-pointer transition-colors"
              >
                TITLE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
