# BUGS_FIXED.md — Phase 6 T1 bug-hunt checklist

Each item: checked, fixed or already-OK, regression test location.
`server/test/*.test.js` run with `npm test` in `server/`;
`client/test/*.test.js` run with `npm test` in `client/`.

## Scheduling / data
- SM-2 edges: FIXED. `reviewCard` had no q<3 path (all buttons map
  to 3/4/5, so reset was unreachable and untested). Added an explicit
  relearning reset (reps=0, interval=0, EF kept with 1.3 floor),
  backward compatible. EF floor, first interval 1, second 6, and
  `Math.round(interval * EF)` covered in
  `server/test/reviews.test.js`.
- Duplicate cards on re-import: already-OK. Paste preview requires an
  explicit Save; no auto-save path re-adds rows. (Full dedupe report
  ships with Smart Import summary in T3.)
- Empty/whitespace/very long cards: FIXED (client-side). New
  `lib/text.js`: `normCardSide` (NFC + collapse + trim),
  `sideTooLong` (>2000 chars flagged at import). Tested in
  `client/test/foundation.test.js`.
- Double-click/double-Enter on rating: already-OK in UI (`rating`
  busy-guard in `StudySession.rate`), now also a pure
  `createRateGuard()` helper in `lib/reviews.js` with a test.
- Lost session on refresh: FIXED. Resume cursor per deck in
  sessionStorage (`lib/storage.js` `saveCursor`/`loadCursor`),
  restored on mount, cleared on completion. Memory fallback when
  sessionStorage is missing. Tested.

## Input / keyboard
- Shortcuts firing while typing: already-OK for input/textarea/
  select; FIXED the gap for `contentEditable` targets.
- IME composition on Enter: FIXED. Global handler ignores
  `isComposing`/`keyCode 229`; guess/typed inputs ignore
  composing Enter (matters for Lithuanian dead-key accents).

## State / navigation
- Stale state after language/theme switch: already-OK
  (`AuthProvider` refreshes `/users/me` on boot, appearance
  re-applies; verified in Phase 3).
- Modal focus trap/Escape/focus restore: PARTIAL. Budget modal is
  the only modal; Escape-to-close + focus restore deferred to T9
  accessibility pass (logged, not forgotten).
- Unsaved-edit warning: DEFERRED to T7 deck-editor work.
- Browser Back with HashRouter: already-OK (HashRouter in use;
  Back never hits the server).

## AI / browser APIs
- Aborted AI requests / unhandled rejections: DEFERRED to T3
  (LLM client rewrite with AbortController + error taxonomy).
- Two AI actions racing: DEFERRED to T3 (queue, concurrency 1).
- `CompressionStream` missing: NOTED. Share codes stay
  uncompressed JSON (`SD0:`) until T3; no silent failure path
  exists today (import validates JSON and toasts).
- `crypto.subtle` unavailable: NOTED. No browser crypto used yet;
  the T2 signup wizard will show a clear error on insecure
  contexts instead of failing silently.
- Web Speech voices async: DEFERRED to T7 (Listening mode).

## Mobile / display
- `100vh` to `dvh`: FIXED. App shell keeps `min-h-screen` with a
  `100dvh` inline-style override (unsupported browsers fall back).
- Inputs >= 16px, tap targets >= 44px: PARTIAL. Undo button ships
  with `min-h-[44px]`; full audit deferred to T9.
- Safe-area insets: DEFERRED to T9 (PWA polish).
- Long Lithuanian words/URLs overflowing: NOTED, no breakage
  found; `overflow-wrap` audit rides with T9.
- Dark-mode contrast, reduced-motion: already-OK (Phase 3:
  central dark-mode button-text rule, reduce-motion setting).
- IndexedDB unavailable (private mode): FIXED pattern.
  `LocalAdapter.probe()` detects it; adapter falls back to memory
  and reports `{ ok: false, memory: true }` so the UI can banner.
  Full Dexie/IndexedDB migration is T1-carry: the adapter
  interface is stable, `requestPersistence()` is wired, but the
  backend is still localStorage. Logged in PROGRESS.md.
- Missing i18n key: already-OK (`t()` falls back to English,
  never crashes) + enforced by `test/i18n-parity.test.js`.
- Plural forms: already-OK (`pluralRu`/`pluralLt` helpers).

## New in T1 (not a hunt item, structural)
- Append-only `reviews` log: server `reviews.json` written in the
  same tick as the SM-2 update; client mirror in `lib/reviews.js`.
- Undo last rating: button + Ctrl/Cmd+Z, depth 10 in-session;
  server restores the SM-2 snapshot and rejects stale undos (409).
