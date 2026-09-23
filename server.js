// server.js — single Express server for store (/), affiliate portal (/affiliate), admin (/admin).
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getSetting } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(session({
  name: 'sess',
  secret: process.env.SESSION_SECRET || 'change-this-session-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7, sameSite: 'lax' }
}));

// API routes
app.use('/api', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/affiliate', require('./routes/affiliate'));
app.use('/api/admin', require('./routes/admin'));

// Referral capture: /r/CODE -> sets cookie, redirects to store
app.get('/r/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (code) res.cookie('ref', code, { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: false, sameSite: 'lax' });
  res.redirect('/');
});

// Frontend sections
app.use('/affiliate', express.static(path.join(__dirname, 'public', 'affiliate')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));
app.use('/', express.static(path.join(__dirname, 'public', 'store')));

app.get('/health', (req, res) => res.json({ ok: true, site: getSetting('site_name', 'MyStore') }));

app.listen(PORT, () => {
  console.log(`\n  ${getSetting('site_name', 'MyStore')} running at http://localhost:${PORT}`);
  console.log(`  Store:     http://localhost:${PORT}/`);
  console.log(`  Affiliate: http://localhost:${PORT}/affiliate`);
  console.log(`  Admin:     http://localhost:${PORT}/admin  (admin@store.com / changeme123)\n`);
});
