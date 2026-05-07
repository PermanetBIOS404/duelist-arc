const bcrypt = require('bcryptjs');
const express = require('express');

const { signToken } = require('../auth');

const RESERVED_HANDLE_MESSAGE = 'That username is reserved. Please choose another name.';
const EMAIL_SKELETON_MESSAGE = 'Email saved. Password reset codes are coming soon.';

function normalizeHandleForReservedCheck(handle) {
  // Lowercase and remove separators so we catch obfuscations like "a d_m-i.n".
  return String(handle || '')
    .trim()
    .toLowerCase()
    .replace(/[ _.\-]/g, '');
}

function isReservedHandle(handle) {
  const norm = normalizeHandleForReservedCheck(handle);
  if (!norm) return false;

  const reservedTerms = [
    'admin',
    'administrator',
    'mod',
    'moderator',
    'staff',
    'owner',
    'founder',
    'official',
    'support',
    'system',
    'server',
    'host',
    'developer',
    'dev',
    'team',
    'duelistarc',
    'duelistarcofficial',
  ];

  for (const term of reservedTerms) {
    if (norm === term) return true;
    if (norm.includes(term)) return true;
  }
  return false;
}

function authRoutes({ db, jwtSecret, cookieName, cookieSecure }) {
  const r = express.Router();

  r.post('/register', (req, res) => {
    const handle = String(req.body?.handle || '').trim();
    const password = String(req.body?.password || '');
    const rawEmail = String(req.body?.email || '').trim();
    const email = rawEmail ? rawEmail.toLowerCase() : '';
    if (!handle || handle.length < 2 || handle.length > 24) {
      return res.status(400).json({ error: 'invalid_handle' });
    }
    if (isReservedHandle(handle)) {
      return res.status(400).json({ error: 'reserved_handle', message: RESERVED_HANDLE_MESSAGE });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'invalid_password' });
    }
    if (email) {
      if (email.length > 254) return res.status(400).json({ error: 'invalid_email' });
      // Minimal format check (launch-safe, not exhaustive).
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ error: 'invalid_email' });
      }
      const emailExists = db
        .prepare('SELECT id FROM users WHERE email IS NOT NULL AND lower(email) = lower(?)')
        .get(email);
      if (emailExists) return res.status(409).json({ error: 'email_taken' });
    }

    const exists = db.prepare('SELECT id FROM users WHERE lower(handle) = lower(?)').get(handle);
    if (exists) return res.status(409).json({ error: 'handle_taken' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const createdAt = Date.now();
    const info = db
      .prepare('INSERT INTO users (handle, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(handle, email || null, passwordHash, createdAt);
    const user = { id: info.lastInsertRowid, handle };

    const token = signToken({ jwtSecret, user });
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!cookieSecure,
      path: '/',
    });
    return res.json({ user: { id: Number(user.id), handle: user.handle } });
  });

  r.post('/login', (req, res) => {
    const handle = String(req.body?.handle || '').trim();
    const password = String(req.body?.password || '');
    if (!handle || !password) return res.status(400).json({ error: 'invalid_credentials' });

    const row = db.prepare('SELECT id, handle, password_hash FROM users WHERE lower(handle) = lower(?)').get(handle);
    if (!row) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = bcrypt.compareSync(password, String(row.password_hash || ''));
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const user = { id: Number(row.id), handle: String(row.handle) };
    const token = signToken({ jwtSecret, user });
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!cookieSecure,
      path: '/',
    });
    return res.json({ user });
  });

  r.post('/logout', (req, res) => {
    res.clearCookie(cookieName, { path: '/' });
    return res.json({ ok: true });
  });

  // Skeleton: allow users to attach an email to their account.
  // Password reset via email will be implemented later.
  r.post('/email', (req, res) => {
    // Light auth check (avoid importing auth middleware here).
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const raw = String(req.body?.email || '').trim();
    const email = raw.toLowerCase();
    if (!email || email.length > 254) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    // Minimal format check (launch-safe, not exhaustive).
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }

    // Ensure uniqueness (case-insensitive) to avoid account confusion.
    const exists = db.prepare('SELECT id FROM users WHERE email IS NOT NULL AND lower(email) = lower(?) AND id != ?').get(email, userId);
    if (exists) return res.status(409).json({ error: 'email_taken' });

    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId);
    return res.json({ ok: true, message: EMAIL_SKELETON_MESSAGE });
  });

  r.get('/profile', (req, res) => {
    const userId = Number(req.user?.id || 0);
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const row = db.prepare('SELECT id, handle, email FROM users WHERE id = ?').get(userId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true, user: { id: Number(row.id), handle: String(row.handle || ''), email: row.email ? String(row.email) : '' } });
  });

  return r;
}

module.exports = { authRoutes };
