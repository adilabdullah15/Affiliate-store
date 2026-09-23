// seed.js — creates admin user, default settings, and 6 sample products. Run: npm run seed
const bcrypt = require('bcryptjs');
const { db, setSetting, uniqueSlug } = require('./db');

console.log('Seeding database...');

// Admin user (CHANGE THE PASSWORD after first login)
const adminEmail = 'admin@store.com';
if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) {
  db.prepare(`INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`)
    .run('Store Admin', adminEmail, '03000000000', bcrypt.hashSync('changeme123', 10));
  console.log('  admin user created: admin@store.com / changeme123  <-- CHANGE THIS PASSWORD');
} else {
  console.log('  admin user already exists, skipping');
}

// Default settings
const defaults = {
  site_name: 'MyStore',
  shipping_fee: '200',
  min_withdrawal: '1000',
  jazzcash_number: '',
  jazzcash_title: '',
  easypaisa_number: '',
  easypaisa_title: '',
  stripe_publishable_key: '',
  announcement: 'Free delivery on orders over PKR 5,000!'
};
for (const [k, v] of Object.entries(defaults)) {
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k)) setSetting(k, v);
}
console.log('  settings seeded');

// Sample products (placeholder images from picsum.photos)
const products = [
  {
    name: 'Wireless Bluetooth Earbuds Pro', category: 'Electronics',
    description: 'Crystal-clear sound, deep bass, 36-hour battery case, touch controls and noise reduction. Perfect for music, calls and gaming.',
    price: 3499, old_price: 4999, commission_percent: 15, stock: 120,
    images: ['https://picsum.photos/seed/earbuds1/800/800', 'https://picsum.photos/seed/earbuds2/800/800']
  },
  {
    name: 'Smart Fitness Watch X2', category: 'Electronics',
    description: 'Heart-rate + SpO2 monitoring, 100+ sport modes, 10-day battery, 1.85" HD display. Your personal trainer on your wrist.',
    price: 5999, old_price: 7999, commission_percent: 12, stock: 80,
    images: ['https://picsum.photos/seed/watch1/800/800', 'https://picsum.photos/seed/watch2/800/800']
  },
  {
    name: 'Organic Glow Face Serum', category: 'Beauty',
    description: 'Vitamin C + hyaluronic acid serum for bright, hydrated skin. Dermatologist tested, suitable for all skin types. 30ml bottle.',
    price: 1899, old_price: 2499, commission_percent: 20, stock: 200,
    images: ['https://picsum.photos/seed/serum1/800/800', 'https://picsum.photos/seed/serum2/800/800']
  },
  {
    name: 'Stainless Steel Water Bottle 1L', category: 'Home & Kitchen',
    description: 'Double-wall vacuum insulated bottle. Keeps drinks cold 24h / hot 12h. Leak-proof, BPA-free, matte finish.',
    price: 1499, old_price: 1999, commission_percent: 18, stock: 300,
    images: ['https://picsum.photos/seed/bottle1/800/800', 'https://picsum.photos/seed/bottle2/800/800']
  },
  {
    name: 'Men\'s Premium Cotton Hoodie', category: 'Fashion',
    description: 'Heavy 400 GSM fleece hoodie, ultra-soft brushed interior. Available in black, grey and navy. Sizes M–XXL.',
    price: 2299, old_price: 2999, commission_percent: 15, stock: 150,
    images: ['https://picsum.photos/seed/hoodie1/800/800', 'https://picsum.photos/seed/hoodie2/800/800']
  },
  {
    name: 'LED Ring Light with Tripod Stand', category: 'Electronics',
    description: '10-inch dimmable ring light, 3 color modes, 2.1m tripod, phone holder + Bluetooth remote. Ideal for TikTok, reels & live selling.',
    price: 2799, old_price: 3599, commission_percent: 15, stock: 90,
    images: ['https://picsum.photos/seed/ringlight1/800/800', 'https://picsum.photos/seed/ringlight2/800/800']
  }
];

let added = 0;
for (const p of products) {
  if (db.prepare('SELECT 1 FROM products WHERE name = ?').get(p.name)) continue;
  const slug = uniqueSlug(p.name);
  db.prepare(`INSERT INTO products (name, slug, description, price, old_price, commission_percent, images, stock, category, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .run(p.name, slug, p.description, p.price, p.old_price, p.commission_percent,
      JSON.stringify(p.images), p.stock, p.category);
  added++;
}
console.log(`  ${added} sample products added`);
console.log('\nDone. Start the server with: npm start');
