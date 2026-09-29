# StudyApp — Autonomous Hardening Session, Progress Log

Session date: 2026-09-27 (unattended, ~1 hour). Scope: harden Phases 1–3, no new features.

## Scope decision (read first)

The task brief assumes Phase 3 exists (Simple/Advanced settings modes, appearance live
preview, account-data export/import, keyboard-shortcut remapping). I searched the codebase
for `Advanced`, `remap`, `import JSON`, `account data`, and `Simple`: the only hits are an
unrelated npm transitive dependency (`@jridgewell/remapping`). **No Phase 3 code exists in
this repo — the app is at Phase 2** (desktop shell, study modes, onboarding, BYO-key AI,
quiz, stats, per-deck CSV export).

Judgment call: building a whole Phase 3 unattended would violate "don't add new features",
so I did not build it. Wherever the task list names a Phase 3 feature, I tested the nearest
existing equivalent instead and marked the step accordingly:
- "Settings in Simple and Advanced mode" → the single existing Settings page (prefs, AI, appearance).
- "Appearance live preview" → appearance toggle applies instantly across the app (verified).
- "Export account data" → per-deck CSV export (the existing portability feature).
- "Data import" → does not exist; skipped, noted in Task 3.
- Task 7 (shortcut remapping, Simple/Advanced deck editor) → skipped: parent features absent.

## Task 0 — Progress log
- Created this file at `studyapp/PROGRESS.md`.

## Task 1 — Full smoke test (12/12 pass, real Chromium at 1440px)
- Walked: register → onboarding (prefs + first deck with pretest) → paste-in
  (comma + tab + blank line → 4 cards) → typed-recall toggle → study (guess,
  type, keyboard rate ×4 → session complete) → recall sheet → share code →
  second account joins → per-user progress independent (0 due vs 4 due) →
  mixed review opens → Settings dark mode applies + keyless AI test fails
  gracefully → owner CSV export downloads → logout/login.
- No app bugs found. Three failures during the run were all test-script
  artifacts, fixed in the script: (a) `text=Join` matches both the "Join with
  code" label and the Join button, so the click must target
  `form:has(#join-code) button[type=submit]`; (b) `text=Typed recall >> input`
  resolves the text engine to the inner span (no input descendant), click the
  `label:has-text(...)` instead; (c) keyboard "2" does nothing on guess/type
  screens by design, so the loop must complete each screen per card.
- Noted, not changed: deck members have no Export-CSV UI (endpoint already
  allows members; export button lives on the owner-only editor). Left as-is
  per the no-new-features rule; flagged as a possible follow-up.
- Cleaned up: removed the throwaway scripts and reset all data files to `[]`.

## Task 2 — Automated tests (14/14 pass)- Server: `studyapp/server/test/sm2.test.js` on the zero-dependency `node:test`
  runner (`npm test` → `node --test test/sm2.test.js`; the `test/` directory form
  does not resolve under npm on this setup, so the script names the file
  explicitly). 7 tests with hand-computed vectors: Easy×3 → intervals 1/6/17,
  EF 2.6/2.7/2.8; Hard×3 → intervals 1/6/12, EF 2.36/2.22/2.08; mixed
  Easy/Hard/OK → interval 15, EF 2.46; EF floor at 1.3 after 20 hards;
  quality mapping + invalid-rating throw; default progress is due-now;
  isDue date-only semantics.
- Client: `studyapp/client/test/parsePaste.test.js` under vitest
  (`npm test` → `vitest run`). Judgment call: latest vitest requires Vite 6+,
  the client pins Vite 5, so installed   `vitest@^2.1.9`. 7 tests: first-tab
  split, first-comma fallback, tab preferred over comma, no-delimiter flag,
  blank-line skipping + trimming, CRLF, empty/garbage → `[]`.

## Task 3 — Edge cases (10/10 pass)
- Fixed two real small bugs found while probing: (1) studying a 0-card deck
  said "Nothing due right now. Check back later." Now `Study.jsx` distinguishes
  it: "This deck has no cards yet. Add cards in the deck editor." (2) Re-joining
  a deck you already belong to toasted "Joined shared deck". The join endpoint
  now returns an additive `alreadyMember` flag (old clients ignore it) and the
  dashboard toasts "Already in that deck".
