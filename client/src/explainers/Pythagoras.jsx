// Pythagoras.jsx — sliders for legs a, b: live squares showing
// a², b², c², plus a rearrangement-proof toggle. Keyboard-accessible
// range inputs; honours prefers-reduced-motion via CSS.
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Pythagoras() {
  const { t } = useAuth();
  const [a, setA] = useState(3);
  const [b, setB] = useState(4);
  const [proof, setProof] = useState(false);
  const c = Math.sqrt(a * a + b * b);
  const s = 26;
  const W = (a + b) * s + 40;
  const H = (a + b) * s + 40;

  const sq = (x, y, side, fill, label) => (
    <g>
      <rect
        x={x}
        y={y}
        width={side * s}
        height={side * s}
        fill={fill}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <text
        x={x + (side * s) / 2}
        y={y + (side * s) / 2}
        textAnchor="middle"
        fontSize="14"
        fill="currentColor"
      >
        {label}
      </text>
    </g>
  );

  return (
    <div>
      <div className="grid gap-3">
        <label className="text-sm font-medium">
          a = {a}
          <input
            type="range"
            min={1}
            max={8}
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
            className="w-full"
            aria-label="a"
          />
        </label>
        <label className="text-sm font-medium">
          b = {b}
          <input
            type="range"
            min={1}
            max={8}
            value={b}
            onChange={(e) => setB(Number(e.target.value))}
            className="w-full"
            aria-label="b"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={proof}
            onChange={(e) => setProof(e.target.checked)}
            className="h-4 w-4 accent-[var(--ink)]"
          />
          {t('expl.proof')}
        </label>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full max-w-md"
        role="img"
        aria-label={`a=${a} b=${b} c=${c.toFixed(2)}`}
      >
        {sq(20, 20, a, 'var(--sand)', `a²=${a * a}`)}
        {sq(20 + a * s + 20, 20, b, 'var(--leaf)', `b²=${b * b}`)}
        {sq(20, 20 + a * s + 20, c, 'var(--clay)', `c²≈${Math.round(c * c)}`)}
        {proof && (
          <polygon
            points={`${20},${20} ${20 + a * s},${20} ${20},${20 + b * s}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        )}
      </svg>
      <p className="mt-2 text-sm text-muted">
        {t('expl.pythLine', { a, b, c: c.toFixed(2) })}
      </p>
    </div>
  );
}
