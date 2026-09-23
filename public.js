// routes/public.js — public store API: products, settings, orders, click tracking.
const express = require('express');
const { db, getSetting, transaction, runResult } = require('../db');
const router = express.Router();

function publicSettings() {
  return {
    site_name: getSetting('site_name', 'MyStore'),
    shipping_fee: Number(getSetting('shipping_fee', '200')),
    jazzcash_number: getSetting('jazzcash_number', ''),
    jazzcash_title: getSetting('jazzcash_title', ''),
    easypaisa_number: getSetting('easypaisa_number', ''),
    easypaisa_title: getSetting('easypaisa_title', ''),
    stripe_configured: getSetting('stripe_publishable_key', '') !== ''
  };
}

function parseImages(p) {
  try { const a = JSON.parse(p.images || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

function productPublic(p) {
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description,
    price: p.price, old_price: p.old_price, commission_percent: p.commission_percent,
    images: parseImages(p), video_url: p.video_url, stock: p.stock,
    category: p.category, created_at: p.created_at
  };
}

// Public settings (safe subset)
router.get('/settings', (req, res) => res.json(publicSettings()));

// Active products
router.get('/products', (req, res) => {
  const q = (req.query.q || '').trim();
  const cat = (req.query.category || '').trim();
  let sql = 'SELECT * FROM products WHERE active = 1';
  const params = [];
  if (cat) { sql += ' AND category = ?'; params.push(cat); }
  if (q) { sql += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(productPublic));
});

router.get('/products/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json(productPublic(p));
});

router.get('/categories', (req, res) => {
  const rows = db.prepare("SELECT DISTINCT category FROM products WHERE active = 1 AND category <> '' ORDER BY category").all();
  res.json(rows.map(r => r.category));
});

// Track a referral click (fire-and-forget from the storefront)
router.post('/track-click', (req, res) => {
  const { referral_code, product_id } = req.body || {};
  if (referral_code && /^[A-Z0-9]{4,12}$/.test(String(referral_code))) {
    db.prepare('INSERT INTO clicks (referral_code, product_id, ip) VALUES (?, ?, ?)')
      .run(String(referral_code).toUpperCase(), product_id ? Number(product_id) : null, req.ip);
  }
  res.json({ ok: true });
});

// Place an order
router.post('/orders', (req, res) => {
  const { customer_name, phone, address, city, items, payment_method, referral_code } = req.body || {};

  if (!customer_name || String(customer_name).trim().length < 3)
    return res.status(400).json({ error: 'Please enter your full name.' });
  if (!phone || !/^0?3\d{9}$/.test(String(phone).replace(/[\s-]/g, '')))
    return res.status(400).json({ error: 'Please enter a valid mobile number (e.g. 03001234567).' });
  if (!address || String(address).trim().length < 5)
    return res.status(400).json({ error: 'Please enter your complete address.' });
  if (!city || String(city).trim().length < 2)
    return res.status(400).json({ error: 'Please enter your city.' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'Your cart is empty.' });

  const allowedPayments = ['cod', 'card', 'jazzcash', 'easypaisa'];
  const pm = allowedPayments.includes(payment_method) ? payment_method : 'cod';
  if (pm === 'card' && getSetting('stripe_publishable_key', '') === '')
    return res.status(400).json({ error: 'Card payments are not enabled yet. Please choose another method.' });

  // Validate items against live product data (price taken from DB, never client)
  let subtotal = 0;
  const orderItems = [];
  for (const it of items) {
    const pid = Number(it.product_id);
    const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
    if (!pid) return res.status(400).json({ error: 'Invalid cart item.' });
    const p = db.prepare('SELECT id, name, price, stock, active FROM products WHERE id = ?').get(pid);
    if (!p || !p.active) return res.status(400).json({ error: `Product unavailable.` });
    if (p.stock < qty) return res.status(400).json({ error: `"${p.name}" only has ${p.stock} in stock.` });
    subtotal += p.price * qty;
    orderItems.push({ product_id: p.id, name: p.name, price: p.price, qty });
  }

  const shippingFee = Number(getSetting('shipping_fee', '200'));
  const total = subtotal + shippingFee;

  // Referral attribution
  let refCode = referral_code ? String(referral_code).toUpperCase().trim() : null;
  let partner = refCode ? db.prepare("SELECT id FROM users WHERE referral_code = ? AND role = 'partner' AND status = 'active'").get(refCode) : null;
  if (!partner) refCode = null;

  const insertOrder = () => transaction(() => {
    const info = runResult(db.prepare(`INSERT INTO orders
      (customer_name, phone, address, city, items, subtotal, shipping_fee, total, payment_method, referral_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(customer_name.trim(), phone.trim(), address.trim(), city.trim(),
        JSON.stringify(orderItems), subtotal, shippingFee, total, pm, refCode));
    const orderId = info.lastInsertRowid;

    let commissionTotal = 0;
    if (partner) {
      for (const it of orderItems) {
        const p = db.prepare('SELECT commission_percent FROM products WHERE id = ?').get(it.product_id);
        const amt = Math.round(it.price * it.qty * (Number(p.commission_percent) || 0)) / 100;
        if (amt > 0) {
          db.prepare('INSERT INTO commissions (partner_id, order_id, product_id, amount) VALUES (?, ?, ?, ?)')
            .run(partner.id, orderId, it.product_id, amt);
          commissionTotal += amt;
        }
      }
      db.prepare('UPDATE orders SET commission_earned = ? WHERE id = ?').run(commissionTotal, orderId);
    }
    for (const it of orderItems) {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(it.qty, it.product_id);
    }
    return { orderId, commissionTotal };
  });

  try {
    const { orderId } = insertOrder();
    res.json({ ok: true, order_id: orderId, total });
  } catch (e) {
    res.status(500).json({ error: 'Could not place order. Please try again.' });
  }
});

router.get('/orders/:id', (req, res) => {
  const o = db.prepare('SELECT id, customer_name, city, total, payment_method, payment_status, order_status, created_at FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  res.json(o);
});

module.exports = router;
