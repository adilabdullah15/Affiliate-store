// routes/auth.js — signup / login / logout for partners, customers, admin.
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, makeReferralCode, runResult } = require('../db');
const router = express.Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', (req, res) => {
  const { name, email, phone, password, role } = req.body || {};
  const wantRole = role === 'customer' ? 'customer' : 'partner';

  if (!name || String(name).trim().length < 3) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!email || !emailRe.test(String(email).trim())) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const em = String(email).trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(em))
    return res.status(400).json({ error: 'This email is already registered. Please log in.' });

  const hash = bcrypt.hashSync(String(password), 10);
  const refCode = wantRole === 'partner' ? makeReferralCode() : null;
  const info = runResult(db.prepare('INSERT INTO users (name, email, phone, password_hash, role, referral_code) VALUES (?, ?, ?, ?, ?, ?)')
    .run(String(name).trim(), em, String(phone || '').trim(), hash, wantRole, refCode));
  const user = db.prepare('SELECT id, name, email, role, referral_code, status FROM users WHERE id = ?').get(info.lastInsertRowid);
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ ok: true, user });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(password), u.password_hash))
    return res.status(401).json({ error: 'Invalid email or password.' });
  if (u.status === 'suspended') return res.status(403).json({ error: 'This account has been suspended.' });
  req.session.userId = u.id;
  req.session.role = u.role;
  res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role, referral_code: u.referral_code, status: u.status } });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const u = db.prepare('SELECT id, name, email, role, referral_code, status FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: u || null });
});

module.exports = router;
