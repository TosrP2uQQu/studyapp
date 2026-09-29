# StudyApp

Study by recall, not rereading: SM-2 flashcards, an AI tutor, videos,
habit tracking that stays kind, and 8 bundled starter decks. Static
site on GitHub Pages (no backend in production); the Express server
is dev-only. UI in English, Russian, and Lithuanian.

## Features (Phase 6)

- Today home: plan, resume, goal ring, Done-for-today, XP/levels,
  goal streaks with freezes, exam planner, Pomodoro + noise,
  weekly card image, achievements — all opt-out-able.
- Study: flip, typed, multiple-choice, reverse, Blitz 60 s, match
  game, listening; rating history strips; undo (button/Ctrl+Z);
  full keyboard + command palette (Ctrl+K).
- AI tutor (8 modes, streaming, local history), video queries +
  click-to-load attaches, AI diagrams (sanitised SVG), two
  interactive explainers, Smart Import (notes/transcript/AI).
- Explore: 8 starter decks (125 cards), share-code import/export,
  Wikipedia extracts. Docs: `docs/FEATURES.md`, `docs/BUGS_FIXED.md`,
  `docs/CREDITS.md`, `docs/DEMO_SCRIPT.md`.

## Run it locally

Requirements: Node.js 18+ and npm. No API keys, no database, no paid services.

```bash
cd studyapp
npm run install:all
npm run dev      # API :4000 + web :5173
npm run seed     # demo/demo1234 with decks + history
```

Tests: `npm test` in `server/` (31) and `client/` (111+).
AI smoke (needs a key, never prints it):
`GEMINI_API_KEY=… npm run ai-smoke --prefix client`.

## GitHub Pages

Push to `main`: `.github/workflows/deploy.yml` builds
`studyapp/client` (`npm run build:pages` + `check-dist`) and
deploys `dist/`. In repo Settings → Pages, source = GitHub
Actions. HashRouter + `base './'` make subpath serving work.

## Keys and privacy

There is no built-in key. Paste your own in Settings → AI
(Gemini default; OpenAI/Groq/Mistral/custom, Anthropic, Ollama).
Browser copy: session-only unless "Remember on this device".
Optional YouTube Data API key for video search cards.

Your notes go only to the provider you choose, using your own
key. This app has no server that stores them. Check your
provider's data policy. Everything third-party (AI, YouTube,
Wikipedia) is user-initiated and listed in Settings → Privacy.

## Configuration

- `server/.env` (create from `.env.example`): `JWT_SECRET` for auth tokens,
  `PORT` (default 4000). The server still starts without it using a dev fallback,
  but set a real secret for anything beyond local testing.
- AI features are optional and bring-your-own-key: Anthropic, OpenAI, Google
  (Gemini), Mistral, Groq, a custom OpenAI-compatible endpoint, or Local
  (Ollama) — all entered in Settings → AI features. Cloud keys are stored
  AES-256-GCM encrypted in the local data files and go straight from the
  server to the provider. Local is the deliberate exception: it runs
  client-side, browser straight to your own Ollama, never through the server
  (localhost on a shared server would be the server's machine, not yours).

## Architecture

- `server/` — Express API. `db.js` is the only module that touches storage, so
  swapping the flat JSON files in `server/data/` for a real database means
  rewriting that one file. `sm2.js` is a pure spaced-repetition module with no
  Express dependency. `ai.js` is the single place outbound AI calls happen, with
  a byte-count audit log (`server/data/ai-calls.log`, never message contents).
- Scheduling truth: `progress.json` holds per-user, per-card SM-2 state and is
  written only by manual Hard/OK/Easy reviews. Shared decks share card content;
  every learner's schedule stays independent. Quiz scores and AI-written grades
  are informational and never alter schedules.
- Study modes are grounded in Dunlosky et al. (2013): retrieval practice (flip
  and typed recall), interleaving (mixed review), self-explanation, elaborative
  interrogation, and pretesting. Low-utility techniques (highlighting, rereading,
  summarization, learning styles) are deliberately absent — Settings says why.
- `client/` — Vite + React + React Router + Tailwind. Desktop shell with sidebar;
  Source Serif 4 for headings and card text, IBM Plex Sans for UI. The whole UI
  is translated English/Russian (`src/lib/i18n.js`, switched in Settings →
  Appearance). Settings has a
  Simple/Advanced tier: theme, font size (root multiplier), fonts, accent color
  (never the Hard/OK/Easy rating colors), density, flip style, and reduce-motion
  all apply live from the user record; study caps, per-deck mode defaults, AI
  keys, backup export/import, and account deletion live there too.
