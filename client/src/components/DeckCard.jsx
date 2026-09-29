import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { cardWord } from '../lib/i18n';

export default function DeckCard({ deck, onDelete }) {
  const { t, lang } = useAuth();
  const dueBit =
    deck.dueCount > 0
      ? lang === 'ru'
        ? `, к повторению: ${deck.dueCount}`
        : `, ${deck.dueCount} due today`
      : lang === 'ru'
        ? ', ничего к повторению'
        : ', nothing due';
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-6 shadow-md">
      <h3 className="font-serif text-xl font-semibold leading-snug text-primary">
        {deck.name}
      </h3>
      {deck.subject && <p className="mt-1 text-sm text-muted">{deck.subject}</p>}
      <p className="mt-3 text-sm text-muted">
        {deck.cardCount} {cardWord(lang, deck.cardCount)}
        {dueBit}
        {!deck.isOwner ? (lang === 'ru' ? ', доступна вам' : ', shared with you') : ''}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to={`/decks/${deck.id}/study`}
          className="rounded-lg bg-ink px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          {t('deck.study')}
        </Link>
        <Link
          to={`/decks/${deck.id}/quiz`}
          className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-canvas"
        >
          {t('deck.quiz')}
        </Link>
        <Link
          to={`/decks/${deck.id}/recall`}
          className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-canvas"
        >
          {t('deck.recall')}
        </Link>
        {deck.isOwner ? (
          <Link
            to={`/decks/${deck.id}/edit`}
            className="rounded-lg border border-line px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-canvas"
          >
            {t('deck.edit')}
          </Link>
        ) : (
          <span className="rounded-lg bg-canvas px-4 py-2.5 text-center text-sm text-muted">
            {deck.type === 'language' ? `${deck.sourceLang} to ${deck.targetLang}` : t('deck.generalType')}
          </span>
        )}
      </div>
      {deck.isOwner && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm text-muted">
          <span>
            {t('deck.shareCode')} <span className="font-mono font-semibold tracking-widest">{deck.shareCode}</span>
          </span>
          {onDelete && (
            <button onClick={() => onDelete(deck)} className="font-medium text-clay hover:underline">
              {t('deck.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
