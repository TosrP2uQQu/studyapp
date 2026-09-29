// Match.jsx — timed 6-pair matching rounds. Pure practice:
// nothing here writes schedules or the review log.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { shuffle } from '../lib/modes';

function tilesFor(cards) {
  const tiles = [];
  for (const c of cards) {
    tiles.push({ key: `${c.id}-f`, pair: c.id, text: c.front });
    tiles.push({ key: `${c.id}-b`, pair: c.id, text: c.back });
  }
  return shuffle(tiles);
}

export default function Match({ notify }) {
  const { id } = useParams();
  const { t } = useAuth();
  const [deck, setDeck] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [picked, setPicked] = useState([]);
  const [donePairs, setDonePairs] = useState([]);
  const [seconds, setSeconds] = useState(0);
  const [round, setRound] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/decks/${id}`);
        setDeck(data);
        const six = shuffle(data.cards || []).slice(0, 6);
        setTiles(tilesFor(six));
      } catch (err) {
        notify(err.response?.data?.error || t('study.loadFailed'), 'error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, round]);

  useEffect(() => {
    if (!tiles.length || donePairs.length >= tiles.length / 2) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [tiles, donePairs]);

  const finished = tiles.length > 0 && donePairs.length >= tiles.length / 2;

  const tap = (tile) => {
    if (picked.includes(tile.key) || donePairs.includes(tile.pair)) return;
    if (picked.length === 0) {
      setPicked([tile.key]);
      return;
    }
    const first = tiles.find((x) => x.key === picked[0]);
    if (first && first.pair === tile.pair) {
      setDonePairs((d) => [...d, tile.pair]);
      setPicked([]);
    } else {
      const miss = [picked[0], tile.key];
      setPicked(miss);
      setTimeout(() => setPicked([]), 600);
    }
  };

  if (!deck) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">{t('match.title')}</h1>
        <span className="font-mono text-lg" aria-live="polite">
          {seconds}s
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{t('match.note')}</p>
      {tiles.length === 0 && (
        <p className="mt-4 text-base text-muted">{t('study.noCardsHint')}</p>
      )}
      {finished ? (
        <div className="mt-6 rounded-2xl bg-surface p-8 text-center shadow-md">
          <p className="font-serif text-2xl font-semibold">
            {t('match.done', { s: seconds })}
          </p>
          <button
            onClick={() => {
              setDonePairs([]);
              setPicked([]);
              setSeconds(0);
              setRound((r) => r + 1);
            }}
            className="mt-4 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {t('match.again')}
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {tiles.map((tile) => {
            const isOut = donePairs.includes(tile.pair);
            const isPicked = picked.includes(tile.key);
            if (isOut) return <span key={tile.key} />;
            return (
              <button
                key={tile.key}
                onClick={() => tap(tile)}
                className={`min-h-[64px] rounded-xl border px-2 py-3 text-sm font-medium ${
                  isPicked
                    ? 'border-ink bg-canvas'
                    : 'border-line bg-surface hover:bg-canvas'
                }`}
              >
                {tile.text}
              </button>
            );
          })}
        </div>
      )}
      <Link
        to={`/decks/${id}/study`}
        className="mt-4 inline-block text-sm font-medium text-ink hover:underline"
      >
        {t('mixed.back')}
      </Link>
    </div>
  );
}
