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

function AbilityIcon({ id }: { id: AbilityId }) {
  if (id === 'cleave') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
        <path
          d="M4 18 C8 6, 17 4, 21 6 C17 9, 13 13, 10 20 Z"
          fill="#4ef2ff"
          stroke="#061217"
          strokeWidth="1.6"
        />
        <path d="M3 20 L9 14" stroke="#d9c08a" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'dash') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
        <path
          d="M3 12 H15 M11 6 L19 12 L11 18"
          fill="none"
          stroke="#63ffd1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 8 H10 M4 16 H10"
          stroke="#98ffe2"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeOpacity="0.7"
        />
      </svg>
    );
  }
  if (id === 'sigil') {
    return (
      <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="#38e8ff" strokeWidth="1.8" />
        <polygon
          points="12,5 18,16 6,16"
          fill="none"
          stroke="#a6f9ff"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="2.2" fill="#63ffd1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="9.5" y="2" width="5" height="16" rx="1" fill="#8df8ff" stroke="#061217" strokeWidth="1.3" />
      <ellipse cx="12" cy="19.5" rx="7.5" ry="2.6" fill="none" stroke="#47efff" strokeWidth="1.8" />
      <line x1="12" y1="2" x2="12" y2="18" stroke="#ffffff" strokeWidth="1.4" />
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
  // Trailing damage ghost bar tracks previous higher HP for visceral damage feedback
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

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Subtle critical low-HP peripheral vignette */}
      {isCriticalHp && (
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0) 56%, rgba(168, 22, 38, 0.36) 100%)',
          }}
        />
      )}

      {/* Floating Screen-Projected Combat Feedback */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {floatingTexts.map((ft) => {
          const colorClass =
            ft.kind === 'crit'
              ? 'text-[#7bfaff] text-xl font-extrabold'
              : ft.kind === 'heal'
                ? 'text-[#66ffb8] text-base font-bold'
                : ft.kind === 'player_hurt'
                  ? 'text-[#ff596c] text-lg font-extrabold'
                  : ft.kind === 'milestone'
                    ? 'text-[#ffe69c] text-sm font-bold tracking-widest'
                    : 'text-[#f2f7f5] text-base font-bold';
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

      {/* TOP-LEFT CLUSTER: Carved Vitality Gauge & Level Objective */}
      <div className="absolute top-4 left-4 flex flex-col gap-2.5 max-w-[310px]">
        {/* Health & Score Plate */}
        <div
          className="px-3.5 py-2.5 bg-[#0c171e]/92 border border-[#726348]/80 shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
          style={{ clipPath: 'polygon(0 0, 100% 0, 97% 100%, 0 100%)' }}
        >
          <div className="flex items-baseline justify-between gap-4 mb-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-ui text-[10px] font-bold tracking-[0.2em] uppercase text-[#8ea9a6]">
                VITALITY
              </span>
              <span
                className="font-ui text-lg font-extrabold tabular-nums text-[#eef9f7] hud-text-shadow"
                data-testid="hud-hp"
              >
                {hud.hp}
                <span className="text-xs font-semibold text-[#87a2a0]">/{hud.maxHp}</span>
              </span>
            </div>
            <div className="flex items-baseline gap-3 font-ui text-xs tabular-nums">
              <span className="text-[#9cb6b4]">
                SLAIN <strong className="text-[#e7f4f2]">{hud.kills}</strong>
              </span>
              <span className="text-[#9cb6b4]">
                SCORE <strong className="text-[#69f2ff]">{hud.score}</strong>
              </span>
            </div>
          </div>

          {/* Continuous Health Bar with Delayed Trailing Damage Ghost */}
          <div className="relative h-3 w-full bg-[#070f14] border border-[#4f4634] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#f2b35e] transition-all duration-300"
              style={{ width: `${ghostPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-[#25b58a] transition-all duration-100"
              style={{
                width: `${hpPct}%`,
                backgroundColor: hpPct <= 34 ? '#d93d4d' : hpPct <= 60 ? '#c99738' : '#26b88e',
              }}
            />
          </div>
        </div>

        {/* Compact Level Objective Card */}
        <div className="px-3.5 py-2 bg-[#0c171e]/88 border-l-2 border-[#42e6ff] shadow-[0_4px_14px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-ui text-[10px] font-bold tracking-[0.2em] uppercase text-[#5eeeff]">
              OBJECTIVE
            </span>
            <span className="font-ui text-[11px] font-semibold tabular-nums text-[#a4bdb9]">
              {formatTime(hud.elapsedTime)}
            </span>
          </div>
          <div
            className="text-sm font-bold tracking-wide text-[#eaf5f3] mt-0.5 hud-text-shadow"
            data-testid="hud-objective"
          >
            {hud.objectiveTitle}
          </div>
          <p className="font-ui text-[11px] text-[#9eb5b3] leading-snug mt-0.5">
            {hud.objectiveDetail}
          </p>
        </div>
      </div>

      {/* TOP-CENTER: Boss Health Bar or Key Milestone Banner (only when active) */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-md w-[90vw]">
        {hud.wardenHp !== null && hud.wardenMaxHp !== null && (
          <div className="w-full max-w-sm px-4 py-2 bg-[#140e15]/92 border border-[#b3425c]/80 shadow-[0_6px_20px_rgba(0,0,0,0.65)]">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#ff8aa1]">
                SANCTUM WARDEN
              </span>
              <span className="font-ui text-xs font-bold tabular-nums text-[#ffd5de]">
                {hud.wardenHp} / {hud.wardenMaxHp}
              </span>
            </div>
            <div className="h-2.5 w-full bg-[#090609] border border-[#6e2b3b]">
              <div
                className="h-full bg-[#e33258] transition-all duration-100"
                style={{ width: `${Math.max(0, (hud.wardenHp / hud.wardenMaxHp) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {hud.activeBanner && (
          <div className="px-4 py-1.5 bg-[#0a161d]/88 border-y border-[#4ceeff]/65 text-center shadow-[0_6px_18px_rgba(0,0,0,0.6)]">
            <div className="text-[11px] font-bold tracking-[0.24em] uppercase text-[#74f8ff] hud-text-shadow">
              {hud.activeBanner.title}
            </div>
            <div className="font-ui text-[10px] text-[#bfd4d2]">
              {hud.activeBanner.subtitle}
            </div>
          </div>
        )}
      </div>

      {/* TOP-RIGHT CLUSTER: Utility Controls + Minimap */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
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
            className="w-9 h-9 flex items-center justify-center bg-[#0d1920]/92 hover:bg-[#162b36] border border-[#6e5e44]/80 text-[#c9dfdc] cursor-pointer"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
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
            className="w-9 h-9 flex items-center justify-center bg-[#0d1920]/92 hover:bg-[#162b36] border border-[#6e5e44]/80 text-[#c9dfdc] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
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
            className="w-9 h-9 flex items-center justify-center bg-[#0d1920]/92 hover:bg-[#162b36] border border-[#6e5e44]/80 text-[#c9dfdc] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
        <Minimap hud={hud} />
      </div>

      {/* BOTTOM-CENTER: Ability Hotbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-2 pointer-events-auto px-3 py-2 bg-[#0b151c]/92 border border-[#726348]/85 shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
        {/* Basic Attack Slot */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Runeblade Strike (Space)"
          onClick={(e) => {
            e.currentTarget.blur();
            onBasicAttack();
          }}
          className="relative flex flex-col items-center justify-center w-[72px] h-[68px] bg-[#102029] hover:bg-[#17303d] border border-[#5d523d] text-left cursor-pointer transition-colors"
        >
          <span className="font-ui absolute top-1 left-1.5 text-[9px] font-bold text-[#9ab4b2]">
            SPC
          </span>
          <svg viewBox="0 0 24 24" className="w-5 h-5 mt-1" aria-hidden="true">
            <path
              d="M5 19 L18 6 M14 5 L19 5 L19 10"
              stroke="#c9f7ff"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <span className="font-ui text-[10px] font-bold text-[#dcebe9] mt-1">Strike</span>
        </button>

        <div className="w-px h-12 bg-[#4a4131] self-center" />

        {/* 4 Core Arcane Abilities */}
        {ABILITIES.map((ab) => {
          const cd = hud.cooldowns[ab.id];
          const ready = cd <= 0.05;
          const cdPct = Math.min(100, (cd / ab.cooldown) * 100);
          return (
            <button
              key={ab.id}
              type="button"
              tabIndex={-1}
              disabled={!ready}
              aria-label={`${ab.name} (${ab.key}) — ${ab.role}`}
              data-testid={`ability-${ab.id}`}
              onClick={(e) => {
                e.currentTarget.blur();
                onCastAbility(ab.id);
              }}
              className={`relative flex flex-col items-center justify-center w-[92px] h-[68px] border transition-colors overflow-hidden ${
                ready
                  ? 'bg-[#102530] hover:bg-[#183847] border-[#45d9ed]/75 cursor-pointer'
                  : 'bg-[#0b141a] border-[#3d464a] cursor-not-allowed'
              }`}
            >
              {/* Cooldown vertical sweep overlay */}
              {!ready && (
                <div
                  className="absolute inset-x-0 bottom-0 bg-[#040a0e]/80 pointer-events-none"
                  style={{ height: `${cdPct}%` }}
                />
              )}

              <span className="font-ui absolute top-1 left-1.5 px-1 text-[10px] font-extrabold bg-[#071117] text-[#6bf4ff] border border-[#3d6b75]">
                {ab.key}
              </span>

              <div className={`mt-1 ${ready ? 'opacity-100' : 'opacity-40'}`}>
                <AbilityIcon id={ab.id} />
              </div>

              <span className="font-ui text-[10px] font-bold text-[#e6f5f3] leading-tight mt-0.5">
                {ab.name}
              </span>
              <span className="font-ui text-[9px] text-[#8fa9a8] leading-tight">{ab.role}</span>

              {!ready && (
                <span className="font-ui tabular-nums absolute inset-0 flex items-center justify-center text-base font-extrabold text-[#dffbff] hud-stroke">
                  {cd.toFixed(1)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* PAUSE MODAL */}
      {hud.phase === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#060d12]/72 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Game Paused"
            className="w-full max-w-sm mx-4 p-7 bg-[#0e1b23] border-2 border-[#78684c] shadow-[0_18px_48px_rgba(0,0,0,0.8)] text-center"
          >
            <h2 className="text-2xl font-bold tracking-[0.22em] text-[#eef8f7]">PAUSED</h2>
            <p className="font-ui text-xs text-[#93aeac] mt-1.5">
              Level I · Sunken Sanctum
            </p>
            <div className="grid grid-cols-2 gap-2.5 my-5 font-ui tabular-nums">
              <div className="p-2.5 bg-[#091319] border border-[#394b52]">
                <div className="text-[10px] uppercase tracking-wider text-[#7f9d9b]">Waystones</div>
                <div className="text-lg font-bold text-[#5ef4ff]">
                  {hud.obelisksAttuned}/{hud.obelisksTotal}
                </div>
              </div>
              <div className="p-2.5 bg-[#091319] border border-[#394b52]">
                <div className="text-[10px] uppercase tracking-wider text-[#7f9d9b]">Enemies Slain</div>
                <div className="text-lg font-bold text-[#eaf5f3]">{hud.kills}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onPauseToggle}
                className="w-full py-3 bg-[#153b47] hover:bg-[#1d4f5e] border border-[#54ecff] text-[#ebfcff] font-bold tracking-[0.18em] uppercase text-sm cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 bg-[#12222c] hover:bg-[#1a303d] border border-[#6e5f45] text-[#d5e6e4] font-semibold tracking-[0.15em] uppercase text-xs cursor-pointer"
              >
                Restart Level
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="w-full py-2.5 bg-transparent hover:bg-[#12222c] border border-[#3c4d52] text-[#9ab5b3] font-semibold tracking-[0.15em] uppercase text-xs cursor-pointer"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VICTORY OR DEFEAT MODAL */}
      {(hud.phase === 'victory' || hud.phase === 'defeat') && runSummary && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#060d12]/78 pointer-events-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={runSummary.victory ? 'Sanctum Cleared' : 'Fallen in the Ruins'}
            className="w-full max-w-md mx-4 p-8 bg-[#0e1b23] border-2 shadow-[0_20px_54px_rgba(0,0,0,0.85)] text-center"
            style={{ borderColor: runSummary.victory ? '#4ceeff' : '#b84255' }}
          >
            <div
              className="font-ui text-[11px] font-bold tracking-[0.26em] uppercase"
              style={{ color: runSummary.victory ? '#65f5ff' : '#ff7b8f' }}
            >
              {runSummary.victory ? 'LEVEL I COMPLETE' : 'DEFEATED'}
            </div>
            <h2 className="text-3xl font-bold tracking-[0.14em] text-[#f0faf8] mt-1.5">
              {runSummary.victory ? 'SANCTUM UNSEALED' : 'FALLEN IN THE RUINS'}
            </h2>
            <p className="font-ui text-xs text-[#9cb8b6] mt-2">
              {runSummary.victory
                ? 'The Overgrown Rift is stabilized and the ancient portal yields to your Runeblade.'
                : 'The ruins claim another sentinel. Rise again to attune the Waystones.'}
            </p>

            <div className="grid grid-cols-3 gap-2.5 my-6 font-ui tabular-nums">
              <div className="p-3 bg-[#091319] border border-[#36484f]">
                <div className="text-[10px] uppercase tracking-wider text-[#7f9d9b]">Time</div>
                <div className="text-lg font-bold text-[#eaf6f4]">
                  {formatTime(runSummary.elapsedTime)}
                </div>
              </div>
              <div className="p-3 bg-[#091319] border border-[#36484f]">
                <div className="text-[10px] uppercase tracking-wider text-[#7f9d9b]">Score</div>
                <div className="text-lg font-bold text-[#65f5ff]">{runSummary.score}</div>
              </div>
              <div className="p-3 bg-[#091319] border border-[#36484f]">
                <div className="text-[10px] uppercase tracking-wider text-[#7f9d9b]">
                  {runSummary.victory ? 'Damage Taken' : 'Waystones'}
                </div>
                <div className="text-lg font-bold text-[#eaf6f4]">
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
                className="flex-1 py-3 bg-[#153b47] hover:bg-[#1d4f5e] border border-[#54ecff] text-[#ebfcff] font-bold tracking-[0.18em] uppercase text-sm cursor-pointer"
              >
                {runSummary.victory ? 'Play Again' : 'Try Again'}
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="px-5 py-3 bg-[#101f29] hover:bg-[#182e3b] border border-[#5a4e3a] text-[#bfd3d1] font-semibold tracking-[0.14em] uppercase text-xs cursor-pointer"
              >
                Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
