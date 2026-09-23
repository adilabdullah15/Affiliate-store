// affiliate/app.js — partner portal logic.
(function () {
  'use strict';
  let ME = null, STATS = null, PRODUCTS = [];
  const storeBase = location.origin.replace(/\/$/, '');

  function showView(id) {
    $$('main .view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function copyText(t, msg) {
    navigator.clipboard.writeText(t).then(() => toast(msg || 'Copied!')).catch(() => {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); toast(msg || 'Copied!');
    });
  }
  function refLink(productSlug) {
    const base = `${storeBase}/?ref=${ME.referral_code}`;
    return productSlug ? `${base}&product=${productSlug}` : base;
  }

  /* ---------- Auth ---------- */
  $('#tabLogin').onclick = () => switchAuth('login');
  $('#tabSignup').onclick = () => switchAuth('signup');
  function switchAuth(which) {
    $('#tabLogin').classList.toggle('active', which === 'login');
    $('#tabSignup').classList.toggle('active', which === 'signup');
    $('#form-login').style.display = which === 'login' ? 'block' : 'none';
    $('#form-signup').style.display = which === 'signup' ? 'block' : 'none';
  }
  $('#loginBtn').onclick = async () => {
    const err = $('#authError'); err.innerHTML = '';
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#liEmail').value.trim(), password: $('#liPass').value }) });
      if (r.user.role !== 'partner') { await api('/api/auth/logout', { method: 'POST' }); throw new Error('This portal is for partners. Please sign up as a partner.'); }
      enter(r.user);
    } catch (e) { err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  };
  $('#signupBtn').onclick = async () => {
    const err = $('#authError'); err.innerHTML = '';
    try {
      const r = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: $('#suName').value.trim(), email: $('#suEmail').value.trim(), phone: $('#suPhone').value.trim(), password: $('#suPass').value, role: 'partner' }) });
      toast('🎉 Welcome! Your referral code is ' + r.user.referral_code);
      enter(r.user);
    } catch (e) { err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  };
  $('#logoutBtn').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); };

  async function boot() {
    try {
      const s = await api('/api/settings');
      $('#siteName').textContent = s.site_name;
      $('#minWdHero').textContent = fmtPKR(s.min_withdrawal || 1000);
      $('#minWdTxt').textContent = fmtPKR(s.min_withdrawal || 1000);
    } catch (e) {}
    try {
      const me = await api('/api/auth/me');
      if (me.user && me.user.role === 'partner') enter(me.user);
      else showView('view-landing');
    } catch (e) { showView('view-landing'); }
  }

  async function enter(user) {
    ME = user;
    Aff._code = user.referral_code;
    $('#userChip').style.display = 'inline';
    $('#userChip').innerHTML = `👋 <b>${esc(user.name)}</b>`;
    $('#logoutBtn').style.display = 'inline-flex';
    showView('view-app');
    await loadAll();
  }

  /* ---------- Data ---------- */
  async function loadAll() {
    try {
      [STATS, PRODUCTS] = await Promise.all([api('/api/affiliate/stats'), api('/api/affiliate/products')]);
      renderDash(); renderLinks(); renderMedia(); await renderWallet();
    } catch (e) { toast('Could not load dashboard: ' + e.message); }
  }

  /* ---------- Dashboard ---------- */
  function renderDash() {
    $('#refCode').textContent = STATS.referral_code;
    const cards = [
      ['👆', 'Total Clicks', STATS.clicks],
      ['🛍️', 'Sales', STATS.sales],
      ['💰', 'Total Earned', fmtPKR(STATS.earned)],
      ['✅', 'Available Balance', fmtPKR(STATS.available)]
    ];
    $('#statCards').innerHTML = cards.map(c => `<div class="stat-card"><div style="font-size:26px">${c[0]}</div><div class="num">${c[2]}</div><div class="label">${c[1]}</div></div>`).join('');
    $('#recentBody').innerHTML = STATS.recent.length ? STATS.recent.map(r => `
      <tr><td>#${r.order_id}</td><td>${esc(r.product_name || '—')}</td><td><b>${fmtPKR(r.amount)}</b></td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td><td class="text-muted">${r.created_at.slice(0, 10)}</td></tr>`).join('')
      : `<tr><td colspan="5" class="text-center text-muted">No earnings yet — share your link to get started! 🚀</td></tr>`;
    drawChart();
  }
  function drawChart() {
    const cv = $('#clickChart'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push(d.toISOString().slice(0, 10)); }
    const map = {}; STATS.clicksByDay.forEach(r => map[r.d] = r.c);
    const vals = days.map(d => map[d] || 0);
    const max = Math.max(1, ...vals);
    const bw = W / 14;
    vals.forEach((v, i) => {
      const h = (v / max) * (H - 40);
      const x = i * bw + bw * 0.2, y = H - 20 - h;
      const g = ctx.createLinearGradient(0, y, 0, H - 20);
      g.addColorStop(0, '#6c3ce0'); g.addColorStop(1, '#b79df5');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, bw * 0.6, h, 4); ctx.fill();
      if (v) { ctx.fillStyle = '#1a1333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(v, x + bw * 0.3, y - 5); }
    });
  }

  /* ---------- Links ---------- */
  function renderLinks() {
    const main = refLink(null);
    $('#mainLink').value = main;
    const txt = encodeURIComponent(`🛍️ Shop quality products online in Pakistan — Cash on Delivery available! Order here: ${main}`);
    $('#mainShare').innerHTML = `
      <a class="wa" target="_blank" href="https://wa.me/?text=${txt}">WhatsApp</a>
      <a class="fb" target="_blank" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(main)}">Facebook</a>
      <button class="tk" onclick="Aff.copyText(${JSON.stringify('🎵 TikTok caption: ' + main)},'Caption copied — paste it in your TikTok bio or video!')">TikTok Caption</button>
      <button class="btn-sm" style="background:var(--primary)" onclick="Aff.copyText($('#mainLink').value,'Link copied!')">Copy Link</button>`;
    $('#linkProducts').innerHTML = PRODUCTS.map(p => {
      const link = refLink(p.slug);
      const t = encodeURIComponent(`🔥 ${p.name} — only ${fmtPKR(p.price)}! Cash on Delivery across Pakistan. Order: ${link}`);
      return `
      <div class="prod-row">
        <img src="${esc(p.images[0] || '')}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px">${esc(p.name)}</div>
          <div class="text-sm text-muted">${fmtPKR(p.price)} · <b style="color:var(--success)">You earn ${fmtPKR(p.commission_amount)} / sale</b></div>
          <div class="link-row"><input class="input" value="${esc(link)}" readonly onclick="this.select()"><button class="btn btn-sm" onclick="Aff.copyText('${esc(link)}','Product link copied!')">Copy</button></div>
          <div class="share-btns">
            <a class="wa" target="_blank" href="https://wa.me/?text=${t}">WhatsApp</a>
            <a class="fb" target="_blank" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}">Facebook</a>
          </div>
        </div>
      </div>`;
    }).join('') || `<div class="empty">No products yet.</div>`;
  }

  /* ---------- Media kit ---------- */
  function renderMedia() {
    $('#mediaList').innerHTML = PRODUCTS.map(p => {
      const caption = `🔥 ${p.name} 🔥\n\n${p.description.slice(0, 120)}\n\n💰 Price: ${fmtPKR(p.price)}${p.old_price > p.price ? ` (was ${fmtPKR(p.old_price)})` : ''}\n🚚 Cash on Delivery — All over Pakistan\n\n👉 Order here: ${refLink(p.slug)}\n\n#OnlineShopping #Pakistan #CashOnDelivery`;
      return `
      <div class="card mb-2">
        <div class="flex-between"><h3>${esc(p.name)}</h3><span class="badge badge-active">${fmtPKR(p.price)}</span></div>
        <div class="media-imgs">${p.images.map(im => `<a href="${esc(im)}" target="_blank"><img src="${esc(im)}" loading="lazy" alt=""></a>`).join('')}</div>
        ${p.video_url ? `<a class="btn btn-outline btn-sm" target="_blank" href="${esc(p.video_url)}">▶ Product Video</a>` : ''}
        <div class="mt-1"><b class="text-sm">Ready caption — tap copy & post:</b>
          <div class="caption-box mt-1" id="cap-${p.id}">${esc(caption)}</div>
          <button class="btn btn-sm mt-1" onclick="Aff.copyText(document.getElementById('cap-${p.id}').innerText,'Caption copied! 📋')">Copy Caption</button>
        </div>
      </div>`;
    }).join('') || `<div class="empty">No products yet.</div>`;
  }

  /* ---------- Wallet ---------- */
  async function renderWallet() {
    const cards = [
      ['💰', 'Total Earned', fmtPKR(STATS.earned)],
      ['⏳', 'Pending', fmtPKR(STATS.pending)],
      ['✅', 'Available', fmtPKR(STATS.available)]
    ];
    $('#walletCards').innerHTML = cards.map(c => `<div class="stat-card"><div style="font-size:26px">${c[0]}</div><div class="num">${c[2]}</div><div class="label">${c[1]}</div></div>`).join('');
    const [earnings, wds] = await Promise.all([api('/api/affiliate/earnings'), api('/api/affiliate/withdrawals')]);
    $('#earnBody').innerHTML = earnings.length ? earnings.map(r => `
      <tr><td class="text-muted">${r.created_at.slice(0, 10)}</td><td>#${r.order_id}</td><td>${esc(r.product_name || '—')}</td>
      <td><b>${fmtPKR(r.amount)}</b></td><td><span class="badge badge-${r.status}">${r.status}</span></td></tr>`).join('')
      : `<tr><td colspan="5" class="text-center text-muted">No earnings yet.</td></tr>`;
    $('#wdBody').innerHTML = wds.length ? wds.map(w => `
      <tr><td class="text-muted">${w.created_at.slice(0, 10)}</td><td><b>${fmtPKR(w.amount)}</b></td><td>${esc(w.method)}</td>
      <td><span class="badge badge-${w.status}">${w.status}</span></td></tr>`).join('')
      : `<tr><td colspan="4" class="text-center text-muted">No withdrawals yet.</td></tr>`;
  }
  $('#wdBtn').onclick = async () => {
    const err = $('#wdError'); err.innerHTML = '';
    try {
      await api('/api/affiliate/withdrawals', { method: 'POST', body: JSON.stringify({ amount: $('#wdAmount').value, method: $('#wdMethod').value, account_details: $('#wdDetails').value }) });
      toast('✅ Withdrawal requested!');
      $('#wdAmount').value = ''; $('#wdDetails').value = '';
      STATS = await api('/api/affiliate/stats');
      renderDash(); await renderWallet();
    } catch (e) { err.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  };

  /* ---------- Tabs ---------- */
  $$('#appTabs .tab').forEach(t => t.onclick = () => {
    $$('#appTabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    ['dash', 'links', 'media', 'wallet'].forEach(v => $('#v-' + v).classList.toggle('active', v === t.dataset.v));
  });

  window.Aff = { copyText, _code: '' };
  boot();
})();
