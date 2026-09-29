// MultipleChoice.jsx — pick the right back from same-deck
// distractors. A pick reveals the answer; grading still ends in a
// manual Hard/OK/Easy with a pre-suggestion the user can override.
import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { buildMcOptions, suggestRating } from '../lib/modes';

export default function MultipleChoice({ card, pool, onAnswer }) {
  const { t } = useAuth();
  const [picked, setPicked] = useState(null);
  const built = useMemo(
    () => buildMcOptions(card, pool, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card.id]
  );

  const choose = (id) => {
    if (picked) return;
    setPicked(id);
    onAnswer(id === built.answerId, suggestRating(id === built.answerId));
  };

  return (
    <div className="mt-4 space-y-2" role="radiogroup">
      {built.options.map((o) => {
        const isAnswer = o.id === built.answerId;
        const isPicked = picked === o.id;
        const cls = !picked
          ? 'border-line hover:bg-canvas'
          : isAnswer
            ? 'border-leaf bg-canvas font-semibold'
            : isPicked
              ? 'border-clay bg-canvas'
              : 'border-line opacity-60';
        return (
          <button
            key={o.id + o.text}
            role="radio"
            aria-checked={isPicked}
            disabled={Boolean(picked)}
            onClick={() => choose(o.id)}
            className={`min-h-[44px] w-full rounded-lg border px-4 py-2.5 text-left text-base ${cls}`}
          >
            {o.text || t('flash.empty')}
          </button>
        );
      })}
    </div>
  );
}
