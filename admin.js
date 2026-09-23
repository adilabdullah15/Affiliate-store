// routes/admin.js — admin-only API: dashboard, products CRUD, orders, partners, withdrawals, settings.
const express = require('express');
const { db, getSetting, setSetting, uniqueSlug, transaction, runResult } = require('../db');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in.' });
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(req.session.userId);
  if (!u) return res.status(403).json({ error: 'Admin access only.' });
  next();
}
router.use(requireAdmin);

function parseImages(p) {
  try { const a = JSON.parse(p.images || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// ---- Dashboard ----
router.get('/dashboard', (req, res) => {
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE order_status != 'cancelled'").get().s;
  const ordersCount = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const partners = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'partner'").get().c;
  const pendingWd = db.prepare("SELECT COUNT(*) c FROM withdrawals WHERE status = 'pending'").get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE order_status = 'pending'").get().c;
  const salesByDay = db.prepare(`SELECT substr(created_at,1,10) d, COALESCE(SUM(total),0) s FROM orders
    WHERE order_status != 'cancelled' AND created_at >= date('now','-13 days') GROUP BY d ORDER BY d`).all();
  const topProducts = db.prepare(`SELECT p.name, SUM(CAST(json_extract(o.items, '$[#].qty') AS INTEGER)) AS qty
    FROM orders o, json_each(o.items) AS it
    JOIN products p ON p.id = CAST(json_extract(it.value,'$.product_id') AS INTEGER)
    WHERE o.order_status != 'cancelled' GROUP BY p.id ORDER BY qty DESC LIMIT 5`).all();
  const recentOrders = db.prepare('SELECT id, customer_name, city, total, payment_method, order_status, created_at FROM orders ORDER BY id DESC LIMIT 8').all();
  res.json({ revenue, ordersCount, partners, pendingWd, pendingOrders, salesByDay, topProducts, recentOrders });
});

// ---- Products CRUD ----
router.get('/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json(rows.map(p => ({ ...p, images: parseImages(p) })));
});

router.post('/products', (req, res) => {
  const b = req.body || {};
  if (!b.name || String(b.name).trim().length < 2) return res.status(400).json({ error: 'Product name is required.' });
  const price = Number(b.price);
  if (!(price > 0)) return res.status(400).json({ error: 'Price must be greater than 0.' });
  const commission = Math.max(0, Math.min(90, Number(b.commission_percent) || 0));
  let images = [];
  if (Array.isArray(b.images)) images = b.images.map(String).filter(u => /^https?:\/\//i.test(u)).slice(0, 8);
  const slug = uniqueSlug(b.slug || b.name);
  const info = db.prepare(`INSERT INTO products
    (name, slug, description, price, old_price, commission_percent, images, video_url, stock, category, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(String(b.name).trim(), slug, String(b.description || '').trim(), price,
      b.old_price ? Number(b.old_price) : null, commission, JSON.stringify(images),
      String(b.video_url || '').trim(), Math.max(0, Number(b.stock) || 0),
      String(b.category || 'General').trim().slice(0, 60), b.active === false || b.active === 0 ? 0 : 1);
  res.json({ ok: true, id: runResult(info).lastInsertRowid, slug });
});

router.put('/products/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Product not found.' });
  const price = Number(b.price);
  if (!(price > 0)) return res.status(400).json({ error: 'Price must be greater than 0.' });
  const commission = Math.max(0, Math.min(90, Number(b.commission_percent) || 0));
  let images = parseImages(cur);
  if (Array.isArray(b.images)) images = b.images.map(String).filter(u => /^https?:\/\//i.test(u)).slice(0, 8);
  let slug = cur.slug;
  if (b.slug && b.slug !== cur.slug) slug = uniqueSlug(b.slug);
  db.prepare(`UPDATE products SET name=?, slug=?, description=?, price=?, old_price=?, commission_percent=?,
    images=?, video_url=?, stock=?, category=?, active=? WHERE id=?`)
    .run(String(b.name || cur.name).trim(), slug, String(b.description ?? cur.description).trim(), price,
      b.old_price ? Number(b.old_price) : null, commission, JSON.stringify(images),
      String(b.video_url ?? cur.video_url).trim(), Math.max(0, Number(b.stock ?? cur.stock)),
      String(b.category || cur.category).trim().slice(0, 60),
      b.active === false || b.active === 0 ? 0 : 1, req.params.id);
  res.json({ ok: true, slug });
});

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Orders ----
router.get('/orders', (req, res) => {
  const status = req.query.status;
  let sql = 'SELECT * FROM orders';
  const params = [];
  if (status && ['pending','confirmed','shipped','delivered','cancelled'].includes(status)) {
    sql += ' WHERE order_status = ?'; params.push(status);
  }
  sql += ' ORDER BY id DESC LIMIT 300';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(o => { try { o.items = JSON.parse(o.items); } catch { o.items = []; } return o; }));
});

router.put('/orders/:id', (req, res) => {
  const { order_status, payment_status } = req.body || {};
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found.' });
  const txn = () => transaction(() => {
    if (order_status && ['pending','confirmed','shipped','delivered','cancelled'].includes(order_status)) {
      // Restock on cancel
      if (order_status === 'cancelled' && o.order_status !== 'cancelled') {
        let items = []; try { items = JSON.parse(o.items); } catch {}
        for (const it of items) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty || 0, it.product_id);
      }
      db.prepare('UPDATE orders SET order_status = ? WHERE id = ?').run(order_status, o.id);
      // Approve commissions when order is delivered
      if (order_status === 'delivered') {
        db.prepare("UPDATE commissions SET status = 'approved' WHERE order_id = ? AND status = 'pending'").run(o.id);
      }
    }
    if (payment_status && ['pending','paid','failed'].includes(payment_status)) {
      db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(payment_status, o.id);
    }
  });
  txn();
  res.json({ ok: true });
});

// ---- Partners ----
router.get('/partners', (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.referral_code, u.status, u.created_at,
      (SELECT COUNT(*) FROM clicks WHERE referral_code = u.referral_code) AS clicks,
      (SELECT COUNT(DISTINCT order_id) FROM commissions WHERE partner_id = u.id) AS sales,
      (SELECT COALESCE(SUM(amount),0) FROM commissions WHERE partner_id = u.id AND status IN ('approved','paid')) AS earned
    FROM users u WHERE u.role = 'partner' ORDER BY u.id DESC`).all();
  res.json(rows);
});

router.put('/partners/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['active','suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare("UPDATE users SET status = ? WHERE id = ? AND role = 'partner'").run(status, req.params.id);
  res.json({ ok: true });
});

// ---- Withdrawals ----
router.get('/withdrawals', (req, res) => {
  const status = req.query.status;
  let sql = `SELECT w.*, u.name AS partner_name, u.email AS partner_email FROM withdrawals w
    JOIN users u ON u.id = w.partner_id`;
  const params = [];
  if (status && ['pending','approved','rejected','paid'].includes(status)) { sql += ' WHERE w.status = ?'; params.push(status); }
  sql += ' ORDER BY w.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...params));
});

router.put('/withdrawals/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['pending','approved','rejected','paid'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found.' });
  db.prepare('UPDATE withdrawals SET status = ? WHERE id = ?').run(status, w.id);
  // When marked paid, mark matching approved commissions as paid (FIFO up to amount)
  if (status === 'paid') {
    const comms = db.prepare("SELECT id, amount FROM commissions WHERE partner_id = ? AND status = 'approved' ORDER BY id LIMIT 500").all(w.partner_id);
    let remaining = w.amount;
    for (const c of comms) {
      if (remaining <= 0) break;
      db.prepare("UPDATE commissions SET status = 'paid' WHERE id = ?").run(c.id);
      remaining -= c.amount;
    }
  }
  res.json({ ok: true });
});

// ---- Settings ----
const SETTING_KEYS = ['site_name','shipping_fee','min_withdrawal','jazzcash_number','jazzcash_title',
  'easypaisa_number','easypaisa_title','stripe_publishable_key','announcement'];

router.get('/settings', (req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k, k === 'site_name' ? 'MyStore' : k === 'shipping_fee' ? '200' : k === 'min_withdrawal' ? '1000' : '');
  res.json(out);
});

router.put('/settings', (req, res) => {
  const b = req.body || {};
  for (const k of SETTING_KEYS) {
    if (b[k] !== undefined) setSetting(k, String(b[k]).slice(0, 500));
  }
  res.json({ ok: true });
});

module.exports = router;
