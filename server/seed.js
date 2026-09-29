// seed.js — explicit demo-data script. Run with `npm run seed` (server or root).
// Creates one demo account with two populated decks and realistic review
// history. NEVER runs automatically on server start; index.js does not
// reference this file. Refuses to run twice without --force.
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { hashPassword } = require('./auth');
const sm2 = require('./sm2');

const USERNAME = 'demo';
const PASSWORD = 'demo1234';
const FORCE = process.argv.includes('--force');

function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function main() {
  db.ensureDataDir();
  const users = db.readUsers();
  if (users.some((u) => u.username.toLowerCase() === USERNAME) && !FORCE) {
    console.log(`User "${USERNAME}" already exists. Re-run with --force to reseed (this deletes the existing demo user and their decks).`);
    process.exit(1);
  }

  if (FORCE) {
    const remaining = users.filter((u) => u.username.toLowerCase() !== USERNAME);
    const goneIds = new Set(users.filter((u) => u.username.toLowerCase() === USERNAME).map((u) => u.id));
    const decks = db.readDecks().filter((d) => !goneIds.has(d.ownerId));
    db.writeDecks(decks);
    const deckIds = new Set(decks.map((d) => d.id));
    db.writeMemberships(db.readMemberships().filter((m) => !goneIds.has(m.userId) && deckIds.has(m.deckId)));
    db.writeProgress(db.readProgress().filter((p) => !goneIds.has(p.userId)));
    db.writeQuizResults(db.readQuizResults().filter((q) => !goneIds.has(q.userId)));
    users.length = 0;
    users.push(...remaining);
  }

  const user = {
    id: uuidv4(),
    username: USERNAME,
    passwordHash: hashPassword(PASSWORD),
    createdAt: new Date().toISOString(),
    studyPrefs: { daysPerWeek: 5, minutesPerSession: 20 },
    onboarded: true,
    aiSettings: db.defaultAiSettings(),
  };
  users.push(user);
  db.writeUsers(users);

  const bioCards = [
    ['Mitochondria', 'Organelle that produces ATP through cellular respiration'],
    ['Nucleus', 'Membrane-bound compartment holding the cell\u2019s DNA'],
    ['Ribosome', 'Molecular machine that builds proteins from mRNA'],
    ['Chloroplast', 'Plant organelle where photosynthesis happens'],
    ['Homeostasis', 'Keeping internal conditions stable despite outside change'],
    ['Mitosis', 'Cell division producing two genetically identical cells'],
    ['Enzyme', 'Protein that speeds up a chemical reaction without being used up'],
    ['Osmosis', 'Movement of water across a semipermeable membrane'],
  ];
  const spanishCards = [
    ['la biblioteca', 'library'],
    ['el profesor', 'teacher'],
    ['la ventana', 'window'],
    ['el perro', 'dog'],
    ['gracias', 'thank you'],
    ['por favor', 'please'],
    ['la comida', 'food'],
    ['el agua', 'water'],
  ];
  const presentSimpleCards = [
    ['I / you / we / they (affirmative)', 'Base verb, no ending: I work, you play, they live here'],
    ['He / she / it (affirmative)', 'Add -s: he works, she plays, it rains'],
    ['Negative: I / you / we / they', "don't + base verb: I don't like coffee"],
    ['Negative: he / she / it', "doesn't + base verb: she doesn't eat meat"],
    ['Question: you / we / they', 'Do + subject + base verb? Do you speak English?'],
    ['Question: he / she / it', 'Does + subject + base verb? Does he live here?'],
    ['go with he / she / it', 'goes (add -es after o)'],
    ['study with he / she / it', 'studies (consonant + y turns into -ies)'],
    ['have with he / she / it', 'has (irregular, just memorize it)'],
    ['Signal words', 'always, usually, often, sometimes, rarely, never, every day'],
    ['Use: habits and routines', 'I drink tea every morning'],
    ['Use: facts and general truths', 'Water boils at 100 degrees / The sun rises in the east'],
  ];

  const decks = db.readDecks();
  const bio = {
    id: uuidv4(), ownerId: user.id, name: 'Biology Basics', subject: 'Biology',
    type: 'general', sourceLang: '', targetLang: '',
    shareCode: 'BIODEM', createdAt: new Date().toISOString(),
    cards: bioCards.map(([front, back]) => ({ id: uuidv4(), front, back, createdAt: new Date().toISOString() })),
    studyModes: { typedRecall: true, pretest: false, elaborativePrompts: true },
  };
  const spanish = {
    id: uuidv4(), ownerId: user.id, name: 'Spanish Essentials', subject: 'Spanish',
    type: 'language', sourceLang: 'es', targetLang: 'en',
    shareCode: 'ESDEMO', createdAt: new Date().toISOString(),
    cards: spanishCards.map(([front, back]) => ({ id: uuidv4(), front, back, createdAt: new Date().toISOString() })),
    studyModes: { typedRecall: false, pretest: true, elaborativePrompts: false },
  };
  const presentSimple = {
    id: uuidv4(), ownerId: user.id, name: 'Present Simple', subject: 'English grammar',
    type: 'general', sourceLang: '', targetLang: '',
    shareCode: 'PRESIM', createdAt: new Date().toISOString(),
    cards: presentSimpleCards.map(([front, back]) => ({ id: uuidv4(), front, back, createdAt: new Date().toISOString() })),
    // All study extras on, so every feature is one click away on this deck.
    studyModes: { typedRecall: true, pretest: true, elaborativePrompts: true },
  };
  // Fixed demo codes are checked for collisions just like generated ones.
  for (const d of [bio, spanish, presentSimple]) {
    if (decks.some((x) => x.shareCode === d.shareCode)) {
      console.log(`Share code ${d.shareCode} is taken; aborting seed.`);
      process.exit(1);
    }
  }
  decks.push(bio, spanish, presentSimple);
  db.writeDecks(decks);

  const memberships = db.readMemberships();
  for (const d of [bio, spanish, presentSimple]) {
    memberships.push({ userId: user.id, deckId: d.id, joinedAt: new Date().toISOString() });
  }
  db.writeMemberships(memberships);

  // Review history with real SM-2 states: some mastered-ish, some due,
  // some new. Reviewed timestamps spread over the last few days so the
  // stats page and streak show something truthful.
  const progress = db.readProgress();
  const reviewed = (deck, idx, rating, dayOffset, reps) => {
    const card = deck.cards[idx];
    let state = { repetitions: reps, easeFactor: 2.5, interval: reps === 0 ? 0 : reps === 1 ? 1 : 6 };
    // Replay `reps` successful reviews to reach a plausible state, then
    // apply the final rating to set the stored nextReviewDate.
    for (let i = 0; i < reps; i++) state = sm2.reviewCard(
      { repetitions: i, easeFactor: state.easeFactor, interval: state.interval }, 4
    );
    const q = sm2.ratingToQuality(rating);
    const done = sm2.reviewCard(state, q);
    const at = daysAgo(dayOffset);
    // Backdate the stored dates so history looks like history.
    const due = new Date(at);
    due.setDate(due.getDate() + done.interval);
    progress.push({
      userId: user.id, deckId: deck.id, cardId: card.id,
      repetitions: done.repetitions, easeFactor: done.easeFactor, interval: done.interval,
      nextReviewDate: isoDay(due), lastRating: rating, lastReviewedAt: at.toISOString(),
    });
  };
  reviewed(bio, 0, 'easy', 6, 3);   // interval grown, due again
  reviewed(bio, 1, 'easy', 5, 3);
  reviewed(bio, 2, 'ok', 1, 1);     // reviewed yesterday
  reviewed(bio, 3, 'hard', 1, 1);   // hard -> recall sheet highlight
  reviewed(bio, 4, 'ok', 0, 0);     // reviewed today
  // bio 5-7 left new (due immediately)
  reviewed(spanish, 0, 'easy', 0, 2); // reviewed today
  reviewed(spanish, 1, 'ok', 2, 1);
  reviewed(spanish, 2, 'hard', 0, 0);
  // spanish 3-7 left new
  db.writeProgress(progress);

  console.log(`Seeded demo account "${USERNAME}" (password "${PASSWORD}") with 3 decks and review history.`);
}

main();