- Verified graceful: bad share code → 404 toast; invalid Anthropic key →
  quiz falls back to local build (`aiUsed: false`), short-answer grading to
  self-check, feedback endpoint → 502 with message; unreachable Ollama →
  test endpoint `ok:false` without hanging, quiz still builds; keyless AI test
  → plain failure toast, no crash; empty paste → "Nothing to parse" toast.
- Data import: no such feature exists (Phase 3 absent), so nothing to break;
  per-deck CSV export (the existing counterpart) verified downloading in Task 1.

## Task 4 — Seed script (`npm run seed`)
- Added `studyapp/server/seed.js` + `seed` scripts on the server and root
  package.json. Creates `demo` / `demo1234` with a general deck (Biology Basics,
  8 cards, typed+elaboration on) and a language deck (Spanish Essentials, 8
  cards, pretest on), fixed share codes `BIODEM` / `ESDEMO` (collision-checked),
  and 8 progress rows with genuine SM-2 states spread over 6 days.
- Verified via API after seeding: 16 cards, new 8 / learning 5 / due 8 /
  mastered 2, streak 3, one hard card pinned on the recall sheet. Second run
  without `--force` refuses cleanly instead of duplicating.
- `index.js` never references the seed file; data files reset to `[]` after.

## Task 5 — Accessibility pass
- Global `:focus-visible` ink ring in `index.css` for button/a/input/select/
  textarea. Caught by probe: Tailwind's `focus:outline-none` (0-2-0) was beating
  a plain `:focus-visible` rule, rendering the ring transparent — fixed with a
  doubled pseudo-class and verified the computed outline is now `2px #24425F`.
- Every input now has a real label: `htmlFor`/`id` pairs added across Login,
  Register, Onboarding, Deck Editor, Quiz, and Settings; `aria-label`s on the
  guess box, paste textarea, preview-row inputs, manual-add inputs, and
  short-answer quiz inputs. The two remaining bare `<label>`s both wrap their
  inputs (checkboxes), which is associated by construction. Probe: login 2/2
  labeled, deck editor zero unlabeled controls.
- Contrast: white text on the sand OK button and sand helper text failed AA,
  and white text on ink/clay/leaf fails in dark mode where those tokens
  lighten. Fixed with same-hue changes only: near-black text on the sand
  button, clay instead of sand for the "needs a back" note, and one central
  dark-mode rule switching white button text to near-black. No palette change.
- Study progress bar got `role="progressbar"` with min/max/now. Toasts and
  spinners already carried `role="status"`; flashcard button already had an
  `aria-label`.

## Task 6 — README
- Wrote `studyapp/README.md`: run commands, seed usage, full command table,
  `.env` config, BYO-key AI storage note, and an architecture paragraph (JSON
  storage + `db.js` swap point, SM-2 + `progress.json` as the single scheduling
  truth, `ai.js` audit log, evidence basis for study modes). Every command in
  it re-verified against the actual package.json scripts; both suites (7+7) and
  the production build pass after all session changes.

## Task 7 — Deferred Phase 3 items: skipped, correctly
- Keyboard-shortcut remapping and the Simple/Advanced deck-editor toggle both
  depend on Phase 3 features (remappable-shortcut system, Simple/Advanced
  taxonomy) that do not exist in this repo. Building the parents would be new
  features, explicitly out of scope. No time was available anyway after Tasks
  1–6; nothing half-done was left behind.

## Session end state
- Data files reset to `[]`; dev server left running (`npm run dev` from
  `studyapp/`). Changed or added: `server/test/sm2.test.js`, `server/seed.js`,
  `server/nodemon.json`, `server/routes/decks.js` (alreadyMember flag),
  `client/test/parsePaste.test.js`, `client/src/pages/Study.jsx` (empty-deck
  message), `Dashboard.jsx` (re-join message), `RatingButtons.jsx` (OK contrast),
  `StudySession.jsx` (labels + progressbar role), `DeckEditor/Quiz/Settings/
  Login/Register/Onboarding` (label association), `index.css` (focus ring +
  dark-mode button text), `README.md`, `PROGRESS.md`, package.json scripts.

