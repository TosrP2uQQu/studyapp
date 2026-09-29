// auth.js — JWT middleware + bcrypt helpers.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function signToken(userId) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, getSecret());
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { hashPassword, comparePassword, signToken, authMiddleware };
