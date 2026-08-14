import { useEffect, useRef, type MutableRefObject } from 'react';
import { createWorld, type WorldHandle, type WorldOptions } from '../world/engine';

type Props = {
  /** Filled with the engine handle once mounted so parent controls can drive it. */
  handleRef: MutableRefObject<WorldHandle | null>;
  /** Read once, at mount. Live updates go through the handle, not re-renders. */
  initialOptions?: WorldOptions;
};

export function TinyPlanet({ handleRef, initialOptions }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  // keep the latest options without making them an effect dependency
  const optionsRef = useRef(initialOptions);
  optionsRef.current = initialOptions;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const handle = createWorld(el, optionsRef.current);
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // mount once; the engine is driven imperatively afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="tp-mount" ref={mountRef} />;
}