---

# Phase 3 build session (2026-09-27): Settings System + UI Refinement

## Data model (all defaulted, old records verified loading)
- `db.js`: `defaultAppearance()`, `settingsMode` (simple unless stored
  advanced), `defaultStudyModes`, and `studyPrefs` gains `sessionCardCap:
  null` + `reminderBannerEnabled: true`. Judgment call: kept Phase-2
  days/minutes defaults (4/15) instead of the spec sketch's nulls, since
  onboarding and prefs validation treat them as required numbers.
- `ai.js` log lines now tag `user=<id>`; the log viewer only returns the
  caller's own lines (feature + bytes, never content). Pre-tagging legacy
  lines are excluded from everyone.
- New deck creation pre-fills `studyModes` from the owner's
  `defaultStudyModes`. New endpoints: settings-mode, appearance (enum
  validated), study-prefs, default-study-modes, password (needs current),
  ai-log, export-all (no hash, no key material), import (merge/replace,
  fresh ids + codes), DELETE account (needs current password).
- Server smoke 16/16: validation rejections, prefill, relogin after password
  change, export→delete→import roundtrip, account deletion.

## Client
- `AuthContext.applyAppearance()` drives theme, accent (`--ink` only, rating
  colors untouched), font stacks, root font-size multiplier, density zoom on
  `main`, and reduce-motion class; re-applies on OS preference changes.
- Genuine bug found by test: context user went stale after reload (localStorage
  copy), so appearance/caps/modes could lag the server. AuthProvider now
  refreshes `/users/me` on boot when a token exists.
- Settings rewritten: Simple/Advanced segmented toggle (persisted, hidden
  sections unmounted not grayed, quiet link back), live preview mini
  flashcard driven by draft values via scoped `--ink`, custom Toggle (real
  checkbox) and Segmented (real radios) with visible focus, per-section
  saves, AI inline key/url + test + disconnect + log viewer, password change
  (with repeat check), JSON export download, file import with plain merge/
  replace confirms, two-step account delete. Privacy note unchanged.
- Session cap enforced in Study and Mixed Review with a plain note when it
  clips. Reminder banner is localStorage-date based, honest scope, dismisses
  till tomorrow. Deck-editor study toggles hidden in Simple with a link (the
  optional consistency item). Shortcut remapping skipped: needs a bindings
  model + keymap; the reference list ships instead.

## Verification (17/17 browser checks + screenshots)
- Mode flip hides/shows per taxonomy and persists; accent changes `--ink`
  while `--hard` stays byte-identical; font-size/density/flip/reduce apply;
  zero raw selects/checkboxes; keyboard Tab reaches a real radio; banner
  appears/dismisses; export→delete→import restores; bogus-key AI test logs a
  viewer entry with bytes only.
- Debugging note: two "failures" mid-session were a stale-toast race in the
  test script (the 3.5s toast outlived the wait, so the next assertion read
  pre-save state) — the app was correct; the script now waits for toast
  detach. First Advanced-flip failure was the same class of artifact plus the
  model row correctly hiding with no provider set.
- Self-critique vs tells: no pills/eyebrows/dots/arrows/marketing copy;
  controls custom but semantic; one copy fix ("Session capped at N of M").
  Dark-mode white-on-accent text was already handled centrally; plum/teal
  verified within the same rule.

## Demo addition (2026-09-27, user request)
- Added a third seed deck, Present Simple (12 English-grammar cards: endings,
  don't/doesn't, do/does questions, signal words, uses). All cards brand-new
  so pretest + typed recall trigger immediately; live demo account is
  demo/demo1234.

## UI language, EN/RU (2026-09-27, user request)
- New `client/src/lib/i18n.js`: full en/ru string tables, `t()` with fallback
  to English (never a crash on a missing key), Russian plural helper
  (день/дня/дней, карточка/карточки/карточек), and Russian names for all 38
  deck languages. Server: `appearance.uiLang` (en/ru, default en).
