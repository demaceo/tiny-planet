type Props = {
  hintVisible: boolean;
};

export function Overlay({ hintVisible }: Props) {
  return (
    <>
      <div className="tp-title">
        <h1>Tiny Planet</h1>
        <p>Drag to spin a tiny hand-built world.</p>
      </div>

      <div className="tp-credit">A tiny-planet experiment · built by An App Idea LLC</div>

      <div className="tp-hint" style={{ opacity: hintVisible ? 1 : 0 }}>
        drag to look around · WASD to walk
      </div>
    </>
  );
}
