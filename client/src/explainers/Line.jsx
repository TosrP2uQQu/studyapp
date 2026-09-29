// Line.jsx — y = mx + b from two draggable points. Dragging is
// pointer-based; the same coordinates are keyboard-editable through
// range inputs, so the explainer stays fully operable by keyboard.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const W = 400;
const H = 300;
const PAD = 30;

function toSvg(x, y) {
  return [PAD + x * 34, H - PAD - y * 34];
}

function fromSvg(px, py) {
  return [(px - PAD) / 34, (H - PAD - py) / 34];
}

export default function Line() {
  const { t } = useAuth();
  const [p1, setP1] = useState([1, 1]);
  const [p2, setP2] = useState([8, 6]);
  const [drag, setDrag] = useState(null);

  const dx = p2[0] - p1[0];
  const m = dx === 0 ? null : (p2[1] - p1[1]) / dx;
  const b = m == null ? null : p1[1] - m * p1[0];

  const [s1x, s1y] = toSvg(p1[0], p1[1]);
  const [s2x, s2y] = toSvg(p2[0], p2[1]);

  const onMove = (e) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const [gx, gy] = fromSvg(px, py);
    const cx = Math.max(0, Math.min(10, Math.round(gx * 2) / 2));
    const cy = Math.max(0, Math.min(8, Math.round(gy * 2) / 2));
    if (drag === 1) setP1([cx, cy]);
    else setP2([cx, cy]);
  };

  const eq = m == null
    ? t('expl.vertical')
    : `y = ${m.toFixed(2)}x ${b >= 0 ? '+' : '−'} ${Math.abs(b).toFixed(2)}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-md touch-none"
        role="img"
        aria-label={eq}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - 10}
          y2={H - PAD}
          stroke="currentColor"
        />
        <line
          x1={PAD}
          y1={H - PAD}
          x2={PAD}
          y2={10}
          stroke="currentColor"
        />
        {m != null && (
          <line
            x1={PAD - 20}
            y1={H - PAD - (m * -1 + b) * 34}
            x2={W}
            y2={H - PAD - (m * 11 + b) * 34}
            stroke="var(--clay)"
            strokeWidth="2"
          />
        )}
        <circle
          cx={s1x}
          cy={s1y}
          r="9"
          fill="var(--ink)"
          onPointerDown={() => setDrag(1)}
        />
        <circle
          cx={s2x}
          cy={s2y}
          r="9"
          fill="var(--ink)"
          onPointerDown={() => setDrag(2)}
        />
      </svg>
      <p className="mt-2 font-mono text-base">{eq}</p>
      {m != null && (
        <p className="mt-1 text-sm text-muted">
          {t('expl.slopeLine', { m: m.toFixed(2), b: b.toFixed(2) })}
        </p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-3">
        {[
          ['p1x', p1[0], (v) => setP1([v, p1[1]])],
          ['p1y', p1[1], (v) => setP1([p1[0], v])],
          ['p2x', p2[0], (v) => setP2([v, p2[1]])],
          ['p2y', p2[1], (v) => setP2([p2[0], v])],
        ].map(([id, val, set]) => (
          <label key={id} className="text-sm font-medium">
            {id} = {val}
            <input
              type="range"
              min={0}
              max={id.endsWith('x') ? 10 : 8}
              step={0.5}
              value={val}
              onChange={(e) => set(Number(e.target.value))}
              className="w-full"
              aria-label={id}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
