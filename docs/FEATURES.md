# FEATURES.md — T10 innovation budget (3 extras)

Each extra ships behind no flag (all small, all tested), with a
one-line rationale and its evidence basis.

## 1. SD0/SD1 share codes (offline deck sharing)
- What: any deck encodes to a short `SD1:` (deflate) or `SD0:`
  (base64 fallback) string; Explore imports it into a new deck.
  Cards only — keys, progress, and accounts never enter a code.
- Rationale: sharing without accounts, servers, or file
  handling; works fully offline once copied.
- Evidence basis: spaced retrieval — a deck that travels with
  the learner (phone, print, friend) gets reviewed on schedule
  instead of rotting in one app.
- Files: `client/src/lib/share.js`, DeckEditor copy button,
  Explore import box, `client/test/extras.test.js`.

## 2. Confidence step + calibration trail
- What: optional 1–3 "How sure?" before reveal (Settings →
  Study, default off, recommended). Stored in the review log
  (server + mirror) and shown next to the outcome in the
  session summary (`c2` chip next to the rating chip).
- Rationale: learners are routinely overconfident; seeing
  sure-but-wrong pairs trains judgment, which trains study
  time allocation.
- Evidence basis: calibration (metacognitive monitoring).
- Files: StudySession confidence UI, `reviews.js` passthrough
  (server already accepted `confidence`), `extras.test.js`.

## 3. Stubborn-card action panel (leech repair)
- What: leech rows in the recall sheet grow actions: Split the
  card (halves the front into two editable cards, same back,
  deletes the original), Ask tutor (card as context), Find
  videos (tutor video tab). Friendly copy throughout.
- Rationale: a card rated Hard 4+ times is usually two cards
  wearing a trench coat; splitting is the fastest repair, and
  the alternatives are one tap away instead of a dead end.
- Evidence basis: elaboration (identifying sub-structure) +
  spacing (halves schedule independently, so the known half
  stops wasting reviews).
- Files: RecallSheet panel, cards.js CRUD reuse, i18n `leech.*`.