- `AuthContext` exposes `t` + `lang`, sets `document.documentElement.lang`.
  Every screen converted: sidebar, dashboard, study + all modes, deck editor,
  quiz, recall, mixed, stats, login/register, onboarding, settings.
- Language switch lives in Settings → Appearance (Simple tier). Verified in
  browser: EN→RU→EN roundtrip, persistence across reload, `lang="ru"`,
  dashboard screenshot fully Russian. Deliberately untranslated: server error
  strings (come from the backend as-is) and the quoted AI privacy note (must
  stay verbatim).

---

# Phase 4 build session (2026-09-27): Providers, Written Recall, Fonts, Languages

## 1. Local architecture fix (done first)
- `server/ai.js` no longer has any Ollama path: `callAI({provider:'ollama'})`
  throws loudly instead of hitting the server's own localhost. New
  `client/src/lib/aiClient.js` (DOM-free, unit-tested) makes the Local calls
  from the browser to the person's own base URL (normalized to an
  OpenAI-compatible `/v1` root). Settings shows the OLLAMA_ORIGINS note with
  the exact variable name. Server test endpoint refuses ollama with a
  `clientSide` flag; Settings tests Local from the browser instead.
- Verified: no `ollama` line has ever appeared in `ai-calls.log`.

## 2. Adapters (3 real, 7 named)
- `callAnthropic`, `callGemini` (generateContent), shared
  `callOpenAICompatible` for openai/mistral/groq/custom with fixed per-provider
  base URLs (comment in code says so). 9/9 adapter unit tests with stubbed
  fetch pin each request shape; custom requires key+URL+model.
- Quiz generation/grading, feedback, and written grading all route through
  `aiCredentials()` + `callAI()`, so new providers work everywhere with no
  per-feature code. Quiz with an Ollama user falls back to local build on the
  server, then the Quiz page upgrades self-check short answers in-browser.

## 3-4. Fonts (16) and languages (38)
- `HEADING_FONTS`/`BODY_FONTS` + full Google Fonts URL; server enums extended.
  Found while wiring: Tailwind's `font-serif` class ignored the CSS var, so
  live font switching never reached card text — config now maps both families
  to `var(--font-head)`/`var(--font-ui)`, which also makes the Settings preview
  show draft fonts via a scoped var.
- New `Combobox` (real input + listbox roles, arrows/Enter/Escape, unit-tested
  filter) drives provider, font, and language pickers. Deck language pickers
  use the exact 38-code table, so `langpair` translation is untouched.

## 5. Written Recall
- Fourth deck toggle; textarea + tier (Correct/Almost/Scholarly: leaf/amber/
  clay text) + explanation, then manual Hard/OK/Easy — grading never writes
  progress. Immediate and end-of-session timings (collect → grade-all →
  summary → rate-back), strictness from settings, exact-match shortcut skips
  the AI call. Without AI: honest notice + normal flip flow. `POST
  /api/ai/grade` validates membership (no free-form key proxy) and refuses
  Local with `clientSide: true`.
- Honestly unverifiable here: live tier judgment and strictness-visible
  differences need a real key or a running Ollama (neither present) — paths,
  validation, fallbacks, and no-progress-write are all verified instead.

## Verification
- Server 18/18 (records compat, study-modes key, grade needsKey/403/
  clientSide, provider saves + validation, 16 fonts ± reject, progress
  untouched). Client 19/19 (aiClient 7, combobox 5, parser 7).
- Browser 15/15: all 8 provider options, font/language search, written
  fallback + normal flow, unreachable-Ollama grading fails loud with the card
  still due. Screenshots reviewed against the tells list: clean.
- Two mid-session "failures" were test artifacts (font pickers live in
  Advanced; language search expectation; stale-toast timing from Phase 3
  already handled). One real find: Tailwind font-var gap above.

---

# Phase 6 build session (2026-09-29): demo to daily-use study app

