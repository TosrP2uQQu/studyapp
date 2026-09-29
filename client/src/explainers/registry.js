// registry.js — built-in interactive explainers (hand-coded
// React + SVG). Cards link via keyword match; see suggestExplainer.
export const EXPLAINERS = [
  {
    id: 'pythagoras',
    keywords: [
      'pythagoras', 'pythagorean', 'pitagoras', 'pitagoro',
      'a²+b²', 'a2+b2', 'hypotenuse', 'hipotenuz',
      'statinys', 'įžambinė',
    ],
  },
  {
    id: 'line',
    keywords: [
      'y=mx+b', 'y = mx', 'slope', 'nuolydis',
      'tiesinė', 'linear function', 'tiesinė funkcija',
    ],
  },
];

export function suggestExplainer(card) {
  if (!card) return null;
  const hay = `${card.front || ''}\n${card.back || ''}`.toLowerCase();
  for (const ex of EXPLAINERS) {
    if (ex.keywords.some((k) => hay.includes(k.toLowerCase()))) {
      return ex.id;
    }
  }
  return null;
}
