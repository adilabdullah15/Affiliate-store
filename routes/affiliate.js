// routes/affiliate.js — partner-only API: dashboard, links, wallet, withdrawals.
const express = require('express');
const { db, getSetting } = require('../db');
const runId = info => Number(info.lastInsertRowid);
const router = express.Router();

function requirePartner(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in.' });
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'partner'").get(req.session.userId);
  if (!u) return res.status(403).json({ error: 'Partner access only.' });
  if (u.status === 'suspended') return res.status(403).json({ error: 'Account suspended.' });
  req.partner = u;
  next();
}
router.use(requirePartner);

function parseImages(p) {
  try { const a = JSON.parse(p.images || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Dashboard stats
router.get('/stats', (req, res) => {
  const pid = req.partner.id;
  const clicks = db.prepare('SELECT COUNT(*) c FROM clicks WHERE referral_code = ?').get(req.partner.referral_code).c;
  const sales = db.prepare('SELECT COUNT(DISTINCT order_id) c FROM commissions WHERE partner_id = ?').get(pid).c;
  const earned = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM commissions WHERE partner_id = ? AND status IN ('approved','paid')").get(pid).s;
  const pending = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM commissions WHERE partner_id = ? AND status = 'pending'").get(pid).s;
  const withdrawn = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE partner_id = ? AND status IN ('approved','paid')").get(pid).s;
  const available = Math.max(0, earned - withdrawn);
  const recent = db.prepare(`SELECT c.amount, c.status, c.created_at, o.id AS order_id, p.name AS product_name
    FROM commissions c JOIN orders o ON o.id = c.order_id LEFT JOIN products p ON p.id = c.product_id
    WHERE c.partner_id = ? ORDER BY c.id DESC LIMIT 10`).all(pid);
  const clicksByDay = db.prepare(`SELECT substr(created_at,1,10) d, COUNT(*) c FROM clicks
    WHERE referral_code = ? AND created_at >= date('now','-13 days') GROUP BY d ORDER BY d`).all(req.partner.referral_code);
  res.json({
    referral_code: req.partner.referral_code,
    clicks, sales,
    earned: Math.round(earned), pending: Math.round(pending),
    withdrawn: Math.round(withdrawn), available: Math.round(available),
    min_withdrawal: Number(getSetting('min_withdrawal', '1000')),
    recent, clicksByDay
  });
});

// Products for link generation / media kit
router.get('/products', (req, res) => {
  const rows = db.prepare('SELECT id, name, slug, description, price, old_price, commission_percent, images, video_url, category FROM products WHERE active = 1 ORDER BY id DESC').all();
  res.json(rows.map(p => ({
    id: p.id, name: p.name, slug: p.slug, description: p.description,
    price: p.price, old_price: p.old_price, commission_percent: p.commission_percent,
    commission_amount: Math.round(p.price * p.commission_percent) / 100,
    images: parseImages(p), video_url: p.video_url, category: p.category
  })));
});

// Earnings ledger
router.get('/earnings', (req, res) => {
  const rows = db.prepare(`SELECT c.id, c.amount, c.status, c.created_at, o.id AS order_id,
      o.order_status, p.name AS product_name
    FROM commissions c JOIN orders o ON o.id = c.order_id LEFT JOIN products p ON p.id = c.product_id
    WHERE c.partner_id = ? ORDER BY c.id DESC LIMIT 200`).all(req.partner.id);
  res.json(rows);
});

// Withdrawal history
router.get('/withdrawals', (req, res) => {
  const rows = db.prepare('SELECT * FROM withdrawals WHERE partner_id = ? ORDER BY id DESC LIMIT 100').all(req.partner.id);
  res.json(rows);
});

// Request withdrawal
router.post('/withdrawals', (req, res) => {
  const min = Number(getSetting('min_withdrawal', '1000'));
  const amount = Math.floor(Number(req.body.amount) || 0);
  const method = String(req.body.method || 'bank').slice(0, 40);
  const details = String(req.body.account_details || '').trim().slice(0, 300);

  if (!amount || amount < min) return res.status(400).json({ error: `Minimum withdrawal is PKR ${min.toLocaleString()}.` });
  if (!details) return res.status(400).json({ error: 'Please provide your account details.' });

  const earned = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM commissions WHERE partner_id = ? AND status IN ('approved','paid')").get(req.partner.id).s;
  const out = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM withdrawals WHERE partner_id = ? AND status IN ('pending','approved','paid')").get(req.partner.id).s;
  const available = Math.floor(earned - out);
  if (amount > available) return res.status(400).json({ error: `Insufficient balance. Available: PKR ${available.toLocaleString()}.` });

  const info = db.prepare('INSERT INTO withdrawals (partner_id, amount, method, account_details) VALUES (?, ?, ?, ?)')
    .run(req.partner.id, amount, method, details);
  res.json({ ok: true, id: runId(info) });
});

// Click stats per product
router.get('/clicks', (req, res) => {
  const rows = db.prepare(`SELECT c.product_id, p.name AS product_name, COUNT(*) AS clicks
    FROM clicks c LEFT JOIN products p ON p.id = c.product_id
    WHERE c.referral_code = ? GROUP BY c.product_id ORDER BY clicks DESC LIMIT 50`).all(req.partner.referral_code);
  res.json(rows);
});

module.exports = router;
