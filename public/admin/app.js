// admin/app.js — admin panel logic.
(function () {
  'use strict';
  let orderFilter = '', wdFilter = 'pending';

  /* ---------- Auth ---------- */
  $('#adLoginBtn').onclick = doLogin;
  $('#adPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  async function doLogin() {
    const err = $('#loginError'); err.innerHTML = '';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#adEmail').value.trim(), password: $('#adPass').value }) });
      if (r.user.role !== 'admin') { await api('/api/auth/logout', { method: 'POST' }); throw new Error('Admin access only.'); }
      enter();
    } catch (e) { err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  }
  $('#logoutBtn').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); };

  async function boot() {
    try {
      const me = await api('/api/auth/me');
      if (me.user && me.user.role === 'admin') enter(); else showLogin();
    } catch (e) { showLogin(); }
  }
  function showLogin() { $('#loginView').style.display = 'flex'; $('#appView').style.display = 'none'; }
  function enter() {
    $('#loginView').style.display = 'none';
    $('#appView').style.display = 'flex';
    loadDash(); loadProducts(); loadOrders(); loadPartners(); loadWithdrawals(); loadSettings();
  }

  /* ---------- Nav ---------- */
  $$('.nav-btn[data-v]').forEach(b => b.onclick = () => {
    $$('.nav-btn[data-v]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    ['dash', 'products', 'orders', 'partners', 'withdrawals', 'settings'].forEach(v => $('#v-' + v).classList.toggle('active', v === b.dataset.v));
    $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show');
    window.scrollTo({ top: 0 });
  });
  $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); };
  $('#scrim').onclick = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); };

  /* ---------- Dashboard ---------- */
  async function loadDash() {
    try {
      const d = await api('/api/admin/dashboard');
      const cards = [
        ['💰', 'Revenue', fmtPKR(d.revenue)],
        ['🧾', 'Orders', d.ordersCount],
        ['🤝', 'Partners', d.partners],
        ['💸', 'Pending Withdrawals', d.pendingWd]
      ];
      $('#dashStats').innerHTML = cards.map(c => `<div class="stat-card"><div style="font-size:26px">${c[0]}</div><div class="num">${c[2]}</div><div class="label">${c[1]}</div></div>`).join('');
      $('#dashOrders').innerHTML = d.recentOrders.map(o => `<tr><td>#${o.id}</td><td>${esc(o.customer_name)}</td><td><b>${fmtPKR(o.total)}</b></td><td><span class="badge badge-${o.order_status}">${o.order_status}</span></td></tr>`).join('') || `<tr><td colspan="4" class="text-center text-muted">No orders yet.</td></tr>`;
      $('#topProds').innerHTML = d.topProducts.length ? d.topProducts.map(p => `<div class="flex-between" style="padding:8px 0;border-bottom:1px solid var(--border)"><span class="text-sm">${esc(p.name)}</span><b>${p.qty} sold</b></div>`).join('') : `<p class="text-muted text-sm">No sales yet.</p>`;
      drawBars($('#revChart'), d.salesByDay.map(r => ({ label: r.d.slice(5), value: r.s })), '#6c3ce0');
      if (d.pendingOrders) { $('#ordBadge').style.display = 'inline-block'; $('#ordBadge').textContent = d.pendingOrders; }
      if (d.pendingWd) { $('#wdBadge').style.display = 'inline-block'; $('#wdBadge').textContent = d.pendingWd; }
    } catch (e) { toast('Dashboard failed: ' + e.message); }
  }
  function drawBars(cv, data, color) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const map = {}; data.forEach(r => map['2026-' + r.label] = r.value);
    // labels are MM-DD; rebuild map on MM-DD
    const m2 = {}; data.forEach(r => m2[r.label] = r.value);
    const vals = days.map(d => m2[d.slice(5)] || 0);
    const max = Math.max(1, ...vals), bw = W / 14;
    vals.forEach((v, i) => {
      const h = (v / max) * (H - 46), x = i * bw + bw * 0.2, y = H - 26 - h;
      const g = ctx.createLinearGradient(0, y, 0, H - 26);
      g.addColorStop(0, color); g.addColorStop(1, '#d9cbf7');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, bw * 0.6, h, 4); ctx.fill();
      ctx.fillStyle = '#6b6480'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(days[i].slice(5), x + bw * 0.3, H - 10);
    });
  }

  /* ---------- Products ---------- */
  async function loadProducts() {
    try {
      const prods = await api('/api/admin/products');
      $('#prodBody').innerHTML = prods.map(p => `
        <tr>
          <td><img class="p-thumb" src="${esc((p.images[0] || ''))}" onerror="this.style.display='none'"></td>
          <td style="white-space:normal;min-width:160px"><b>${esc(p.name)}</b><br><span class="text-sm text-muted">${esc(p.category)}</span></td>
          <td><b>${fmtPKR(p.price)}</b>${p.old_price ? `<br><span class="text-sm text-muted" style="text-decoration:line-through">${fmtPKR(p.old_price)}</span>` : ''}</td>
          <td>${p.commission_percent}%</td><td>${p.stock}</td>
          <td><span class="badge ${p.active ? 'badge-active' : 'badge-cancelled'}">${p.active ? 'Active' : 'Hidden'}</span></td>
          <td><button class="btn btn-sm btn-outline" onclick="Admin.editProduct(${p.id})">Edit</button>
          <button class="btn btn-sm" style="background:var(--danger)" onclick="Admin.delProduct(${p.id})">Delete</button></td>
        </tr>`).join('') || `<tr><td colspan="7" class="text-center text-muted">No products. Add your first one! 📦</td></tr>`;
      Admin._products = prods;
    } catch (e) { toast('Products failed: ' + e.message); }
  }
  $('#addProdBtn').onclick = () => productForm(null);
  function productForm(p) {
    const isNew = !p; p = p || { name: '', price: '', old_price: '', commission_percent: 15, description: '', category: 'General', stock: 100, images: [], video_url: '', active: 1 };
    openModal(`
      <h2>${isNew ? 'Add Product' : 'Edit Product'}</h2>
      <div id="pfErr" class="mt-1"></div>
      <div class="field mt-1"><label>Name *</label><input class="input" id="pfName" value="${esc(p.name)}"></div>
      <div class="grid grid-2 grid-1-m">
        <div class="field"><label>Price (PKR) *</label><input class="input" id="pfPrice" type="number" value="${p.price}"></div>
        <div class="field"><label>Old Price (PKR, optional)</label><input class="input" id="pfOld" type="number" value="${p.old_price || ''}"></div>
      </div>
      <div class="grid grid-2 grid-1-m">
        <div class="field"><label>Commission % *</label><input class="input" id="pfComm" type="number" min="0" max="90" value="${p.commission_percent}"></div>
        <div class="field"><label>Stock</label><input class="input" id="pfStock" type="number" value="${p.stock}"></div>
      </div>
      <div class="field"><label>Category</label><input class="input" id="pfCat" value="${esc(p.category)}"></div>
      <div class="field"><label>Description</label><textarea class="input" id="pfDesc">${esc(p.description)}</textarea></div>
      <div class="field"><label>Image URLs (one per line, up to 8)</label><textarea class="input" id="pfImgs" placeholder="https://...">${esc(p.images.join('\n'))}</textarea></div>
      <div class="field"><label>Video URL (optional)</label><input class="input" id="pfVideo" value="${esc(p.video_url)}"></div>
      <div class="field"><label><input type="checkbox" id="pfActive" ${p.active ? 'checked' : ''} style="accent-color:var(--primary)"> Visible in store</label></div>
      <button class="btn btn-block" id="pfSave">${isNew ? 'Add Product' : 'Save Changes'}</button>`);
    $('#pfSave').onclick = async () => {
      const err = $('#pfErr'); err.innerHTML = '';
      const body = {
        name: $('#pfName').value.trim(),
        price: Number($('#pfPrice').value),
        old_price: $('#pfOld').value ? Number($('#pfOld').value) : null,
        commission_percent: Number($('#pfComm').value),
        stock: Number($('#pfStock').value),
        category: $('#pfCat').value.trim() || 'General',
        description: $('#pfDesc').value.trim(),
        images: $('#pfImgs').value.split('\n').map(s => s.trim()).filter(Boolean),
        video_url: $('#pfVideo').value.trim(),
        active: $('#pfActive').checked
      };
      try {
        if (isNew) await api('/api/admin/products', { method: 'POST', body: JSON.stringify(body) });
        else await api('/api/admin/products/' + p.id, { method: 'PUT', body: JSON.stringify(body) });
        closeModal(); toast(isNew ? '✅ Product added!' : '✅ Product updated!');
        loadProducts();
      } catch (e) { err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
    };
  }

  /* ---------- Orders ---------- */
  const ORDER_STATUSES = ['', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  function renderOrderFilters() {
    $('#orderFilters').innerHTML = ORDER_STATUSES.map(s =>
      `<button class="chip${orderFilter === s ? ' active' : ''}" data-s="${s}">${s || 'All'}</button>`).join('');
    $$('#orderFilters .chip').forEach(c => c.onclick = () => { orderFilter = c.dataset.s; renderOrderFilters(); loadOrders(); });
  }
  async function loadOrders() {
    renderOrderFilters();
    try {
      const orders = await api('/api/admin/orders' + (orderFilter ? '?status=' + orderFilter : ''));
      $('#orderBody').innerHTML = orders.map(o => `
        <tr>
          <td><b>#${o.id}</b><br><span class="text-sm text-muted">${o.created_at.slice(0, 10)}</span></td>
          <td style="white-space:normal">${esc(o.customer_name)}<br><span class="text-sm text-muted">${esc(o.phone)}</span></td>
          <td>${esc(o.city)}</td><td><b>${fmtPKR(o.total)}</b></td>
          <td><span class="badge badge-pending">${o.payment_method}</span><br><span class="text-sm text-muted">${o.payment_status}</span></td>
          <td>${o.referral_code ? `<span class="badge badge-confirmed">${esc(o.referral_code)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td><span class="badge badge-${o.order_status}">${o.order_status}</span></td>
          <td><button class="btn btn-sm btn-outline" onclick="Admin.viewOrder(${o.id})">View</button></td>
        </tr>`).join('') || `<tr><td colspan="8" class="text-center text-muted">No orders.</td></tr>`;
      Admin._orders = orders;
    } catch (e) { toast('Orders failed: ' + e.message); }
  }
  function viewOrder(id) {
    const o = (Admin._orders || []).find(x => x.id === id);
    if (!o) return;
    openModal(`
      <h2>Order #${o.id}</h2>
      <div class="text-sm text-muted">${o.created_at.replace(' ', ' · ').slice(0, 16)}</div>
      <div class="mt-2 text-sm">
        <b>${esc(o.customer_name)}</b> · ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.city)}
      </div>
      <div class="table-wrap mt-2"><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>${o.items.map(i => `<tr><td style="white-space:normal">${esc(i.name)}</td><td>${i.qty}</td><td>${fmtPKR(i.price * i.qty)}</td></tr>`).join('')}</tbody></table></div>
      <div class="mt-2 text-sm">
        Subtotal: ${fmtPKR(o.subtotal)} · Shipping: ${fmtPKR(o.shipping_fee)} · <b>Total: ${fmtPKR(o.total)}</b><br>
        Payment: ${o.payment_method} (${o.payment_status})${o.referral_code ? ` · Referral: <b>${esc(o.referral_code)}</b> · Commission: ${fmtPKR(o.commission_earned)}` : ''}
      </div>
      <div class="grid grid-2 grid-1-m mt-2">
        <div class="field"><label>Order Status</label><select class="input" id="ovStatus">
          ${['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(s => `<option ${o.order_status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="field"><label>Payment Status</label><select class="input" id="ovPay">
          ${['pending', 'paid', 'failed'].map(s => `<option ${o.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
      </div>
      <p class="text-sm text-muted">💡 Commissions are auto-approved when an order is marked <b>delivered</b>.</p>
      <button class="btn btn-block mt-1" id="ovSave">Update Order</button>`);
    $('#ovSave').onclick = async () => {
      try {
        await api('/api/admin/orders/' + o.id, { method: 'PUT', body: JSON.stringify({ order_status: $('#ovStatus').value, payment_status: $('#ovPay').value }) });
        closeModal(); toast('✅ Order updated'); loadOrders(); loadDash();
      } catch (e) { toast(e.message); }
    };
  }

  /* ---------- Partners ---------- */
  async function loadPartners() {
    try {
      const ps = await api('/api/admin/partners');
      $('#partnerBody').innerHTML = ps.map(p => `
        <tr>
          <td style="white-space:normal"><b>${esc(p.name)}</b><br><span class="text-sm text-muted">${esc(p.email)}</span></td>
          <td><b style="letter-spacing:2px">${esc(p.referral_code)}</b></td>
          <td>${p.clicks}</td><td>${p.sales}</td><td><b>${fmtPKR(p.earned)}</b></td>
          <td><span class="badge ${p.status === 'active' ? 'badge-active' : 'badge-suspended'}">${p.status}</span></td>
          <td>${p.status === 'active'
            ? `<button class="btn btn-sm" style="background:var(--danger)" onclick="Admin.setPartner(${p.id},'suspended')">Suspend</button>`
            : `<button class="btn btn-sm btn-success" onclick="Admin.setPartner(${p.id},'active')">Activate</button>`}</td>
        </tr>`).join('') || `<tr><td colspan="7" class="text-center text-muted">No partners yet.</td></tr>`;
    } catch (e) { toast('Partners failed: ' + e.message); }
  }

  /* ---------- Withdrawals ---------- */
  const WD_STATUSES = ['pending', 'approved', 'paid', 'rejected'];
  function renderWdFilters() {
    $('#wdFilters').innerHTML = WD_STATUSES.map(s =>
      `<button class="chip${wdFilter === s ? ' active' : ''}" data-s="${s}">${s}</button>`).join('');
    $$('#wdFilters .chip').forEach(c => c.onclick = () => { wdFilter = c.dataset.s; renderWdFilters(); loadWithdrawals(); });
  }
  async function loadWithdrawals() {
    renderWdFilters();
    try {
      const wds = await api('/api/admin/withdrawals?status=' + wdFilter);
      $('#wdBody').innerHTML = wds.map(w => `
        <tr>
          <td><b>#${w.id}</b><br><span class="text-sm text-muted">${w.created_at.slice(0, 10)}</span></td>
          <td style="white-space:normal"><b>${esc(w.partner_name)}</b><br><span class="text-sm text-muted">${esc(w.partner_email)}</span></td>
          <td><b>${fmtPKR(w.amount)}</b></td><td>${esc(w.method)}</td>
          <td style="white-space:normal;min-width:150px" class="text-sm">${esc(w.account_details)}</td>
          <td><span class="badge badge-${w.status}">${w.status}</span></td>
          <td style="white-space:normal">
            ${w.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="Admin.setWd(${w.id},'approved')">Approve</button>
            <button class="btn btn-sm" style="background:var(--danger)" onclick="Admin.setWd(${w.id},'rejected')">Reject</button>` : ''}
            ${w.status === 'approved' ? `<button class="btn btn-sm btn-accent" onclick="Admin.setWd(${w.id},'paid')">Mark Paid</button>` : ''}
          </td>
        </tr>`).join('') || `<tr><td colspan="7" class="text-center text-muted">No ${wdFilter} withdrawals.</td></tr>`;
    } catch (e) { toast('Withdrawals failed: ' + e.message); }
  }

  /* ---------- Settings ---------- */
  const SETTING_IDS = ['site_name', 'announcement', 'shipping_fee', 'min_withdrawal', 'jazzcash_number', 'jazzcash_title', 'easypaisa_number', 'easypaisa_title', 'stripe_publishable_key'];
  async function loadSettings() {
    try {
      const s = await api('/api/admin/settings');
      SETTING_IDS.forEach(k => { const el = $('#s_' + k); if (el) el.value = s[k] || ''; });
    } catch (e) { toast('Settings failed: ' + e.message); }
  }
  $('#saveSettingsBtn').onclick = async () => {
    const msg = $('#setMsg'); msg.innerHTML = '';
    const body = {};
    SETTING_IDS.forEach(k => { const el = $('#s_' + k); if (el) body[k] = el.value; });
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
      msg.innerHTML = `<div class="form-ok">✅ Settings saved!</div>`;
    } catch (e) { msg.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  };

  window.Admin = {
    _products: [], _orders: [],
    editProduct: id => { const p = (Admin._products || []).find(x => x.id === id); if (p) productForm(p); },
    delProduct: async id => {
      if (!confirm('Delete this product? This cannot be undone.')) return;
      try { await api('/api/admin/products/' + id, { method: 'DELETE' }); toast('🗑️ Deleted'); loadProducts(); }
      catch (e) { toast(e.message); }
    },
    viewOrder,
    setPartner: async (id, status) => {
      try { await api('/api/admin/partners/' + id, { method: 'PUT', body: JSON.stringify({ status }) }); toast('✅ Partner ' + status); loadPartners(); }
      catch (e) { toast(e.message); }
    },
    setWd: async (id, status) => {
      try { await api('/api/admin/withdrawals/' + id, { method: 'PUT', body: JSON.stringify({ status }) }); toast('✅ Withdrawal ' + status); loadWithdrawals(); loadDash(); }
      catch (e) { toast(e.message); }
    }
  };

  boot();
})();