## T0. Recon + carry-over (done)
- Verified present, not rebuilt: Pages workflow
  (`.github/workflows/deploy.yml` -> `build:pages` + dist artifact),
  HashRouter, `base './'`, `check-dist` (relative URLs + secret scan),
  Simple/Advanced settings, Privacy note, Written Recall grading,
  "Why is this true?" elaboration prompts, LT/EN/RU tables.
- i18n audit via script: en/ru/lt each 416 unique keys, zero gaps.
- New `client/test/i18n-parity.test.js` (4 tests): smoke keys resolve
  in en/ru/lt, placeholders identical across langs, language switch
  never touches card content, LT glyph sanity string.
- Still missing (scheduled below): browser StorageAdapter/IndexedDB
  (T1), first-run tutorial + profile (T2), browser Gemini LLM core
  (T3), reviews-log rating history (T4).

## T1. Foundation + bug hunt (done)
- Server: `reviews.json` append-only log written in the same tick
  as the SM-2 update (mode/ms/confidence included); `prev`
  snapshot on every progress row; `POST /undo` restores it once
  (409 on stale). SM-2 gained an explicit q<3 relearning reset
  (backward compatible). Tests: `server/test/reviews.test.js`,
  16/16 server green.
- Client libs: `storage.js` (adapter interface + LocalAdapter with
  quota/memory fallback + `requestPersistence` + session cursor),
  `day.js` (04:00 rollover, DST-safe due strings), `text.js`
  (NFC, accent-insensitive search, collator, import guards),
  `reviews.js` (log mirror, undo depth 10, leech rule,
  difficulty 0-100, rate guard). Tests:
  `client/test/foundation.test.js` (15 tests), 38/38 client green.
- StudySession: local review mirror + undo stack (button +
  Ctrl/Cmd+Z), resume cursor per deck, ms timing, IME-safe keys,
  contentEditable guard, NFC on all typed inputs.
- i18n: `study.undo`/`study.undone` added en/ru/lt (parity kept).
- App shell: `100dvh` override. Full log: `docs/BUGS_FIXED.md`.
- CARRY: Dexie/IndexedDB migration (interface ready, still
  localStorage), modal focus trap + safe-area + font audit (T9),
  AI race/abort fixes (T3), Listening mode voices (T7).

## T2. Accounts, onboarding, tutorial (done)
- Onboarding is now a 4-step wizard with progress dots: (1) UI
  language (instant preview, unchanged) + "Languages I'm learning"
  multi-select (38 deck langs, max 6); (2) Goal (exam/language/
  knowledge/work) setting days+minutes presets; (3) first deck +
  examples; (4) guessing note + AI choice (add key / skip /
  offline). Goal+langs+AI stored browser-side per username.
  No learning-styles quiz. Finish routes to /tutorial for new
  accounts. Tests: `test/tutorial-profile.test.js`, 41/41 green.
- Tutorial (`/tutorial`, protected): 6 steps on a sandbox deck
  (5 LT cards, browser-only). Flip, rate (writes the real local
  review mirror, history strip is genuine), paste/tutor teaser,
  "Start today's plan". Skip on every step, Esc skips, step
  resumes, `TUTORIAL_VERSION=1`, replay in Settings Help.
- Profile (`/profile`, sidebar link): display name, emoji avatar
  picker (no uploads), learning langs, link to Settings for
  backup/delete. Zero server changes (adapter store).
- i18n: +35 keys en/ru/lt (tut.*, onboard.goal*/ai*/learnLangs,
  profile.*, nav.profile, set.replay*). Parity held.
- CARRY: searchable 38-language UI picker (only en/ru/lt UI
  strings exist), guest mode, avatar in sidebar.

