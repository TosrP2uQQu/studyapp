// progress.js — kept as a separate router module per spec structure.
// The actual study/review/recall endpoints live on the decks router
// (routes/decks.js) so that the URL shape matches the spec exactly:
//   GET  /api/decks/:id/study
//   POST /api/decks/:id/cards/:cardId/review
//   GET  /api/decks/:id/recall-sheet
// This module re-exports those handlers' shared logic location for clarity.
module.exports = require('./decks');
