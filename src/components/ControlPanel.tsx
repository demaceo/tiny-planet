import { phaseLabel } from '../world/engine';

type Props = {
  open: boolean;
  onToggle: () => void;
  curvature: number;
  onCurvature: (value: number) => void;
  timeOfDay: number;
  onTime: (value: number) => void;
  cameraDistance: number;
  onDistance: (value: number) => void;
  autoWander: boolean;
  onWander: (value: boolean) => void;
};

export function ControlPanel({
  open,
  onToggle,
  curvature,
  onCurvature,
  timeOfDay,
  onTime,
  cameraDistance,
  onDistance,
  autoWander,
  onWander,
}: Props) {
  return (
    <>
      <button className="tp-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? 'Hide controls' : 'Controls'}
      </button>

      {open && (
        <div className="tp-panel">
          <div className="tp-panel-hd">Controls</div>

          <div className="tp-row">
            <div className="tp-lbl">
              <label htmlFor="tp-cur">Curvature</label>
              <span className="tp-val">{curvature.toFixed(4)}</span>
            </div>
            <input
              id="tp-cur"
              type="range"
              min={0}
              max={0.005}
              step={0.0001}
              value={curvature}
              onChange={(e) => onCurvature(parseFloat(e.target.value))}
            />
            <div className="tp-hint-sm">0 = flat world · higher = smaller planet</div>
          </div>

          <div className="tp-row">
            <div className="tp-lbl">
              <label htmlFor="tp-time">Time of day</label>
              <span className="tp-val">{phaseLabel(timeOfDay)}</span>
            </div>
            <input
              id="tp-time"
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={timeOfDay}
              onChange={(e) => onTime(parseFloat(e.target.value))}
            />
            <div className="tp-hint-sm">dawn · noon · dusk · night</div>
          </div>

          <div className="tp-row">
            <div className="tp-lbl">
              <label htmlFor="tp-dist">Camera distance</label>
              <span className="tp-val">{cameraDistance.toFixed(1)}</span>
            </div>
            <input
              id="tp-dist"
              type="range"
              min={6}
              max={28}
              step={0.5}
              value={cameraDistance}
              onChange={(e) => onDistance(parseFloat(e.target.value))}
            />
          </div>

          <label className="tp-check">
            <input
              type="checkbox"
              checked={autoWander}
              onChange={(e) => onWander(e.target.checked)}
            />{' '}
            Auto-wander
          </label>
        </div>
      )}
    </>
  );
}