## T3. AI that actually works (done)
- New `lib/llm.js`: one `generate()` for gemini (default,
  `x-goog-api-key` + `?key=` retry, JSON + schema, thinkingBudget 0
  with retry-without, SSE stream + non-stream fallback, model
  discovery), OpenAI-compatible (openai/groq/mistral/custom),
  Anthropic (direct-browser headers), Ollama (browser, reused).
  JSON repair (fences/prose/trailing commas) + required-keys check
  + one "JSON only" retry; queue (concurrency 1, 800 ms spacing);
  25 s timeout + caller Cancel; <=2 retries on 429/5xx honoring
  Retry-After; taxonomy (bad-key/quota/offline/blocked-cors/
  timeout/bad-response) with actions; prompt-hash cache;
  `aiContext()` on every call. Tests: `test/llm.test.js` (16,
  mocked fetch), 64/64 client green.
- `lib/keys.js`: browser-only keys (session default, remember
  opt-in). Settings saves a browser copy on Save, clears on
  disconnect; Diagnostics (test key + latency, list models,
  last 5 errors, redacted copy) runs on the form/browser key.
- Status chip (ready/rate-limited/off, icon+text) in sidebar.
- Smart Import: transcript mode (timestamp chunks), offline
  sorter + dedupe + "N cards, K skipped" summary wired into
  DeckEditor, "Structure with AI" (same JSON shape).
- `scripts/ai-smoke.mjs` + `npm run ai-smoke` (env key, PASS/FAIL,
  never prints key; verified clean-fail without key).
- CARRY: photo-vision + PDF import UI, server-key migration to
  browser-only, quiz/grading still on server paths.

## T4. Rating history (done)
- Server: `GET /decks/:id/reviews` (user's rows, undone excluded,
  cap 500); recall-sheet cards now carry `stats` (last, H/O/E,
  total, trend, difficulty 0-100, leech) via pure
  `server/reviewStats.js`. Server 29/29 green (incl. 6 new).
- Study screen: `HistoryStrip` under the card (last 8 merged
  server+mirror rows, icon dots with date/rating/mode/interval
  tooltips, counts + next-due line, persisted hide toggle).
- Recall sheet rebuilt as a filterable table: last-rating chip,
  H/O/E counts, trend (improving/needs-attention/steady),
  difficulty, due date, leech badge; chips (Last Hard, Hard 3+,
  Never, Stubborn, Due) + hardest-first sort.
- Session summary: per-card grid (chip + response seconds) +
  "Re-drill the Hard ones" cram mode (local-only ratings,
  scheduling untouched, bannered). 64/64 client green.
- i18n: +23 keys en/ru/lt. Parity held.
- CARRY: card drawer timeline, Deck Insights charts, leech
  action panel (split/mnemonic/suspend), confidence step UI,
  "ask tutor about hardest 3" (needs T5 Tutor).

## T5. Tutor + videos + explainers (done)
- Tutor (`/tutor`, sidebar): deck-aware chat, 8 modes + 3 depths,
  chips (simpler/example/why/test/make-cards-to-clipboard),
  streaming + Stop, retry, copy, clear, local history (last 20
  sent). `tutorPrompt.js` rules: pedagogy, 150 words, one
  question, level-adapt, no fabricated sources/URLs, uncertainty,
  LaTeX, card-as-data, distress rule (112 EU + findahelpline).
  Entry points: sidebar, "Ask tutor" in study, "hardest 3" in
  session summary (handoff via browser store). No-key → inline
  setup card. 77/77 client green.
- Videos: query-only find (3 offline queries, incl. reputable
  channels, never model URLs) → youtube search tabs; optional
  Data API key (browser store) → result cards; attach URL (strict
  11-char regex, t/start) → click-to-load nocookie embeds.
- Diagrams: AI SVG → strict allow-list sanitize → `<img
  src="data:…">` only; cache-on-card deferred (shown in chat).
  Maths: escaped `$…$` runs (KaTeX lazy-load carried to T9).
- Explainers: registry + keyword suggest (EN+LT), Pythagoras
  (sliders + proof toggle) and Line y=mx+b (drag + keyboard
  sliders), localised captions, reduced-motion safe.
- i18n: +49 keys en/ru/lt. Parity held.
- QA gate: server 29/29 + client 77/77 + build green. Playwright
  NOT run: no browsers installed in this env (package fetchable,
  binaries not); smoke deferred to final QA if time permits.
