import type { Dir } from '../world/engine';

type Props = {
  onPress: (dir: Dir, down: boolean) => void;
};

const BUTTONS: { dir: Dir; label: string; area: string; glyph: string }[] = [
  { dir: 'f', label: 'Walk forward', area: '1 / 2', glyph: '▲' },
  { dir: 'l', label: 'Walk left', area: '2 / 1', glyph: '◀' },
  { dir: 'r', label: 'Walk right', area: '2 / 3', glyph: '▶' },
  { dir: 'b', label: 'Walk backward', area: '3 / 2', glyph: '▼' },
];

export function Dpad({ onPress }: Props) {
  return (
    <div className="tp-dpad">
      {BUTTONS.map((b) => (
        <button
          key={b.dir}
          aria-label={b.label}
          style={{ gridArea: b.area }}
          onPointerDown={(e) => {
            e.preventDefault();
            onPress(b.dir, true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            onPress(b.dir, false);
          }}
          onPointerLeave={() => onPress(b.dir, false)}
          onPointerCancel={() => onPress(b.dir, false)}
        >
          {b.glyph}
        </button>
      ))}
    </div>
  );
}
