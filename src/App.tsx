import { TinyPlanetShowcase } from './components/TinyPlanetShowcase';

/**
 * The standalone showcase. All of the interesting work lives in
 * `<TinyPlanetShowcase>`, which is the same component the portfolio embeds —
 * this file only gives it a full-viewport box to fill.
 */
export default function App() {
  return (
    <TinyPlanetShowcase
      title="Tiny Planet"
      subtitle="Drag to spin a tiny hand-built world."
      credit="A tiny-planet experiment · built by An App Idea LLC"
    />
  );
}
