import { useCallback, useEffect, useRef, useState } from 'react';
import { TinyPlanet } from './components/TinyPlanet';
import { Overlay } from './components/Overlay';
import { ControlPanel } from './components/ControlPanel';
import { Dpad } from './components/Dpad';
import type { Dir, WorldHandle } from './world/engine';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The load-in "sunrise": ease the day from dawn up to noon.
const INTRO_FROM = 0.3;
const INTRO_TO = 0.5;
const INTRO_MS = 4200;

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export default function App() {
  const reduced = prefersReducedMotion();
  const handleRef = useRef<WorldHandle | null>(null);

  const [curvature, setCurvature] = useState(0.0016);
  const [timeOfDay, setTimeOfDay] = useState(reduced ? INTRO_TO : INTRO_FROM);
  const [cameraDistance, setCameraDistance] = useState(12);
  const [autoWander, setAutoWander] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  // Each control updates React state (for the readouts/slider) and the engine.
  const onCurvature = useCallback((v: number) => {
    setCurvature(v);
    handleRef.current?.setCurvature(v);
  }, []);
  const onTime = useCallback((v: number) => {
    setTimeOfDay(v);
    handleRef.current?.setTimeOfDay(v);
  }, []);
  const onDistance = useCallback((v: number) => {
    setCameraDistance(v);
    handleRef.current?.setCameraDistance(v);
  }, []);
  const onWander = useCallback((v: boolean) => {
    setAutoWander(v);
    handleRef.current?.setAutoWander(v);
  }, []);
  const onPress = useCallback((dir: Dir, down: boolean) => {
    handleRef.current?.press(dir, down);
  }, []);

  // Sunrise on load (child effects run first, so the handle is ready here).
  useEffect(() => {
    if (reduced) {
      handleRef.current?.setTimeOfDay(INTRO_TO);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / INTRO_MS);
      const v = INTRO_FROM + (INTRO_TO - INTRO_FROM) * easeInOut(p);
      setTimeOfDay(v);
      handleRef.current?.setTimeOfDay(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  // Hide the hint after the first interaction.
  useEffect(() => {
    const hide = () => setHintVisible(false);
    window.addEventListener('pointerdown', hide, { once: true });
    window.addEventListener('keydown', hide, { once: true });
    return () => {
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('keydown', hide);
    };
  }, []);

  return (
    <>
      <TinyPlanet
        handleRef={handleRef}
        initialOptions={{
          curvature,
          timeOfDay: reduced ? INTRO_TO : INTRO_FROM,
          cameraDistance,
          reducedMotion: reduced,
        }}
      />

      <div className="tp-overlay">
        <Overlay hintVisible={hintVisible} />
        <ControlPanel
          open={panelOpen}
          onToggle={() => setPanelOpen((o) => !o)}
          curvature={curvature}
          onCurvature={onCurvature}
          timeOfDay={timeOfDay}
          onTime={onTime}
          cameraDistance={cameraDistance}
          onDistance={onDistance}
          autoWander={autoWander}
          onWander={onWander}
        />
        <Dpad onPress={onPress} />
      </div>
    </>
  );
}