- CARRY: WebLLM, tutor side-sheet in study, video→cards
  transcript uses Smart Import manually, quadratic/triangle/
  circle explainers, KaTeX proper render.

## T6. Habit system (done, constraint 6 obeyed)
- `lib/habit.js`: XP (all ratings earn 10, quick +2, overdue +5,
  cram flat 5, daily cap 200, gentle 10-level curve), goal streak
  (freezes: 1 per 7-day run, max 3, auto-apply single gaps; rest
  day never breaks; welcome-back flag, never shame), mastery
  buckets (new/learning/young/mature ≥21d), deck stages
  (seed→grove), exam maths (required/day + ahead/on-track/
  behind), intention → .ics (daily RRULE), sleep tips,
  12 achievements (no grinding rewards). 13 tests, 90/90 green.
- Today (`/today`, first nav item): plan card (due + est. time +
  weak-spot deck + micro-lesson link), resume list (session
  cursors), goal ring + editable target, Done-for-today (stats,
  XP, sleep tip, forecast, extra-cram link), welcome-back
  restart, XP/level/cap + streak/freezes/longest, exam planner
  (per-deck date → required/day + status), intention + .ics,
  Pomodoro (configurable, chime off by default) + stretch tips +
  WebAudio noise (off default), weekly canvas image (name,
  streak, reviews, scheduled — nothing else), achievements grid.
- StudySession: XP awards on every rating; break nudge
  (default 45 min, toast, off-switch). Dashboard: late-night
  banner (23:30+, dismissible, off-switch). Sidebar: hide-streak
  respected. Settings → Wellbeing: all off-switches.
- i18n: +69 keys en/ru/lt. Parity held.
- CARRY: per-deck mastery rings (need per-card intervals),
  precise tomorrow forecast, push reminders (no infra),
  achievement toasts, rest-day setting UI.

## T7. Study modes + smart sessions (done)
- MC mode (Study toggle): same-deck distractors, deduped, never
  invented; pick reveals + pre-suggests OK/Hard with ring
  highlight, always overridable. Reverse toggle (forward/back/
  both; `__rev` ids stripped for the API). Blitz 60 s (countdown,
  cram branch, no scheduling). Listening button (async voices,
  deck-language match, honest no-voice note). Match game page
  (6 pairs, timer, practice-only). 97/97 client green.
- Sessions: new-card cap + interleaving (existing) kept; suspend/
  bury/notes/flags carried (need server fields). E edits in
  session (cursor resumes). Keys: Space 1/2/3, Z + Ctrl+Z undo,
  E edit, T tutor, V tutor-videos (?tab=), ? sheet, Ctrl+K
  palette (accent-insensitive decks + actions, arrows/enter/esc).
- i18n: +31 keys en/ru/lt. E reassigned Easy→Edit per spec;
  Settings shortcut list updated.
- CARRY: cloze, speaking grading, learn path, mock exam builder,
  AI distractors, backlog catch-up spread, suspend/bury.

## T8. Open-web content (done, constraint 7 obeyed)
- Explore (`/explore`, sidebar): 8 bundled decks as static repo
  JSON (125 cards, 15–20 each): LT A1, 7 cases, Lietuva basics,
  algebra/geometry, physics units, elements 1–20, irregular
  verbs, study science. One-click add (deck + cards), attribution
  in every description + `docs/CREDITS.md`. Only certain facts;
  one risky claim reworded out. 106/106 client green.
- Imports: delimiter auto-detect (tab/semicolon/comma/plain) +
  blank-line blocks + header CSV wired into DeckEditor notes
  path; exports JSON/TSV/CSV; print cheat sheet (print CSS).
- Wikipedia Learn more (Explore + Tutor explore tab):
  user-initiated MediaWiki `origin=*` extracts in UI language,
  title + link + CC BY-SA note.
- i18n: +15 keys en/ru/lt.
- NOTE: vite chunk-size warning appeared (main ~500 KB);
  route splitting lands in T9.
- CARRY: Tatoeba/OpenStax decks (need two-source verification
  pass), Quizlet login-based import (out of scope), Anki .apkg
  binary import.
