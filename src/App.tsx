import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { TitleScreen } from './components/TitleScreen';
import { FloatingCombatTextItem, SanctumGameEngine } from './game/engine';
import { AbilityId, HudSnapshot, RunSummary } from './game/types';

function phaseToBodyState(phase: HudSnapshot['phase']): string {
  if (phase === 'victory' || phase === 'defeat') return 'gameover';
  return phase;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SanctumGameEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingCombatTextItem[]>([]);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [muted, setMuted] = useState(false);

  const handleStart = useCallback(() => {
    setRunSummary(null);
    setFloatingTexts([]);
    document.body.dataset.state = 'playing';
    engineRef.current?.startGame();
  }, []);

  const handleRestart = useCallback(() => {
    setRunSummary(null);
    setFloatingTexts([]);
    document.body.dataset.state = 'playing';
    engineRef.current?.restartGame();
  }, []);

  const handleReturnTitle = useCallback(() => {
    setRunSummary(null);
    setFloatingTexts([]);
    document.body.dataset.state = 'title';
    engineRef.current?.returnToTitle();
  }, []);

  const handlePauseToggle = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.sim.phase === 'playing') {
      engine.setPaused(true);
    } else if (engine.sim.phase === 'paused') {
      engine.setPaused(false);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const isNowMuted = engine.toggleMute();
    setMuted(isNowMuted);
  }, []);

  const handleCastAbility = useCallback((id: AbilityId) => {
    engineRef.current?.castAbilityFromHud(id);
  }, []);

  const handleBasicAttack = useCallback(() => {
    engineRef.current?.triggerBasicAttackFromHud();
  }, []);

  // Mount Three.js engine once inside isolated container ref
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const timers: number[] = [];

    const engine = new SanctumGameEngine(mountEl, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
        document.body.dataset.state = phaseToBodyState(snapshot.phase);
      },
      onFloatingText: (item) => {
        setFloatingTexts((prev) => [...prev.slice(-14), item]);
        const tid = window.setTimeout(() => {
          setFloatingTexts((prev) => prev.filter((x) => x.id !== item.id));
        }, 950);
        timers.push(tid);
      },
      onRunComplete: (summary) => {
        setRunSummary(summary);
      },
    });

    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      document.body.dataset.state = 'playing';
      engine.startGame();
    } else {
      document.body.dataset.state = 'title';
    }

    return () => {
      for (const t of timers) clearTimeout(t);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Global game shell keyboard shortcuts (Enter/Space on Title, Esc/P Pause, M Mute, R Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || e.repeat) return;

      const phase = engine.sim.phase;
      if (phase === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStart();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phase === 'playing' || phase === 'paused') {
          e.preventDefault();
          handlePauseToggle();
        }
        return;
      }

      if (e.code === 'KeyM') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.code === 'KeyR' && (phase === 'playing' || phase === 'paused')) {
        e.preventDefault();
        handleRestart();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePauseToggle, handleRestart, handleStart, handleToggleMute]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0d161d]">
      {/* Isolated WebGL mount container — never re-rendered by HUD state changes */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {hud && hud.phase === 'title' && <TitleScreen onStart={handleStart} />}

      {hud && hud.phase !== 'title' && (
        <GameHud
          hud={hud}
          floatingTexts={floatingTexts}
          runSummary={runSummary}
          muted={muted}
          onCastAbility={handleCastAbility}
          onBasicAttack={handleBasicAttack}
          onToggleMute={handleToggleMute}
          onPauseToggle={handlePauseToggle}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </div>
  );
}
