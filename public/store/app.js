// store/app.js — public storefront logic.
(function () {
  'use strict';
  let SETTINGS = { site_name: 'MyStore', shipping_fee: 200 };
  let PRODUCTS = [];
  let activeCat = '';
  let searchQ = '';
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch (e) { cart = []; }

  /* ---------- Referral capture ---------- */
  (function captureRef() {
    const params = new URLSearchParams(location.search);
    const ref = (params.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (ref) {
      try {
        localStorage.setItem('aff_ref', JSON.stringify({ code: ref, exp: Date.now() + 30 * 864e5 }));
        const pid = params.get('product');
        fetch('/api/track-click', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_code: ref, product_id: pid ? Number(pid) : null })
        }).catch(() => {});
        toast('🎉 You are shopping via a partner link — enjoy!');
      } catch (e) {}
    }
  })();
  function getRef() {
    try {
      const r = JSON.parse(localStorage.getItem('aff_ref') || 'null');
      if (r && r.exp > Date.now()) return r.code;
    } catch (e) {}
    return null;
  }

  /* ---------- Data ---------- */
  async function load() {
    try {
      SETTINGS = await api('/api/settings');
      applySettings();
      const [cats, prods] = await Promise.all([api('/api/categories'), api('/api/products')]);
      PRODUCTS = prods;
      renderCats(cats);
      renderProducts();
    } catch (e) {
      $('#productsGrid').innerHTML = `<div class="empty"><div class="big">😕</div>Could not load products. Please refresh.</div>`;
    }
  }
  function applySettings() {
    document.title = SETTINGS.site_name + ' — Online Shopping in Pakistan';
    ['siteName', 'footName', 'footName2'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = SETTINGS.site_name; });
    const bar = $('#announceBar');
    if (SETTINGS.announcement) { bar.textContent = '📢 ' + SETTINGS.announcement; bar.style.display = 'block'; }
    $('#year').textContent = new Date().getFullYear();
  }

  /* ---------- Categories & products ---------- */
  function renderCats(cats) {
    const box = $('#catChips');
    box.innerHTML = `<button class="chip${!activeCat ? ' active' : ''}" data-c="">All</button>` +
      cats.map(c => `<button class="chip${activeCat === c ? ' active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    $$('.chip', box).forEach(ch => ch.onclick = () => { activeCat = ch.dataset.c; renderCats(cats); fetchProducts(); });
  }
  async function fetchProducts() {
    const qs = new URLSearchParams();
    if (activeCat) qs.set('category', activeCat);
    if (searchQ) qs.set('q', searchQ);
    PRODUCTS = await api('/api/products?' + qs.toString());
    renderProducts();
  }
  function discount(p) {
    if (p.old_price && p.old_price > p.price) return Math.round((1 - p.price / p.old_price) * 100);
    return 0;
  }
  function renderProducts() {
    const g = $('#productsGrid');
    if (!PRODUCTS.length) { g.innerHTML = `<div class="empty"><div class="big">🛍️</div>No products found.</div>`; return; }
    g.innerHTML = PRODUCTS.map((p, i) => `
      <div class="p-card" style="animation-delay:${Math.min(i * 0.05, 0.4)}s" onclick="Store.openProduct('${p.slug}')">
        <div class="p-img">
          ${discount(p) ? `<span class="p-off">-${discount(p)}%</span>` : ''}
          <img src="${esc(p.images[0] || '')}" alt="${esc(p.name)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22800%22><rect width=%22800%22 height=%22800%22 fill=%22%23e8e4f3%22/><text x=%22400%22 y=%22400%22 font-size=%2260%22 text-anchor=%22middle%22 fill=%22%236c3ce0%22>📦</text></svg>'">
        </div>
        <div class="p-body">
          <div class="p-name">${esc(p.name)}</div>
          <div><span class="p-price">${fmtPKR(p.price)}</span> ${p.old_price > p.price ? `<span class="p-old">${fmtPKR(p.old_price)}</span>` : ''}</div>
          <div class="p-add"><button class="btn btn-sm btn-block" onclick="event.stopPropagation();Store.addToCart(${p.id})">Add to Cart 🛒</button></div>
        </div>
      </div>`).join('');
  }

  /* ---------- Product modal ---------- */
  let galleryIdx = 0, galleryImgs = [];
  function openProduct(slug) {
    const p = PRODUCTS.find(x => x.slug === slug);
    if (!p) return;
    galleryImgs = p.images.length ? p.images : [''];
    galleryIdx = 0;
    openModal(`
      <div class="grid grid-2 grid-1-m" style="gap:18px">
        <div>
          <img class="gallery-main" id="galMain" src="${esc(galleryImgs[0])}" alt="${esc(p.name)}">
          <div class="gallery-thumbs" id="galThumbs">
            ${galleryImgs.map((im, i) => `<img src="${esc(im)}" class="${i === 0 ? 'active' : ''}" data-i="${i}" alt="">`).join('')}
          </div>
          ${p.video_url ? `<a class="btn btn-outline btn-sm btn-block mt-2" href="${esc(p.video_url)}" target="_blank" rel="noopener">▶ Watch Video</a>` : ''}
        </div>
        <div>
          <h2>${esc(p.name)}</h2>
          <div class="mt-1"><span class="p-price" style="font-size:24px">${fmtPKR(p.price)}</span>
            ${p.old_price > p.price ? `<span class="p-old">${fmtPKR(p.old_price)}</span> <span class="badge badge-pending">Save ${discount(p)}%</span>` : ''}</div>
          <p class="text-sm text-muted mt-1">📦 ${p.stock > 0 ? 'In Stock' : 'Out of Stock'} · ${esc(p.category)}</p>
          <p class="mt-2">${esc(p.description).replace(/\n/g, '<br>')}</p>
          <div class="flex gap-2 mt-2" style="align-items:center">
            <div class="qty-ctrl">
              <button onclick="Store.galQty(-1)">−</button><b id="galQty">1</b><button onclick="Store.galQty(1)">+</button>
            </div>
            <button class="btn" style="flex:1" ${p.stock < 1 ? 'disabled' : ''} onclick="Store.addToCart(${p.id}, Store._gq||1);closeModal();Store.openCart()">Add to Cart 🛒</button>
          </div>
          <button class="btn btn-accent btn-block mt-2" ${p.stock < 1 ? 'disabled' : ''} onclick="Store.addToCart(${p.id}, Store._gq||1);closeModal();Store.checkout()">Buy Now ⚡</button>
        </div>
      </div>`);
    Store._gq = 1;
    $$('#galThumbs img').forEach(t => t.onclick = () => {
      galleryIdx = Number(t.dataset.i);
      $('#galMain').src = galleryImgs[galleryIdx];
      $$('#galThumbs img').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
  }

  /* ---------- Cart ---------- */
  function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateBadge();
  }
  function updateBadge() {
    const n = cart.reduce((s, i) => s + i.qty, 0);
    const b = $('#cartCount');
    b.style.display = n ? 'flex' : 'none';
    b.textContent = n;
  }
  function addToCart(id, qty) {
    qty = Math.max(1, qty || 1);
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    const ex = cart.find(i => i.id === id);
    if (ex) ex.qty = Math.min(99, ex.qty + qty); else cart.push({ id: p.id, qty });
    saveCart();
    toast(`✅ ${p.name} added to cart`);
  }
  function cartDetailed() {
    return cart.map(i => {
      const p = PRODUCTS.find(x => x.id === i.id);
      return p ? { ...i, name: p.name, price: p.price, img: p.images[0] || '', stock: p.stock } : null;
    }).filter(Boolean);
  }
  function openCart() {
    const items = cartDetailed();
    const sub = items.reduce((s, i) => s + i.price * i.qty, 0);
    $('#drawerRoot').innerHTML = `
      <div class="drawer-backdrop" onclick="Store.closeCart()"></div>
      <div class="drawer">
        <div class="drawer-head"><h2>🛒 Your Cart (${items.reduce((s, i) => s + i.qty, 0)})</h2><button class="modal-close" onclick="Store.closeCart()">✕</button></div>
        <div class="drawer-body">
          ${items.length ? items.map(i => `
            <div class="cart-item">
              <img src="${esc(i.img)}" alt="">
              <div style="flex:1">
                <div style="font-weight:700;font-size:14px">${esc(i.name)}</div>
                <div class="text-sm" style="color:var(--primary);font-weight:700">${fmtPKR(i.price)}</div>
                <div class="qty-ctrl mt-1">
                  <button onclick="Store.chQty(${i.id},-1)">−</button><b>${i.qty}</b><button onclick="Store.chQty(${i.id},1)">+</button>
                  <button class="btn-sm" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px" onclick="Store.rmItem(${i.id})">Remove</button>
                </div>
              </div>
              <b>${fmtPKR(i.price * i.qty)}</b>
            </div>`).join('') : `<div class="empty"><div class="big">🛒</div>Your cart is empty.</div>`}
        </div>
        ${items.length ? `<div class="drawer-foot">
          <div class="flex-between mb-2"><span class="text-muted">Subtotal</span><b>${fmtPKR(sub)}</b></div>
          <button class="btn btn-accent btn-block" onclick="Store.closeCart();Store.checkout()">Proceed to Checkout →</button>
        </div>` : ''}
      </div>`;
    document.body.style.overflow = 'hidden';
  }
  function closeCart() { $('#drawerRoot').innerHTML = ''; document.body.style.overflow = ''; }

  /* ---------- Checkout ---------- */
  let payMethod = 'cod';
  function showView(id) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#' + id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function checkout() {
    if (!cart.length) { toast('Your cart is empty'); return; }
    renderPayMethods();
    renderSummary();
    showView('view-checkout');
  }
  function renderPayMethods() {
    const methods = [
      { id: 'cod', t: '💵 Cash on Delivery', d: 'Pay in cash when your order arrives at your doorstep.' },
      { id: 'card', t: '💳 Debit / Credit Card', d: SETTINGS.stripe_configured ? 'Pay securely online with your card.' : 'Coming soon — not enabled yet.', disabled: !SETTINGS.stripe_configured },
      { id: 'jazzcash', t: '📱 JazzCash', d: 'Transfer to our JazzCash account, then place your order.' },
      { id: 'easypaisa', t: '📱 Easypaisa', d: 'Transfer to our Easypaisa account, then place your order.' }
    ];
    $('#payMethods').innerHTML = methods.map(m => `
      <label class="pay-opt ${payMethod === m.id ? 'selected' : ''} ${m.disabled ? 'text-muted' : ''}" style="${m.disabled ? 'opacity:.55' : ''}">
        <input type="radio" name="pay" value="${m.id}" ${payMethod === m.id ? 'checked' : ''} ${m.disabled ? 'disabled' : ''}>
        <div><div class="t">${m.t}</div><div class="d">${m.d}</div></div>
      </label>`).join('');
    $$('#payMethods input').forEach(r => r.onchange = () => { payMethod = r.value; renderPayMethods(); renderPayInfo(); });
    renderPayInfo();
  }
  function renderPayInfo() {
    const box = $('#payInfo');
    if (payMethod === 'jazzcash' && SETTINGS.jazzcash_number) {
      box.innerHTML = `📲 Send <b>${fmtPKR(cartTotal() + SETTINGS.shipping_fee)}</b> to JazzCash <b>${esc(SETTINGS.jazzcash_number)}</b> (${esc(SETTINGS.jazzcash_title || 'MyStore')}), then place your order. Mention your name in the transfer note.`;
      box.classList.add('show');
    } else if (payMethod === 'easypaisa' && SETTINGS.easypaisa_number) {
      box.innerHTML = `📲 Send <b>${fmtPKR(cartTotal() + SETTINGS.shipping_fee)}</b> to Easypaisa <b>${esc(SETTINGS.easypaisa_number)}</b> (${esc(SETTINGS.easypaisa_title || 'MyStore')}), then place your order. Mention your name in the transfer note.`;
      box.classList.add('show');
    } else box.classList.remove('show');
  }
  function cartTotal() { return cartDetailed().reduce((s, i) => s + i.price * i.qty, 0); }
  function renderSummary() {
    const items = cartDetailed();
    $('#coItems').innerHTML = items.map(i => `
      <div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
        <span class="text-sm">${esc(i.name)} <span class="text-muted">× ${i.qty}</span></span><b>${fmtPKR(i.price * i.qty)}</b>
      </div>`).join('');
    const sub = cartTotal(), ship = SETTINGS.shipping_fee;
    $('#coSubtotal').textContent = fmtPKR(sub);
    $('#coShipping').textContent = fmtPKR(ship);
    $('#coTotal').textContent = fmtPKR(sub + ship);
  }
  async function placeOrder() {
    const err = $('#coError'); err.innerHTML = '';
    const body = {
      customer_name: $('#coName').value.trim(),
      phone: $('#coPhone').value.trim(),
      address: $('#coAddress').value.trim(),
      city: $('#coCity').value.trim(),
      items: cart.map(i => ({ product_id: i.id, qty: i.qty })),
      payment_method: payMethod,
      referral_code: getRef()
    };
    const btn = $('#placeOrderBtn');
    btn.disabled = true; btn.textContent = 'Placing order...';
    try {
      const r = await api('/api/orders', { method: 'POST', body: JSON.stringify(body) });
      cart = []; saveCart();
      $('#successOrderId').textContent = '#' + r.order_id;
      $('#successTotal').textContent = fmtPKR(r.total);
      showView('view-success');
    } catch (e) {
      err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      btn.disabled = false; btn.textContent = 'Place Order →';
    }
  }

  /* ---------- Events ---------- */
  let searchT;
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchT);
    searchT = setTimeout(() => { searchQ = e.target.value.trim(); fetchProducts(); }, 350);
  });
  $('#cartBtn').onclick = openCart;
  $('#backToShop').onclick = () => showView('view-shop');
  $('#successShopBtn').onclick = () => showView('view-shop');
  $('#logoHome').onclick = e => { e.preventDefault(); showView('view-shop'); };
  $('#placeOrderBtn').onclick = placeOrder;

  window.Store = { openProduct, addToCart, openCart, closeCart, checkout, galQty: d => { Store._gq = Math.max(1, (Store._gq || 1) + d); $('#galQty').textContent = Store._gq; }, chQty: (id, d) => { const i = cart.find(x => x.id === id); if (i) { i.qty += d; if (i.qty < 1) cart = cart.filter(x => x.id !== id); saveCart(); openCart(); } }, rmItem: id => { cart = cart.filter(x => x.id !== id); saveCart(); openCart(); } };

  load();
})();
