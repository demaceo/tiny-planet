# Tiny Planet

A curved, hand-built "tiny planet" world that runs in the browser — soft cel-shaded
props, a day/night cycle, and a walkable village street — rendered with
[Three.js](https://threejs.org) and wrapped in React + Vite + TypeScript.

The world looks spherical but is actually flat: a single vertex-shader trick lowers
every vertex by the square of its distance from the player, so the horizon curls away
in every direction. All game logic stays on plain 2D coordinates.

## Quick start

```bash
npm install
npm run dev      # start the dev server (prints a localhost URL)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```

Requires Node 18+.

## How it's put together

- **`src/world/engine.js`** — the self-contained Three.js engine. `createWorld(container, options)`
  builds the scene inside a DOM element and returns an imperative handle
  (`setCurvature`, `setTimeOfDay`, `setCameraDistance`, `setAutoWander`, `press`, `dispose`).
  It owns the render loop, keyboard, and pointer-drag input, sizes itself to its
  container via `ResizeObserver`, and releases all GPU resources on `dispose()`.
  Types live alongside it in `engine.d.ts`.
- **React owns the UI.** `App.tsx` holds the control state and drives the engine through
  the handle; `TinyPlanet.tsx` mounts/disposes the engine over the component lifecycle;
  `ControlPanel`, `Dpad`, and `Overlay` are presentational.

This keeps the proven rendering code in one encapsulated module while React manages
state, layout, and lifecycle — no framework logic leaks into the engine, and no Three.js
setup leaks into React.

```
src/
  main.tsx              # entry
  App.tsx               # state + wiring
  index.css             # styles
  world/
    engine.js           # Three.js world (imperative handle)
    engine.d.ts         # engine types
  components/
    TinyPlanet.tsx      # mounts the engine, exposes the handle
    ControlPanel.tsx    # sliders + toggle
    Dpad.tsx            # touch movement pad
    Overlay.tsx         # title / tagline / hint
```

## Controls

- **Drag** to look around, **WASD / arrow keys** (or the on-screen d-pad) to walk.
- **Curvature** — `0` is a flat world; higher shrinks the planet.
- **Time of day** — sweep through dawn, noon, dusk, and night; lamps and windows glow after dark.
- **Auto-wander** — let the courier stroll on their own.

## Deploying

`npm run build` emits a static `dist/` you can host anywhere (Vercel, Netlify, GitHub
Pages, any static host). `vite.config.ts` sets `base: './'` so the build also works when
served from a subpath (e.g. `https://example.com/tiny-planet/`).

## License

MIT — see [LICENSE](./LICENSE). Built by An App Idea LLC.
