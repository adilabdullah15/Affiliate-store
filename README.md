# Affiliate E-Commerce Platform 🛍️🤝

A complete, fast, mobile-friendly affiliate e-commerce system for Pakistan (PKR).
One Node.js server powers **three sections**:

| Section | URL | Purpose |
|---|---|---|
| 🏪 Store | `/` | Public e-commerce shop — products, cart, checkout (COD / Card / JazzCash / Easypaisa) |
| 🤝 Affiliate Portal | `/affiliate` | Partner signup, referral links, media kit, earnings wallet, withdrawals |
| ⚙️ Admin Panel | `/admin` | Dashboard, products CRUD, orders, partners, withdrawals, settings |

No build step. Vanilla HTML/CSS/JS frontends, Express + SQLite backend.

---

## 1. Quick Start (local)

**Requirements:** Node.js 18+

```bash
cd affiliate-ecommerce
npm install        # install dependencies
npm run seed       # create admin user, settings, 6 sample products
npm start          # start the server
```

Open:
- Store → http://localhost:3000/
- Affiliate portal → http://localhost:3000/affiliate
- Admin → http://localhost:3000/admin (login: `admin@store.com` / `changeme123`)

> ⚠️ **Change the admin password immediately** after first login (there is no UI for it yet —
> easiest way: delete `data.sqlite`, edit the password in `seed.js`, and re-run `npm run seed`).

The SQLite database file `data.sqlite` is created automatically in the project folder.

---

## 2. Project Structure

```
affiliate-ecommerce/
├── server.js              # Express app: API + static routes (/, /affiliate, /admin)
├── db.js                  # SQLite setup, schema, helpers (settings, slugs, referral codes)
├── seed.js                # Seed script: admin user, settings, 6 sample products
├── package.json
├── routes/
│   ├── public.js          # Store API: products, order placement, click tracking
│   ├── auth.js            # Signup / login / logout / session
│   ├── affiliate.js       # Partner-only API: stats, links, wallet, withdrawals
│   └── admin.js           # Admin-only API: dashboard, products, orders, partners, settings
└── public/
    ├── shared/
    │   ├── style.css      # Shared design system (mobile-first, animated)
    │   └── app.js         # Shared JS helpers (api, toast, modal, fmtPKR)
    ├── store/             # Public storefront (index.html, app.js)
    ├── affiliate/         # Partner portal (index.html, app.js)
    └── admin/             # Admin panel (index.html, app.js)
```

---

## 3. How It Works

### Referral tracking
- Partner shares `https://yourstore.com/?ref=ABC123` (or `?ref=ABC123&product=slug` for a direct product link).
- The store saves the code for **30 days** (localStorage) and fires `/api/track-click`.
- On checkout, the code is attached to the order; commission = `price × qty × commission%` per product, recorded in the `commissions` table as **pending**.
- When admin marks the order **delivered**, commissions become **approved** → they count toward the partner's withdrawable balance.
- Minimum withdrawal is configurable in Settings (default **PKR 1,000**).
- When admin marks a withdrawal **paid**, matching approved commissions are marked **paid** (FIFO).

### Payments on the store
- **Cash on Delivery** — always available.
- **JazzCash / Easypaisa** — enter your account numbers + titles in Admin → Settings; customers see transfer instructions at checkout.
- **Debit/Credit Card (Stripe)** — paste your Stripe **publishable key** in Settings to enable it. The checkout currently collects the order and marks card payment as *pending*; to capture real payments, integrate Stripe Elements / Payment Intents in `public/store/app.js` (search for `stripe_configured`) and confirm via webhook in `routes/public.js`. Until then the option stays hidden ("coming soon").

### Short referral links
`/r/ABC123` sets the referral cookie and redirects to the store — handy for TikTok bios.

---

## 4. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `SESSION_SECRET` | `change-this-session-secret-in-production` | **Must** be set to a long random string in production |
| `DB_PATH` | `./data.sqlite` | SQLite file location |

Example:
```bash
SESSION_SECRET="a-very-long-random-string" PORT=3000 npm start
```

---

## 5. Deploy on a VPS (Ubuntu)

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx

# 2. Copy the project, install, seed
cd /var/www/affiliate-ecommerce
npm install --omit=dev
npm run seed

# 3. Run forever with pm2
sudo npm i -g pm2
SESSION_SECRET="$(openssl rand -hex 32)" pm2 start server.js --name store
pm2 save && pm2 startup   # follow the printed instructions

# 4. Nginx reverse proxy (/etc/nginx/sites-available/store)
server {
  listen 80;
  server_name yourstore.com www.yourstore.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
sudo ln -s /etc/nginx/sites-available/store /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. Free HTTPS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourstore.com -d www.yourstore.com
```

### Subdomain for the affiliate portal (partners.yourstore.com)
Point the subdomain's DNS (A record) to the same server, then add a second Nginx server block:

```nginx
server {
  listen 80;
  server_name partners.yourstore.com;
  location / {
    proxy_pass http://127.0.0.1:3000/affiliate/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Then `sudo certbot --nginx -d partners.yourstore.com`. The portal's referral links use
`location.origin`, so set them to the main store domain in production — partners share
`https://yourstore.com/?ref=CODE` links while logging in at the subdomain.

### Shared hosting (cPanel)
Most shared hosts don't run Node.js well. Prefer a small VPS (Hostinger, Hetzner, Contabo —
$4–6/mo is enough). If your host offers "Setup Node.js App" in cPanel, point the app's
startup file to `server.js` and set the env vars above.

---

## 6. Admin Guide (first 10 minutes)

1. Login at `/admin` → **Settings**: set site name, shipping fee, min withdrawal, JazzCash/Easypaisa numbers.
2. **Products** → Add Product: name, price, commission %, photos (image URLs), video URL, stock.
3. Share `/affiliate` with partners — they sign up and get referral codes instantly.
4. **Orders**: confirm → ship → deliver. Commissions auto-approve on delivery.
5. **Withdrawals**: approve partner payouts, pay them via bank/JazzCash/Easypaisa, then **Mark Paid**.

## 7. Security Notes

- All SQL uses parameterized queries (`better-sqlite3`).
- Passwords hashed with bcrypt (10 rounds).
- Sessions are HTTP-only cookies; set `SESSION_SECRET` in production.
- Change the default admin password before going live.
- For production hardening consider: rate-limiting login endpoints, HTTPS-only cookies (`secure: true` behind HTTPS), and regular `data.sqlite` backups.

---

Built for speed: no frameworks on the frontend, no build step, SQLite for zero-config data.
