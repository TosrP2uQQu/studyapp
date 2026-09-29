const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { hashPassword, comparePassword, signToken } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  const users = db.readUsers();
  const exists = users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const user = {
    id: uuidv4(),
    username: String(username),
    passwordHash: hashPassword(String(password)),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  db.writeUsers(users);
  const token = signToken(user.id);
  return res.json({ token, user: { id: user.id, username: user.username } });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const users = db.readUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
  if (!user || !comparePassword(String(password), user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = signToken(user.id);
  return res.json({ token, user: { id: user.id, username: user.username } });
});

module.exports = router;
