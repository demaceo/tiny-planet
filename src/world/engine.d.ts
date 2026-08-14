export type Dir = 'f' | 'b' | 'l' | 'r';

export interface WorldOptions {
  /** Cosmetic planet curvature. 0 = flat world. Default 0.0016. */
  curvature?: number;
  /** Time of day, 0..1 (dawn·noon·dusk·night). Default 0.5. */
  timeOfDay?: number;
  /** Third-person camera distance. Default 12. */
  cameraDistance?: number;
  /** Force-disable ambient motion (cloud drift, camera bob). Defaults to the OS setting. */
  reducedMotion?: boolean;
}

export interface WorldHandle {
  setCurvature(value: number): void;
  setTimeOfDay(value: number): void;
  setCameraDistance(value: number): void;
  setAutoWander(on: boolean): void;
  press(dir: Dir, down: boolean): void;
  /** Stop the render loop, remove listeners, free GPU resources, and detach the canvas. */
  dispose(): void;
}

export function createWorld(container: HTMLElement, options?: WorldOptions): WorldHandle;
export function phaseLabel(timeOfDay: number): 'Dawn' | 'Day' | 'Dusk' | 'Night';
