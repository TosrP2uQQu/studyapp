require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const authRoutes = require('./routes/auth');
const deckRoutes = require('./routes/decks');
const cardRoutes = require('./routes/cards');
const translateRoutes = require('./routes/translate');
const { router: userRoutes } = require('./routes/users');
const statsRoutes = require('./routes/stats');
const quizRoutes = require('./routes/quiz');
const aiRoutes = require('./routes/ai');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

db.ensureDataDir();

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
// Cards router mounted first so /api/decks/:id/cards* resolves to cards.js;
// quiz router before decks so /api/decks/:id/quiz* resolves to quiz.js;
// decks router handles the rest (CRUD, join, study, review, recall).
app.use('/api/decks/:id/cards', cardRoutes);
app.use('/api/decks', quizRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ai', aiRoutes);

// 2-day demo hosting: serve the built client from the same process.
// Local dev is unaffected (dist/ usually doesn't exist locally).
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.method === 'GET') {
    try {
      return res.sendFile(path.join(distDir, 'index.html'));
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }
  }
  return res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`StudyApp server listening on http://localhost:${PORT}`);
});
