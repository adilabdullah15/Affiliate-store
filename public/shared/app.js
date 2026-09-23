// shared/app.js — tiny helpers used by all three frontends.
window.$ = (sel, el) => (el || document).querySelector(sel);
window.$$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

window.toast = function (msg, ms) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms || 2600);
};

window.api = async function (url, opts) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...(opts || {})
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

window.fmtPKR = function (n) {
  n = Math.round(Number(n) || 0);
  return 'PKR ' + n.toLocaleString('en-PK');
};

window.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
};

window.openModal = function (html) {
  closeModal();
  const root = $('#modalRoot');
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal"><button class="modal-close" aria-label="Close">✕</button>${html}</div>`;
  bd.addEventListener('click', e => { if (e.target === bd || e.target.classList.contains('modal-close')) closeModal(); });
  root.appendChild(bd);
  document.body.style.overflow = 'hidden';
};
window.closeModal = function () {
  const root = $('#modalRoot');
  if (root) root.innerHTML = '';
  document.body.style.overflow = '';
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
