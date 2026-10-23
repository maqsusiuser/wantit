/* Wantly — single-page client (vanilla JS, no build step) */
const S = { token: localStorage.getItem('w_token'), me: null, cats: [], socket: null, summary: { unreadMessages: 0, unreadNotifications: 0 }, openConv: null };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹ ' + Number(n || 0).toLocaleString('en-IN');
const cat = id => S.cats.find(c => c.id === id) || { id, name: id, icon: '📦', fields: [] };
const PALETTE = { mobiles: ['#d9f7f5', '#b9ecf0'], laptops: ['#e7e3ff', '#d4ccff'], cars: ['#ffe8cc', '#ffd59e'], bikes: ['#ffe0e6', '#ffc2cf'], electronics: ['#e0ecff', '#c7dbff'], furniture: ['#efe6d8', '#e3d2b8'] };
const grad = c => { const [a, b] = PALETTE[c] || ['#eef1f2', '#dfe5e6']; return `linear-gradient(135deg,${a},${b})`; };
function ago(iso) { const s = (Date.now() - new Date(iso)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 86400 * 7) return Math.floor(s / 86400) + ' days ago'; return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
const time = iso => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const av = (u, cls = '') => `<span class="avatar ${cls}" style="background:${esc(u?.avatar || '#406367')}">${esc((u?.name || '?')[0].toUpperCase())}</span>`;
const stars = r => r?.avg ? `<span class="stars">${'★'.repeat(Math.round(r.avg))}${'☆'.repeat(5 - Math.round(r.avg))}</span> <span class="small muted">${r.avg} (${r.count})</span>` : '<span class="small muted">No ratings yet</span>';
const verifiedBadge = u => u?.verified === 'id' ? '<span class="verified">✔ ID verified</span>' : u?.verified ? '<span class="small muted">✔ Phone verified</span>' : '';
const LEVEL = { exact: ['exact', '✔ Exact match'], partial: ['partial', '◐ Partial match'], none: ['none', '✕ Not a match'] };
const RESULT = { match: ['match', 'Match'], claimed: ['claimed', 'Claim — verify'], missing: ['missing', 'Not stated'], mismatch: ['mismatch', "Doesn't meet"] };
const levelPill = l => `<span class="pill ${LEVEL[l][0]}">${LEVEL[l][1]}</span>`;
const thumb = (item, big) => item.images?.[0]
  ? `<img src="${esc(item.images[0].url || item.images[0])}" alt="">`
  : `<div class="art" style="background:${grad(item.category)}"><span style="font-size:${big ? 120 : 64}px">${cat(item.category).icon}</span>${big ? '' : `<small>${esc(cat(item.category).name)}</small>`}</div>`;

// ---------- api ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', 'x-token': S.token || '' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) { logout(true); }
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.data = data; e.status = res.status; throw e; }
  return data;
}
async function uploadFiles(files) {
  const fd = new FormData(); [...files].forEach(f => fd.append('files', f));
  const res = await fetch('/api/upload', { method: 'POST', headers: { 'x-token': S.token }, body: fd });
  if (!res.ok) throw new Error('Upload failed'); return res.json();
}
function toast(msg, err) { const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err'; $('#toast').append(d); setTimeout(() => d.remove(), 3200); }
const fail = e => toast(e.message, true);
function modal(html, onMount) {
  const m = $('#modal'); m.innerHTML = `<div class="modal-box">${html}</div>`; m.classList.remove('hidden');
  return new Promise(resolve => {
    const close = v => { m.classList.add('hidden'); m.innerHTML = ''; resolve(v); };
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(null); };
    onMount && onMount(m, close);
  });
}
function askPrice(title, hint, initial) {
  return modal(`<h2>${esc(title)}</h2><p class="muted small">${esc(hint || '')}</p><form id="pf"><div class="field"><label>Price (₹)</label><input id="pv" type="number" min="1" required value="${initial || ''}" autofocus></div><div class="row"><button class="btn">Send</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`,
    (m, close) => { $('#pv', m).focus(); $('#pf', m).onsubmit = e => { e.preventDefault(); close(+$('#pv', m).value); }; });
}
async function report(userId, refId) {
  if (!requireLogin()) return;
  const reason = await modal(`<h2>Report</h2><p class="muted small">Our moderators will review this. The other user is not told who reported them.</p><form id="rf">
    ${['Fake or misleading listing', 'Scam / asked for advance payment', 'Abusive messages', 'Spam', 'Prohibited item'].map((r, i) => `<label class="toggle" style="display:flex;margin:8px 0"><input type="radio" name="r" value="${r}" ${i ? '' : 'checked'}> ${r}</label>`).join('')}
    <div class="row" style="margin-top:12px"><button class="btn danger">Submit report</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`,
    (m, close) => { $('#rf', m).onsubmit = e => { e.preventDefault(); close($('input[name=r]:checked', m).value); }; });
  if (reason) api('/reports', { body: { reportedUserId: userId, refId, reason } }).then(() => toast('Report sent to moderators')).catch(fail);
}
function requireLogin() { if (S.me) return true; sessionStorage.setItem('w_after', location.hash); location.hash = '#/login'; return false; }

// ---------- shell ----------
function renderNav() {
  const n = $('#nav');
  if (!S.me) { n.innerHTML = `<a class="btn ghost sm" href="#/login" style="height:42px">Login</a><a class="cta want" href="#/post">＋ <span class="lbl">POST A WANT</span></a><a class="cta sell" href="#/sell">＋ <span class="lbl">SELL</span></a>`; return; }
  const { unreadMessages: um, unreadNotifications: un } = S.summary;
  n.innerHTML = `
    <a class="iconbtn" href="#/chat" title="Chats">💬${um ? `<span class="badge">${um}</span>` : ''}</a>
    <a class="iconbtn" href="#/notifications" title="Notifications">🔔${un ? `<span class="badge">${un}</span>` : ''}</a>
    <div class="menu"><button class="iconbtn" id="meBtn" title="Account">${av(S.me)}</button>
      <div class="menu-pop hidden" id="mePop">
        <div style="padding:10px 12px" class="row">${av(S.me)}<div><b>${esc(S.me.name)}</b><div class="small muted">${esc(S.me.city || '')}</div></div></div>
        <a href="#/dashboard/requests">🛒 My buying requests</a><a href="#/dashboard/received">📥 Offers received</a>
        <a href="#/dashboard/listings">🏷️ My listings</a><a href="#/dashboard/offers">📤 My offers</a>
        <a href="#/dashboard/deals">🤝 Deals</a><a href="#/dashboard/saved">♡ Saved</a>
        <a href="#/user/${S.me.id}">👤 Public profile</a><a href="#/profile">⚙️ Settings</a>
        ${S.me.isAdmin ? '<a href="#/admin">🛡️ Admin panel</a>' : ''}
        <button id="logoutBtn">↩ Logout</button>
      </div></div>
    <a class="cta want" href="#/post">＋ <span class="lbl">POST A WANT</span></a><a class="cta sell" href="#/sell">＋ <span class="lbl">SELL</span></a>`;
  $('#meBtn').onclick = e => { e.stopPropagation(); $('#mePop').classList.toggle('hidden'); };
  $('#logoutBtn').onclick = () => logout();
}
document.addEventListener('click', () => $('#mePop')?.classList.add('hidden'));
function renderCats(active) {
  const h = location.hash.split('?')[0];
  const base = h.startsWith('#/products') ? '#/products' : '#/';
  $('#catStrip').innerHTML = `<a href="${base}" class="${!active ? 'on' : ''}">All categories</a>` + S.cats.map(c => `<a href="${base}?cat=${c.id}" class="${active === c.id ? 'on' : ''}">${c.icon} ${esc(c.name)}</a>`).join('');
}
async function refreshSummary() { if (!S.me) return; try { S.summary = await api('/summary'); renderNav(); } catch { } }
function logout(silent) { localStorage.removeItem('w_token'); S.token = null; S.me = null; S.socket?.disconnect(); S.socket = null; renderNav(); if (!silent) { toast('Logged out'); location.hash = '#/'; } }
function connectSocket() {
  if (!S.token || S.socket) return;
  S.socket = io({ auth: { token: S.token } });
  S.socket.on('notification', n => { toast('🔔 ' + n.text); refreshSummary(); });
  S.socket.on('inbox', () => { refreshSummary(); if (location.hash.startsWith('#/chat')) loadConvList(); });
  S.socket.on('message', m => { if (S.openConv === m.conversationId) appendMessage(m, true); });
  S.socket.on('typing', d => { if (S.openConv === d.conversationId) { const t = $('#typing'); if (t) { t.textContent = 'typing…'; clearTimeout(t._h); t._h = setTimeout(() => t.textContent = '', 1800); } } });
  S.socket.on('read', d => { if (S.openConv === d.conversationId && d.by !== S.me.id) $$('.tick').forEach(t => { t.textContent = '✓✓'; t.classList.add('read'); }); });
  ['offer', 'deal', 'refresh'].forEach(ev => S.socket.on(ev, () => { if (S.openConv) openThread(S.openConv, true); }));
  S.socket.on('connect', () => { if (S.openConv) S.socket.emit('join', S.openConv); });
}
async function setSession(token, user) { S.token = token; localStorage.setItem('w_token', token); S.me = user; connectSocket(); await refreshSummary(); renderNav(); }

// ---------- router ----------
const routes = [
  [/^#\/?$/, home], [/^#\/products$/, productsPage], [/^#\/request\/(\w+)$/, requestPage], [/^#\/product\/(\w+)$/, productPage],
  [/^#\/post$/, postRequest], [/^#\/sell$/, sellPage], [/^#\/offer\/(\w+)$/, offerPage], [/^#\/chat(?:\/(\w+))?$/, chatPage],
  [/^#\/dashboard(?:\/(\w+))?$/, dashboard], [/^#\/notifications$/, notifications], [/^#\/user\/(\w+)$/, userPage],
  [/^#\/profile$/, profilePage], [/^#\/admin$/, adminPage], [/^#\/login$/, loginPage],
];
async function route() {
  const [path, qs] = location.hash.split('?'); const q = Object.fromEntries(new URLSearchParams(qs || ''));
  if (S.openConv && !path.startsWith('#/chat/')) { S.socket?.emit('leave', S.openConv); S.openConv = null; }
  renderCats(q.cat);
  for (const [re, fn] of routes) { const m = (path || '#/').match(re); if (m) { window.scrollTo(0, 0); try { await fn(...m.slice(1), q); } catch (e) { app.innerHTML = `<div class="empty"><div class="big">😕</div><h2>${esc(e.message)}</h2><a class="btn" href="#/">Go home</a></div>`; } return; } }
  app.innerHTML = '<div class="empty"><div class="big">🧭</div><h2>Page not found</h2></div>';
}
window.addEventListener('hashchange', route);
$('#searchForm').onsubmit = e => { e.preventDefault(); const base = location.hash.startsWith('#/products') ? '#/products' : '#/'; const p = new URLSearchParams(); const v = $('#searchInput').value.trim(); if (v) p.set('q', v); location.hash = base + (p.toString() ? '?' + p : ''); };
$('#citySel').value = localStorage.getItem('w_city') || '';
$('#citySel').onchange = () => { localStorage.setItem('w_city', $('#citySel').value); route(); };
const city = () => $('#citySel').value;

// ---------- cards ----------
function wantCard(r) {
  const c = cat(r.category); const must = r.specs.filter(s => s.mandatory).slice(0, 4);
  return `<a class="card want-card" href="#/request/${r.id}">
    ${r.featured ? '<span class="ribbon want" style="position:static;align-self:flex-start">FEATURED</span>' : ''}
    <div class="top"><div class="row" style="gap:10px;flex-wrap:nowrap;min-width:0"><div class="ico" style="background:${grad(r.category)}">${c.icon}</div>
      <div style="min-width:0"><div style="font-weight:800;line-height:1.25">${esc(r.title)}</div><div class="tiny muted">${esc(c.name)} · ${esc(r.condition || 'Any')}</div></div></div>
      ${S.me && r.buyerId !== S.me.id ? `<button class="heart" style="position:static;flex:none" data-save="${r.id}">${r.saved ? '❤️' : '♡'}</button>` : ''}</div>
    <div class="budget">Buyer budget<b>up to ${inr(r.budgetMax)}</b></div>
    <div class="chips">${must.map(s => `<span class="chip must">${esc(s.field)}: ${esc(s.value)}</span>`).join('')}</div>
    <div class="row" style="gap:6px">${r.offerCount ? `<span class="pill info">${r.offerCount} offer${r.offerCount > 1 ? 's' : ''}</span>` : '<span class="pill grey">No offers yet</span>'}
      ${r.myBestMatch ? `<span class="pill ${LEVEL[r.myBestMatch.level][0]}" title="Your listing “${esc(r.myBestMatch.title)}”">Your stock: ${r.myBestMatch.score}% fit</span>` : ''}
      ${r.myOffer ? '<span class="pill ok">You offered</span>' : ''}${r.status !== 'active' ? `<span class="pill warn">${esc(r.status)}</span>` : ''}</div>
    <div class="meta"><span>📍 ${esc(r.location)}</span><span>${ago(r.createdAt)}</span></div></a>`;
}
function productCard(p) {
  return `<a class="card" href="#/product/${p.id}">
    ${p.featured ? '<span class="ribbon">FEATURED</span>' : ''}
    ${S.me && p.sellerId !== S.me.id ? `<button class="heart" data-save="${p.id}">${p.saved ? '❤️' : '♡'}</button>` : ''}
    <div class="thumb">${thumb(p)}</div>
    <div class="body"><div class="price">${inr(p.price)}</div><div class="title">${esc(p.title)}</div>
      <div class="small muted">${esc(p.condition)}${p.status !== 'active' ? ` · <b>${esc(p.status.toUpperCase())}</b>` : ''}</div>
      <div class="meta"><span>📍 ${esc(p.location)}</span><span>${ago(p.createdAt)}</span></div></div></a>`;
}
function bindSaves(root = app) {
  $$('[data-save]', root).forEach(b => b.onclick = async e => { e.preventDefault(); e.stopPropagation(); if (!requireLogin()) return; try { const r = await api('/saved/' + b.dataset.save, { method: 'POST' }); b.textContent = r.saved ? '❤️' : '♡'; toast(r.saved ? 'Saved' : 'Removed from saved'); } catch (e) { fail(e); } });
}

// ---------- home ----------
async function home(q) {
  $('#searchInput').value = q.q || '';
  const params = new URLSearchParams({ ...(q.q && { q: q.q }), ...(q.cat && { category: q.cat }), ...(city() && { city: city() }), ...(q.sort && { sort: q.sort }) });
  const [reqs, prods] = await Promise.all([api('/requests?' + params), api('/products?' + params)]);
  const filtered = q.q || q.cat;
  app.innerHTML = `
    ${filtered ? '' : `<section class="hero"><div><h1>Post what you want.<br>Sellers come to you.</h1><p>Tell sellers exactly what you need — model, condition, budget. They compete with offers, you compare and chat, then close the deal after inspecting.</p>
      <div class="row"><a class="btn accent" href="#/post">＋ Post a buying request</a><a class="btn ghost" href="#/sell" style="background:transparent;color:#fff;border-color:#fff">I want to sell</a></div></div>
      <div class="flow"><div><b>1</b>Buyer posts requirement + budget</div><div><b>2</b>Smart matching finds sellers whose stock fits</div><div><b>3</b>Sellers send offers, everyone chats & negotiates</div><div><b>4</b>Accept → inspect → confirm → done</div></div></section>`}
    <div class="row spread" style="margin-bottom:12px"><h2 style="margin:0">🛒 Buyers are looking for ${q.cat ? '· ' + esc(cat(q.cat).name) : ''}${q.q ? ` “${esc(q.q)}”` : ''}</h2>
      <div class="row"><select class="inp" id="sortSel" style="width:auto;height:38px;padding:0 10px"><option value="">Newest</option><option value="budget">Highest budget</option>${S.me ? '<option value="match">Best fit for my stock</option>' : ''}</select></div></div>
    ${reqs.length ? `<div class="grid">${reqs.slice(0, filtered ? 99 : 8).map(wantCard).join('')}</div>` : `<div class="empty"><div class="big">🔎</div><p>No buying requests found.</p><a class="btn" href="#/post">Post one</a></div>`}
    <div class="row spread" style="margin:32px 0 12px"><h2 style="margin:0">🏷️ Fresh recommendations — for sale</h2><a class="btn ghost sm" href="#/products${q.cat ? '?cat=' + q.cat : ''}">See all listings →</a></div>
    ${prods.length ? `<div class="grid">${prods.slice(0, 12).map(productCard).join('')}</div>` : '<div class="empty"><p>No listings found.</p></div>'}`;
  $('#sortSel').value = q.sort || '';
  $('#sortSel').onchange = e => { const p = new URLSearchParams(location.hash.split('?')[1] || ''); e.target.value ? p.set('sort', e.target.value) : p.delete('sort'); location.hash = '#/?' + p; };
  bindSaves();
}
async function productsPage(q) {
  $('#searchInput').value = q.q || '';
  const params = new URLSearchParams({ ...(q.q && { q: q.q }), ...(q.cat && { category: q.cat }), ...(city() && { city: city() }), ...(q.sort && { sort: q.sort }), ...(q.max && { max: q.max }), ...(q.condition && { condition: q.condition }) });
  const prods = await api('/products?' + params);
  app.innerHTML = `<div class="row spread"><h1>${q.cat ? esc(cat(q.cat).name) : 'All listings'} <span class="muted small">${prods.length} ads</span></h1></div>
    <div class="toolbar"><select id="fSort"><option value="">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select>
      <select id="fCond"><option value="">Any condition</option><option>New</option><option>Like new</option><option>Used</option></select>
      <input id="fMax" type="number" placeholder="Max price ₹" style="width:140px"><button class="btn sm" id="fGo">Apply</button></div>
    ${prods.length ? `<div class="grid">${prods.map(productCard).join('')}</div>` : '<div class="empty"><div class="big">📭</div><p>Nothing here yet — try posting a buying request so sellers find you.</p><a class="btn" href="#/post">Post a want</a></div>'}`;
  $('#fSort').value = q.sort || ''; $('#fCond').value = q.condition || ''; $('#fMax').value = q.max || '';
  $('#fGo').onclick = () => { const p = new URLSearchParams(location.hash.split('?')[1] || ''); [['sort', '#fSort'], ['condition', '#fCond'], ['max', '#fMax']].forEach(([k, s]) => $(s).value ? p.set(k, $(s).value) : p.delete(k)); location.hash = '#/products?' + p; };
  bindSaves();
}

// ---------- request detail ----------
async function requestPage(id) {
  const r = await api('/requests/' + id); const c = cat(r.category); const mine = S.me && r.buyerId === S.me.id;
  app.innerHTML = `<div class="small muted" style="margin-bottom:8px"><a href="#/">Home</a> › <a href="#/?cat=${c.id}">${esc(c.name)}</a> › Buying request</div>
  <div class="two"><div>
    <div class="panel"><div class="row spread"><div class="row"><div class="ico" style="width:56px;height:56px;border-radius:12px;display:grid;place-items:center;font-size:30px;background:${grad(r.category)}">${c.icon}</div>
      <div><span class="pill info">WANTED</span> ${r.status !== 'active' ? `<span class="pill warn">${esc(r.status)}</span>` : ''}<h1 style="margin:6px 0 0">${esc(r.title)}</h1></div></div>
      ${!mine && S.me ? `<button class="heart" style="position:static" data-save="${r.id}">${r.saved ? '❤️' : '♡'}</button>` : ''}</div>
      <div class="row" style="margin:14px 0;gap:24px"><div><div class="small muted">Max budget</div><div class="price">${inr(r.budgetMax)}</div></div>
        <div><div class="small muted">Location</div><b>📍 ${esc(r.location)}</b></div><div><div class="small muted">Condition</div><b>${esc(r.condition)}</b></div>
        <div><div class="small muted">Delivery</div><b>${esc(r.delivery)}</b></div>${r.deadline ? `<div><div class="small muted">Needed by</div><b>${new Date(r.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b></div>` : ''}</div>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      ${r.images?.length ? `<div class="row">${r.images.map(i => `<img src="${esc(i.url || i)}" style="width:110px;height:90px;object-fit:cover;border-radius:8px">`).join('')}</div>` : ''}
      <h3 style="margin-top:16px">Required specifications</h3>
      <table class="t"><thead><tr><th>Requirement</th><th>Buyer wants</th><th></th></tr></thead><tbody>
      ${r.specs.map(s => `<tr><td>${esc(s.field)}</td><td><b>${esc(s.value)}</b></td><td>${s.mandatory ? '<span class="pill bad">Mandatory</span>' : '<span class="pill grey">Preferred</span>'}</td></tr>`).join('')}
      <tr><td>Price</td><td><b>Up to ${inr(r.budgetMax)}</b></td><td><span class="pill bad">Mandatory</span></td></tr></tbody></table>
      <p class="small muted" style="margin-top:10px">${r.allowPartial ? '✔ Buyer will consider partial matches.' : '✕ Buyer accepts exact matches only.'} Posted ${ago(r.createdAt)}.</p>
    </div>
    ${mine ? `<div class="panel" id="offersPanel"></div>` : ''}
  </div><aside>
    ${mine ? `<div class="panel stack"><h3>Manage your request</h3>
        <div class="notice">${r.offerCount} offer${r.offerCount === 1 ? '' : 's'} received${r.lowestOffer ? ` · lowest ${inr(r.lowestOffer)}` : ''}</div>
        <a class="btn ghost" href="#/post?edit=${r.id}">✏️ Edit request</a>
        ${r.status === 'active' ? '<button class="btn ghost" data-st="paused">⏸ Pause (hide from sellers)</button>' : r.status === 'paused' ? '<button class="btn ghost" data-st="active">▶ Resume</button>' : ''}
        ${['active', 'paused'].includes(r.status) ? '<button class="btn ghost" data-st="closed">✔ Close — I bought it</button>' : ''}
        <button class="btn danger" id="delReq">🗑 Delete request</button></div>`
      : `<div class="panel stack">
        ${r.myOffer ? `<div class="notice ok">You sent an offer of <b>${inr(r.myOffer.price)}</b> · ${esc(r.myOffer.status)}</div><a class="btn" href="#/dashboard/offers">View my offer & chat</a>`
          : r.status === 'active' ? `<a class="btn amber" href="#/offer/${r.id}" style="height:50px;font-size:16px">💰 Make an offer</a><p class="small muted" style="margin:0">Have this item? Send your price and product details. The buyer compares all offers side by side.</p>` : '<div class="notice warn">This request is not accepting offers.</div>'}
        ${r.myBestMatch ? `<div class="notice ${r.myBestMatch.level === 'exact' ? 'ok' : 'warn'}">Your listing <b>${esc(r.myBestMatch.title)}</b> fits ${r.myBestMatch.score}% · ${LEVEL[r.myBestMatch.level][1]}</div>` : ''}
      </div>`}
    <div class="panel"><h3>Buyer</h3><a class="seller-card" href="#/user/${r.buyer.id}" style="text-decoration:none">${av(r.buyer, 'lg')}<div><b style="font-size:17px">${esc(r.buyer.name)}</b><div>${verifiedBadge(r.buyer)}</div><div>${stars(r.buyer.rating)}</div></div></a>
      ${!mine ? `<button class="btn link small" style="margin-top:12px" id="repBtn">⚑ Report this request</button>` : ''}</div>
  </aside></div>`;
  bindSaves();
  $('#repBtn') && ($('#repBtn').onclick = () => report(r.buyerId, r.id));
  if (mine) {
    $$('[data-st]').forEach(b => b.onclick = () => api('/requests/' + r.id, { method: 'PATCH', body: { status: b.dataset.st } }).then(() => { toast('Updated'); route(); }).catch(fail));
    $('#delReq').onclick = async () => { if (await modal(`<h2>Delete this request?</h2><p class="muted">Sellers will no longer see it.</p><div class="row"><button class="btn danger" id="y">Delete</button><button class="btn ghost" data-close>Cancel</button></div>`, (m, close) => $('#y', m).onclick = () => close(true))) api('/requests/' + r.id, { method: 'DELETE' }).then(() => { toast('Deleted'); location.hash = '#/dashboard/requests'; }).catch(fail); };
    renderOfferComparison($('#offersPanel'), r);
  }
}
function renderOfferComparison(el, r) {
  const offers = (r.offers || []).slice().sort((a, b) => ({ exact: 0, partial: 1, none: 2 }[a.match.level] - { exact: 0, partial: 1, none: 2 }[b.match.level]) || a.price - b.price);
  if (!offers.length) { el.innerHTML = `<h2>Offers</h2><div class="empty"><div class="big">⏳</div><p>No offers yet. Sellers with matching stock are notified automatically.</p></div>`; return; }
  el.innerHTML = `<div class="row spread"><h2 style="margin:0">Compare ${offers.length} offer${offers.length > 1 ? 's' : ''}</h2><label class="toggle"><input type="checkbox" id="hideNone" checked> Hide “not a match”</label></div>
    <div class="tablewrap"><table class="t" style="margin-top:10px"><thead><tr><th>Seller</th><th>Price</th><th>Match</th><th>Requirements</th><th>Status</th><th></th></tr></thead><tbody>
    ${offers.map(o => `<tr data-level="${o.match.level}"><td><a href="#/user/${o.seller.id}" class="row" style="text-decoration:none;flex-wrap:nowrap">${av(o.seller)}<div><b>${esc(o.seller.name)}</b><div class="tiny">${o.seller.rating.avg ? '★ ' + o.seller.rating.avg : 'New seller'} ${o.seller.verified === 'id' ? '· <span class="verified">ID ✔</span>' : ''}</div></div></a></td>
      <td><b style="font-size:17px">${inr(o.price)}</b>${o.history.length > 1 ? `<div class="tiny muted"><s>${inr(o.history[0].price)}</s></div>` : ''}<div class="tiny ${o.price <= r.budgetMax ? 'muted' : ''}" style="${o.price > r.budgetMax ? 'color:var(--bad)' : ''}">${o.price <= r.budgetMax ? inr(r.budgetMax - o.price) + ' under budget' : 'Over budget'}</div></td>
      <td>${levelPill(o.match.level)}<div class="tiny muted">${o.match.score}% of specs</div></td>
      <td><button class="btn link small" data-detail="${o.id}">View breakdown</button>${o.match.needsVerification ? '<div class="tiny" style="color:var(--warn)">Has unverified claims</div>' : ''}</td>
      <td><span class="pill ${o.status === 'accepted' ? 'ok' : o.status === 'rejected' ? 'bad' : 'grey'}">${esc(o.status)}</span></td>
      <td><a class="btn sm" href="#/chat/${o.conversationId}">Chat</a></td></tr>`).join('')}
    </tbody></table></div>`;
  const apply = () => $$('tr[data-level="none"]', el).forEach(t => t.classList.toggle('hidden', $('#hideNone').checked));
  $('#hideNone').onchange = apply; apply();
  $$('[data-detail]', el).forEach(b => b.onclick = () => { const o = offers.find(x => x.id === b.dataset.detail); modal(`<h2>${esc(o.seller.name)} · ${inr(o.price)}</h2>${levelPill(o.match.level)}${matchTable(o.match)}
    <dl class="kv" style="margin-top:12px"><dt>Condition</dt><dd>${esc(o.condition)}</dd>${o.repairHistory ? `<dt>Repair history</dt><dd>${esc(o.repairHistory)}</dd>` : ''}${o.accessories ? `<dt>Accessories</dt><dd>${esc(o.accessories)}</dd>` : ''}${o.warranty ? `<dt>Warranty / bill</dt><dd>${esc(o.warranty)}</dd>` : ''}<dt>Delivery</dt><dd>${esc(o.delivery)}</dd></dl>
    <div class="row" style="margin-top:14px"><a class="btn" href="#/chat/${o.conversationId}" data-close>Open chat</a><button class="btn ghost" data-close>Close</button></div>`); });
}
function matchTable(m) {
  return `<div class="tablewrap"><table class="t" style="margin-top:10px"><thead><tr><th>Requirement</th><th>Buyer's rule</th><th>Seller's product</th><th>Result</th></tr></thead><tbody>
  ${m.rows.map(x => `<tr><td>${esc(x.field)}${x.mandatory ? ' <span class="tiny" style="color:var(--bad)">*</span>' : ''}</td><td>${esc(x.want)}</td><td>${esc(x.have) || '<span class="muted">—</span>'}</td><td><span class="pill ${RESULT[x.result][0]}">${x.field === 'Price' && x.result === 'match' ? 'Within budget' : RESULT[x.result][1]}</span></td></tr>`).join('')}
  </tbody></table></div><p class="tiny muted">* mandatory. “Claim — verify” = seller says so, but Wantly hasn't verified it. Check it during inspection.</p>`;
}

// ---------- product detail ----------
async function productPage(id) {
  const p = await api('/products/' + id); const c = cat(p.category); const mine = S.me && p.sellerId === S.me.id;
  app.innerHTML = `<div class="small muted" style="margin-bottom:8px"><a href="#/">Home</a> › <a href="#/products?cat=${c.id}">${esc(c.name)}</a> › ${esc(p.title)}</div>
  <div class="two"><div>
    <div class="gallery" id="gal">${p.images?.length ? `<img src="${esc(p.images[0].url || p.images[0])}">` : `<div class="art" style="background:${grad(p.category)}"><span style="font-size:140px">${c.icon}</span></div>`}</div>
    ${p.images?.length > 1 ? `<div class="thumbs">${p.images.map(i => `<img src="${esc(i.url || i)}">`).join('')}</div>` : ''}
    <div class="panel" style="margin-top:16px"><h3>Details</h3><dl class="kv"><dt>Condition</dt><dd>${esc(p.condition)}</dd>${p.attrs.map(a => `<dt>${esc(a.field)}</dt><dd>${esc(a.value)} <span class="tiny muted">${a.verified ? '✔ verified' : '(seller claim)'}</span></dd>`).join('')}</dl>
      ${p.description ? `<h3 style="margin-top:16px">Description</h3><p style="white-space:pre-wrap">${esc(p.description)}</p>` : ''}</div>
    ${p.matchingRequests.length ? `<div class="panel"><h3>🎯 Buyers looking for something like this</h3><p class="small muted">Requests that this listing could satisfy${mine ? ' — send them an offer directly' : ''}.</p>
      ${p.matchingRequests.map(m => `<div class="row spread" style="padding:10px 0;border-top:1px solid var(--line)"><div><a href="#/request/${m.id}"><b>${esc(m.title)}</b></a><div class="small muted">Budget ${inr(m.budgetMax)} · ${esc(m.location)}</div></div><div class="row">${levelPill(m.match.level)}${mine ? `<a class="btn sm amber" href="#/offer/${m.id}?product=${p.id}">Send offer</a>` : ''}</div></div>`).join('')}</div>` : ''}
  </div><aside>
    <div class="panel"><div class="row spread"><div class="price" style="font-size:30px">${inr(p.price)}</div>${!mine && S.me ? `<button class="heart" style="position:static" data-save="${p.id}">${p.saved ? '❤️' : '♡'}</button>` : ''}</div>
      <p style="margin:6px 0 4px;color:var(--ink-2)">${esc(p.title)}</p>
      <div class="row spread small muted"><span>📍 ${esc(p.location)}</span><span>${ago(p.createdAt)} · 👁 ${p.views}</span></div>
      ${p.negotiable ? '<span class="pill info" style="margin-top:8px">Negotiable</span>' : ''} ${p.status !== 'active' ? `<span class="pill warn">${esc(p.status)}</span>` : ''}</div>
    <div class="panel stack"><a class="seller-card" href="#/user/${p.seller.id}" style="text-decoration:none">${av(p.seller, 'lg')}<div><div class="small muted">Posted by</div><b style="font-size:17px">${esc(p.seller.name)}</b><div>${verifiedBadge(p.seller)}</div><div>${stars(p.seller.rating)}</div></div></a>
      ${mine ? `<a class="btn ghost" href="#/sell?edit=${p.id}">✏️ Edit listing</a>
        ${p.status === 'active' ? '<button class="btn ghost" data-pst="sold">✔ Mark as sold</button><button class="btn ghost" data-pst="paused">⏸ Deactivate</button>' : '<button class="btn ghost" data-pst="active">▶ Reactivate</button>'}
        <button class="btn danger" data-pst="deleted">🗑 Delete</button>`
      : `<button class="btn" id="chatBtn" style="height:48px">💬 Chat with seller</button><button class="btn ghost" id="offerBtn">₹ Make an offer</button><button class="btn link small" id="repBtn">⚑ Report this ad</button>`}
    </div>
    <div class="notice warn small">🛡️ Safety: inspect the item in person before paying. Never pay in advance or share OTPs.</div>
  </aside></div>`;
  bindSaves();
  $$('.thumbs img').forEach(i => i.onclick = () => $('#gal').innerHTML = `<img src="${i.src}">`);
  $$('[data-pst]').forEach(b => b.onclick = () => api('/products/' + p.id, { method: 'PATCH', body: { status: b.dataset.pst } }).then(() => { toast('Listing updated'); b.dataset.pst === 'deleted' ? location.hash = '#/dashboard/listings' : route(); }).catch(fail));
  if (!mine) {
    const start = async () => { if (!requireLogin()) return null; const c = await api('/conversations', { body: { productId: p.id } }); return c.id; };
    $('#chatBtn').onclick = () => start().then(id => id && (location.hash = '#/chat/' + id)).catch(fail);
    $('#offerBtn').onclick = async () => { if (!requireLogin()) return; const price = await askPrice('Make an offer', `Listed at ${inr(p.price)}. The seller can accept or decline.`, Math.round(p.price * 0.9)); if (!price) return; try { const id = await start(); await api(`/conversations/${id}/messages`, { body: { type: 'price', price } }); location.hash = '#/chat/' + id; } catch (e) { fail(e); } };
    $('#repBtn').onclick = () => report(p.sellerId, p.id);
  }
}

// ---------- spec/attribute editor ----------
function specEditor(el, rows, { mandatoryToggle = true, fields = [] } = {}) {
  const draw = () => {
    el.innerHTML = rows.map((r, i) => `<div class="spec-row"><input class="inp" placeholder="e.g. Storage" value="${esc(r.field)}" data-i="${i}" data-k="field" list="fieldList"><input class="inp" placeholder="e.g. 128 GB" value="${esc(r.value)}" data-i="${i}" data-k="value">
      ${mandatoryToggle ? `<label class="toggle"><input type="checkbox" data-i="${i}" data-k="mandatory" ${r.mandatory ? 'checked' : ''}> Must have</label>` : '<span></span>'}<button type="button" class="x" data-del="${i}">✕</button></div>`).join('') +
      `<datalist id="fieldList">${fields.map(f => `<option>${esc(f)}</option>`).join('')}</datalist><button type="button" class="btn ghost sm" id="addRow">＋ Add ${mandatoryToggle ? 'requirement' : 'detail'}</button>`;
    $$('input', el).forEach(inp => inp.oninput = inp.onchange = () => { const r = rows[inp.dataset.i]; if (!r) return; r[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; el.dispatchEvent(new Event('specchange')); });
    $$('[data-del]', el).forEach(b => b.onclick = () => { rows.splice(+b.dataset.del, 1); draw(); el.dispatchEvent(new Event('specchange')); });
    $('#addRow', el).onclick = () => { rows.push({ field: '', value: '', mandatory: false }); draw(); $$('.spec-row .inp', el).at(-2)?.focus(); };
  };
  draw(); return { rows, redraw: draw, set(n) { rows.splice(0, rows.length, ...n); draw(); } };
}
function photoPicker(el, images) {
  const draw = () => {
    el.innerHTML = images.map((im, i) => `<div style="position:relative">${/^video/.test(im.type || '') ? `<video class="ph" src="${esc(im.url)}"></video>` : `<img class="ph" src="${esc(im.url || im)}">`}<button type="button" class="x" style="position:absolute;top:-8px;right:-8px;background:#fff" data-rm="${i}">✕</button></div>`).join('') +
      (images.length < 6 ? `<label>📷<br>Add photos<input type="file" accept="image/*,video/*" multiple hidden></label>` : '');
    $$('[data-rm]', el).forEach(b => b.onclick = () => { images.splice(+b.dataset.rm, 1); draw(); });
    const f = $('input[type=file]', el); if (f) f.onchange = async () => { try { images.push(...(await uploadFiles(f.files))); draw(); } catch (e) { fail(e); } };
  };
  draw(); return images;
}

// ---------- post a buying request ----------
async function postRequest(q) {
  if (!requireLogin()) return;
  const edit = q.edit ? await api('/requests/' + q.edit) : null;
  const r = edit || { category: q.cat || 'mobiles', title: '', description: '', budgetMax: '', location: S.me.city, condition: 'Used', delivery: 'In-person inspection', allowPartial: true, specs: [], images: [] };
  app.innerHTML = `<div class="form"><h1>${edit ? 'Edit your buying request' : 'What do you want to buy?'}</h1><p class="muted">Describe it once. Sellers with matching items will send you offers.</p>
  <form class="panel" id="rf">
    <div class="field"><label>Category</label><select id="fCat">${S.cats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Title</label><input id="fTitle" required maxlength="80" placeholder="e.g. Wanted: iPhone 15 (128 GB)" value="${esc(r.title)}"></div>
    <div class="cols"><div class="field"><label>Maximum budget (₹)</label><input id="fBudget" type="number" min="1" required value="${r.budgetMax}" placeholder="35000"></div>
      <div class="field"><label>Location</label><input id="fLoc" value="${esc(r.location)}"></div></div>
    <div class="cols3"><div class="field"><label>Condition</label><select id="fCond"><option>Any</option><option>New</option><option>Used</option><option>Like new</option></select></div>
      <div class="field"><label>Delivery</label><select id="fDel"><option>In-person inspection</option><option>Pickup</option><option>Home delivery</option><option>Any</option></select></div>
      <div class="field"><label>Needed by (optional)</label><input id="fDeadline" type="date" value="${r.deadline || ''}"></div></div>
    <div class="field"><label>Requirements</label><div class="hint">Mark the ones that are non-negotiable as “Must have”. Numbers mean “at least” (e.g. RAM 16 GB accepts 32 GB).</div><div id="specs" style="margin-top:6px"></div></div>
    <div class="field"><label class="toggle"><input type="checkbox" id="fPartial" ${r.allowPartial ? 'checked' : ''}> Also show me partial matches (some preferred specs missing)</label></div>
    <div class="field"><label>More details</label><textarea id="fDesc" rows="3" placeholder="Anything sellers should know">${esc(r.description)}</textarea></div>
    <div class="field"><label>Reference photos (optional)</label><div class="uploader" id="photos"></div></div>
    <div class="row"><button class="btn" style="height:48px;padding:0 28px">${edit ? 'Save changes' : 'Post buying request'}</button><a class="btn ghost" href="javascript:history.back()">Cancel</a></div>
  </form></div>`;
  $('#fCat').value = r.category; $('#fCond').value = r.condition; $('#fDel').value = r.delivery;
  const specRows = r.specs.length ? r.specs.map(s => ({ ...s })) : cat(r.category).fields.slice(0, 4).map(f => ({ field: f, value: '', mandatory: true }));
  let ed = specEditor($('#specs'), specRows, { fields: cat(r.category).fields });
  $('#fCat').onchange = () => { if (!specRows.some(s => s.value)) ed.set(cat($('#fCat').value).fields.slice(0, 4).map(f => ({ field: f, value: '', mandatory: true }))); ed = specEditor($('#specs'), specRows, { fields: cat($('#fCat').value).fields }); };
  const images = photoPicker($('#photos'), [...(r.images || [])]);
  $('#rf').onsubmit = async e => {
    e.preventDefault();
    const body = { category: $('#fCat').value, title: $('#fTitle').value, budgetMax: +$('#fBudget').value, location: $('#fLoc').value, condition: $('#fCond').value, delivery: $('#fDel').value, deadline: $('#fDeadline').value || null, allowPartial: $('#fPartial').checked, description: $('#fDesc').value, specs: specRows, images };
    try { const out = edit ? await api('/requests/' + edit.id, { method: 'PATCH', body }) : await api('/requests', { body }); toast(edit ? 'Saved' : 'Request posted — sellers are being notified'); location.hash = '#/request/' + out.id; } catch (e) { fail(e); }
  };
}

// ---------- sell (product listing) ----------
async function sellPage(q) {
  if (!requireLogin()) return;
  const edit = q.edit ? await api('/products/' + q.edit) : null;
  const p = edit || { category: 'mobiles', title: '', description: '', price: '', condition: 'Used', location: S.me.city, attrs: [], images: [], negotiable: true };
  app.innerHTML = `<div class="form"><h1>${edit ? 'Edit your ad' : 'Post your ad'}</h1><p class="muted">Listed items are also matched against buyers' requests automatically.</p>
  <form class="panel" id="pf">
    <div class="field"><label>Category</label><select id="fCat">${S.cats.map(c => `<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Ad title</label><input id="fTitle" required maxlength="80" value="${esc(p.title)}" placeholder="Mention key features (e.g. brand, model, age)"></div>
    <div class="cols3"><div class="field"><label>Price (₹)</label><input id="fPrice" type="number" min="1" required value="${p.price}"></div>
      <div class="field"><label>Condition</label><select id="fCond"><option>New</option><option>Like new</option><option>Used</option><option>Needs repair</option></select></div>
      <div class="field"><label>Location</label><input id="fLoc" value="${esc(p.location)}"></div></div>
    <div class="field"><label>Product details</label><div class="hint">These are shown as <b>seller claims</b>. Only Wantly verification can mark them verified.</div><div id="attrs" style="margin-top:6px"></div></div>
    <div class="field"><label>Description</label><textarea id="fDesc" rows="4" placeholder="Include condition, features, reason for selling, repair history">${esc(p.description)}</textarea></div>
    <div class="field"><label>Photos — upload actual product photos</label><div class="uploader" id="photos"></div></div>
    <div class="field"><label class="toggle"><input type="checkbox" id="fNeg" ${p.negotiable ? 'checked' : ''}> Price is negotiable</label></div>
    <div class="row"><button class="btn" style="height:48px;padding:0 28px">${edit ? 'Save changes' : 'Post now'}</button><a class="btn ghost" href="javascript:history.back()">Cancel</a></div>
  </form></div>`;
  $('#fCat').value = p.category; $('#fCond').value = p.condition;
  const rows = p.attrs.length ? p.attrs.map(a => ({ ...a })) : cat(p.category).fields.map(f => ({ field: f, value: '' }));
  let ed = specEditor($('#attrs'), rows, { mandatoryToggle: false, fields: cat(p.category).fields });
  $('#fCat').onchange = () => { if (!rows.some(s => s.value)) ed.set(cat($('#fCat').value).fields.map(f => ({ field: f, value: '' }))); ed = specEditor($('#attrs'), rows, { mandatoryToggle: false, fields: cat($('#fCat').value).fields }); };
  const images = photoPicker($('#photos'), [...(p.images || [])]);
  $('#pf').onsubmit = async e => {
    e.preventDefault();
    const body = { category: $('#fCat').value, title: $('#fTitle').value, price: +$('#fPrice').value, condition: $('#fCond').value, location: $('#fLoc').value, description: $('#fDesc').value, attrs: rows, images, negotiable: $('#fNeg').checked };
    try { const out = edit ? await api('/products/' + edit.id, { method: 'PATCH', body }) : await api('/products', { body }); toast(edit ? 'Saved' : 'Your ad is live 🎉'); location.hash = '#/product/' + out.id; } catch (e) { fail(e); }
  };
}

// ---------- make an offer on a buyer request ----------
async function offerPage(reqId, q) {
  if (!requireLogin()) return;
  const [r, myProducts] = await Promise.all([api('/requests/' + reqId), api('/products?mine=1')]);
  if (r.buyerId === S.me.id) throw new Error("You can't make an offer on your own request");
  const stock = myProducts.filter(p => p.status === 'active');
  app.innerHTML = `<div class="form"><div class="small muted"><a href="#/request/${r.id}">← Back to request</a></div><h1>Make an offer</h1>
  <div class="panel" style="margin-bottom:16px"><div class="row spread"><div><b>${esc(r.title)}</b><div class="small muted">by ${esc(r.buyer.name)} · 📍 ${esc(r.location)}</div></div><div><div class="small muted">Buyer budget</div><div class="price">${inr(r.budgetMax)}</div></div></div>
    ${!r.allowPartial ? '<div class="notice warn" style="margin-top:10px">This buyer only accepts exact matches.</div>' : ''}</div>
  <form class="panel" id="of">
    <div class="field"><label>Use one of your listings (optional)</label><select id="fProd"><option value="">— Describe a new product —</option>${stock.map(p => `<option value="${p.id}">${esc(p.title)} · ${inr(p.price)}</option>`).join('')}</select></div>
    <div class="cols"><div class="field"><label>Your offered price (₹)</label><input id="fPrice" type="number" min="1" required></div><div class="field"><label>Product title</label><input id="fTitle" placeholder="e.g. iPhone 15, 128 GB"></div></div>
    <div class="field"><label>Does your product meet each requirement?</label><div class="hint">Fill in what your product actually has. Leave blank if you can't meet it — it will be flagged honestly to the buyer.</div><div id="attrs" style="margin-top:6px"></div></div>
    <div class="field"><label>Live match check</label><div id="preview" class="notice">Enter a price and details to see how your offer matches.</div></div>
    <div class="cols"><div class="field"><label>Condition</label><select id="fCond"><option>Like new</option><option>Used</option><option>New</option><option>Needs repair</option></select></div>
      <div class="field"><label>Delivery / pickup</label><select id="fDel"><option>Pickup / in-person inspection</option><option>I can deliver</option><option>Courier</option></select></div></div>
    <div class="cols3"><div class="field"><label>Repair history</label><input id="fRep" placeholder="e.g. Never repaired"></div><div class="field"><label>Included accessories</label><input id="fAcc" placeholder="Box, cable…"></div><div class="field"><label>Warranty / invoice</label><input id="fWar" placeholder="Bill available"></div></div>
    <div class="field"><label>Message to buyer</label><textarea id="fNotes" rows="3" placeholder="Hi! I have exactly what you're looking for…"></textarea></div>
    <div class="field"><label>Actual product photos</label><div class="uploader" id="photos"></div></div>
    <div class="row"><button class="btn amber" style="height:48px;padding:0 28px">Send offer</button></div>
  </form></div>`;
  const rows = r.specs.map(s => ({ field: s.field, value: '' }));
  specEditor($('#attrs'), rows, { mandatoryToggle: false });
  const images = photoPicker($('#photos'), []);
  let t; const preview = () => { clearTimeout(t); t = setTimeout(async () => {
    try { const m = await api('/match-preview', { body: { requestId: r.id, attrs: rows, price: +$('#fPrice').value || null } }); $('#preview').className = ''; $('#preview').innerHTML = `<div class="row spread">${levelPill(m.level)}<span class="small muted">${m.score}% of requirements met</span></div>${matchTable(m)}`; } catch { }
  }, 250); };
  $('#attrs').addEventListener('specchange', preview); $('#fPrice').oninput = preview;
  const fill = pid => { const p = stock.find(x => x.id === pid); if (!p) return; $('#fPrice').value = p.price; $('#fTitle').value = p.title; $('#fCond').value = ['New', 'Like new', 'Used', 'Needs repair'].includes(p.condition) ? p.condition : 'Used';
    rows.forEach(row => { const a = p.attrs.find(a => a.field.toLowerCase() === row.field.toLowerCase()); row.value = a ? a.value : ''; });
    p.attrs.filter(a => !rows.some(r => r.field.toLowerCase() === a.field.toLowerCase())).forEach(a => rows.push({ field: a.field, value: a.value }));
    specEditor($('#attrs'), rows, { mandatoryToggle: false }); images.splice(0, images.length, ...(p.images || [])); photoPicker($('#photos'), images); preview(); };
  $('#fProd').onchange = e => fill(e.target.value);
  const pre = q.product || (r.myBestMatch?.productId); if (pre && stock.some(p => p.id === pre)) { $('#fProd').value = pre; fill(pre); }
  const submit = async confirmPartial => {
    const body = { requestId: r.id, productId: $('#fProd').value || null, price: +$('#fPrice').value, title: $('#fTitle').value, attrs: rows, condition: $('#fCond').value, delivery: $('#fDel').value, repairHistory: $('#fRep').value, accessories: $('#fAcc').value, warranty: $('#fWar').value, notes: $('#fNotes').value, images, confirmPartial };
    try { const out = await api('/offers', { body }); toast('Offer sent!'); location.hash = '#/chat/' + out.conversationId; }
    catch (e) { if (e.status === 409 && await modal(`<h2>Buyer wants exact matches</h2><p>${esc(e.message)}</p><p class="small muted">You can still send it, but it will be shown as a partial match.</p><div class="row"><button class="btn amber" id="y">Send anyway</button><button class="btn ghost" data-close>Edit offer</button></div>`, (m, close) => $('#y', m).onclick = () => close(true))) submit(true); else if (e.status !== 409) fail(e); }
  };
  $('#of').onsubmit = e => { e.preventDefault(); submit(false); };
}

// ---------- chat ----------
async function chatPage(convId) {
  if (!requireLogin()) return;
  app.innerHTML = `<div class="chat ${convId ? 'has-thread' : ''}" id="chat"><div class="chat-list"><div class="head">Inbox</div><div id="convs"></div></div><div class="thread" id="thread">${convId ? '' : '<div class="empty" style="margin:auto"><div class="big">💬</div><p>Select a chat to view the conversation</p></div>'}</div></div>`;
  await loadConvList(convId);
  if (convId) openThread(convId);
}
async function loadConvList(activeId = S.openConv) {
  const el = $('#convs'); if (!el) return;
  const list = await api('/conversations');
  el.innerHTML = list.length ? list.map(c => `<a class="conv ${c.id === activeId ? 'on' : ''}" href="#/chat/${c.id}">${av(c.other)}<div class="c-body"><div class="row spread" style="flex-wrap:nowrap"><b>${esc(c.other.name)}</b><span class="tiny muted">${c.last ? ago(c.last.createdAt) : ''}</span></div>
    <div class="c-title">${c.role === 'buyer' ? '🛒 ' : '🏷️ '}${esc(c.request?.title || c.product?.title || '')}</div><div class="row spread" style="flex-wrap:nowrap"><span class="c-last">${esc(c.last ? (c.last.type === 'system' ? 'ℹ ' : '') + c.last.content : 'No messages yet')}</span>${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</div></div></a>`).join('')
    : '<div class="empty small">No conversations yet.<br>Chat with a seller or make an offer to start one.</div>';
}
async function openThread(id, keepScroll) {
  const c = await api('/conversations/' + id);
  if (S.openConv !== id) { if (S.openConv) S.socket?.emit('leave', S.openConv); S.openConv = id; S.socket?.emit('join', id); }
  refreshSummary(); loadConvList(id);
  const el = $('#thread'); if (!el) return;
  const old = $('#msgs'); const nearBottom = !old || old.scrollHeight - old.scrollTop - old.clientHeight < 150;
  const prevScroll = keepScroll && old && !nearBottom ? old.scrollTop : null;
  const d = c.deal; const isBuyer = c.role === 'buyer'; const o = c.offer;
  const dealPanel = d ? `<div class="notice ${d.status === 'completed' ? 'ok' : d.status === 'cancelled' ? 'bad' : ''}" style="margin-top:8px"><b>Deal · ${inr(d.agreedPrice)}</b> — ${{ awaiting_confirmation: 'waiting for both to confirm', confirmed: 'confirmed by both', completed: 'completed', cancelled: 'cancelled' }[d.status]}
      <div class="deal-steps"><div class="done">Offer accepted</div><div class="${['confirmed', 'completed'].includes(d.status) ? 'done' : ''}">Both confirm ${Object.values(d.confirmations).filter(Boolean).length}/2</div><div class="${d.paymentStatus === 'paid' ? 'done' : ''}">Payment ${d.paymentStatus === 'paid' ? 'received' : 'pending'}</div><div class="${d.status === 'completed' ? 'done' : ''}">Completed</div></div>
      ${!['completed', 'cancelled'].includes(d.status) ? `<div class="row">${!d.confirmations[S.me.id] ? '<button class="btn sm ok" data-deal="confirm">✔ Confirm deal</button>' : '<span class="small">You confirmed ✔</span>'}
        ${!isBuyer && d.paymentStatus !== 'paid' ? '<button class="btn sm ghost" data-deal="paid">₹ Mark payment received</button>' : ''}
        ${d.status === 'confirmed' ? '<button class="btn sm" data-deal="complete">🎉 Mark completed</button>' : ''}<button class="btn sm danger" data-deal="cancel">Cancel deal</button></div>` : ''}
      ${d.status === 'completed' ? '<a class="btn sm" href="#/dashboard/deals" style="margin-top:6px">⭐ Rate this deal</a>' : ''}</div>` : '';
  el.innerHTML = `<div class="thread-head"><a class="back-link btn ghost sm" href="#/chat">←</a><a href="#/user/${c.other.id}" class="row" style="text-decoration:none;flex:1;min-width:0;flex-wrap:nowrap">${av(c.other)}<div style="min-width:0"><b>${esc(c.other.name)}</b> ${c.other.verified === 'id' ? '<span class="verified">✔</span>' : ''}<div class="tiny muted">${c.role === 'buyer' ? 'Seller' : 'Buyer'} · ${c.other.rating.avg ? '★ ' + c.other.rating.avg : 'New user'}</div></div></a>
      <div class="menu"><button class="iconbtn" id="cMenu">⋮</button><div class="menu-pop hidden" id="cPop">
        ${c.contactShared[S.me.id] ? '<button disabled>✔ Contact shared</button>' : '<button id="shareC">📞 Share my contact details</button>'}
        <button id="blockU">${c.blockedByMe ? '✔ Unblock user' : '⛔ Block user'}</button><button id="repU">⚑ Report user</button></div></div></div>
    <details class="ctx" ${o || d ? 'open' : ''}><summary><span>${c.request ? `🛒 ${esc(c.request.title)} · budget ${inr(c.request.budgetMax)}` : c.product ? `🏷️ ${esc(c.product.title)} · ${inr(c.product.price)}` : ''}</span><span class="tiny muted">details ▾</span></summary>
      ${o ? `<div class="row spread" style="margin-top:8px"><div>Current offer: <b style="font-size:18px">${inr(o.price)}</b> ${o.history.length > 1 ? `<span class="tiny muted">(started ${inr(o.history[0].price)})</span>` : ''} ${c.match ? levelPill(c.match.level) : ''} <span class="pill ${o.status === 'accepted' ? 'ok' : o.status === 'rejected' ? 'bad' : 'grey'}">${esc(o.status)}</span></div>
        <div class="row">${o.status === 'pending' ? `${(isBuyer || o.lastBy) && o.lastBy !== S.me.id ? '<button class="btn sm ok" data-oa="accept">✔ Accept</button>' : ''}<button class="btn sm ghost" data-oa="counter">↔ ${isBuyer ? 'Counter' : 'Revise price'}</button>${isBuyer ? '<button class="btn sm danger" data-oa="reject">Reject</button>' : '<button class="btn sm danger" data-oa="withdraw">Withdraw</button>'}` : ''}</div></div>
        ${c.match ? `<details style="margin-top:6px"><summary class="small" style="font-weight:600;color:var(--blue)">Requirement check</summary>${matchTable(c.match)}</details>` : ''}` : ''}
      ${c.product && !o ? `<div class="row" style="margin-top:8px"><a href="#/product/${c.product.id}" class="btn sm ghost">View ad</a></div>` : ''}
      ${c.otherContact ? `<div class="notice ok" style="margin-top:8px">📞 ${esc(c.other.name)}: <b>${esc(c.otherContact.phone)}</b> ${c.otherContact.email ? '· ' + esc(c.otherContact.email) : ''}</div>` : ''}
      ${dealPanel}</details>
    <div class="msgs" id="msgs"></div><div class="typing" id="typing"></div>
    ${c.blocked ? '<div class="notice bad" style="margin:10px">Messaging is blocked in this conversation.</div>' : `<form class="composer" id="comp">
      <label class="iconbtn" title="Send photo, video or document">📎<input type="file" id="att" multiple accept="image/*,video/*,application/pdf" hidden></label>
      ${!o && c.product ? '<button type="button" class="btn ghost sm" id="priceBtn" style="height:44px">₹ Offer</button>' : ''}
      <input type="text" id="msgIn" placeholder="Type a message" autocomplete="off"><button class="btn" style="height:44px;border-radius:999px">Send</button></form>
      <div class="row" style="padding:0 10px 10px;gap:6px">${(isBuyer ? ['Is it still available?', 'Can you share actual photos?', 'What is your final price?', 'When can I inspect it?'] : ['Yes, it is available', 'I can share more photos', 'You can inspect before paying', 'Price is slightly negotiable']).map(t => `<button type="button" class="chip" data-quick="${esc(t)}" style="cursor:pointer">${esc(t)}</button>`).join('')}</div>`}`;
  const box = $('#msgs'); box.innerHTML = ''; c.messages.forEach(m => appendMessage(m, false, c));
  box.scrollTop = prevScroll ?? box.scrollHeight; el._conv = c;
  $('#cMenu').onclick = e => { e.stopPropagation(); $('#cPop').classList.toggle('hidden'); };
  $('#shareC') && ($('#shareC').onclick = () => api(`/conversations/${id}/share-contact`, { method: 'POST' }).then(() => openThread(id)).catch(fail));
  $('#blockU').onclick = () => api('/block/' + c.other.id, { method: 'POST' }).then(r => { toast(r.blocked ? 'User blocked' : 'User unblocked'); openThread(id); }).catch(fail);
  $('#repU').onclick = () => report(c.other.id, id);
  $$('[data-oa]').forEach(b => b.onclick = async () => {
    let price; if (b.dataset.oa === 'counter') { price = await askPrice(isBuyer ? 'Counter-offer' : 'Revise your price', `Buyer budget ${inr(c.request.budgetMax)} · current ${inr(o.price)}`); if (!price) return; }
    api(`/offers/${o.id}/action`, { body: { action: b.dataset.oa, price } }).then(() => openThread(id)).catch(fail);
  });
  $$('[data-deal]').forEach(b => b.onclick = () => api(`/deals/${d.id}/action`, { body: { action: b.dataset.deal } }).then(() => openThread(id)).catch(fail));
  const comp = $('#comp'); if (!comp) return;
  const send = (content, attachments = []) => api(`/conversations/${id}/messages`, { body: { content, attachments } }).catch(fail);
  comp.onsubmit = e => { e.preventDefault(); const v = $('#msgIn').value.trim(); if (!v) return; $('#msgIn').value = ''; send(v); };
  $('#msgIn').oninput = () => S.socket?.emit('typing', id);
  $('#att').onchange = async e => { try { const files = await uploadFiles(e.target.files); send('', files); } catch (err) { fail(err); } };
  $$('[data-quick]').forEach(b => b.onclick = () => send(b.dataset.quick));
  $('#priceBtn') && ($('#priceBtn').onclick = async () => { const price = await askPrice('Make an offer', `Listed at ${inr(c.product.price)}`); if (price) api(`/conversations/${id}/messages`, { body: { type: 'price', price } }).catch(fail); });
  $('#msgIn').focus();
}
function appendMessage(m, live, conv) {
  const box = $('#msgs'); if (!box) return; conv = conv || $('#thread')._conv;
  if (box.querySelector(`[data-mid="${m.id}"]`)) return;
  const me = m.senderId === S.me.id; const div = document.createElement('div'); div.dataset.mid = m.id;
  const tick = me ? `<span class="tick ${m.readAt ? 'read' : ''}">${m.readAt || m.deliveredAt ? '✓✓' : '✓'}</span>` : '';
  if (m.type === 'system') { div.className = 'sys'; div.textContent = m.content; }
  else if (['offer', 'counter', 'price'].includes(m.type)) {
    div.className = 'bubble ' + (me ? 'me' : '');
    const canRespond = m.type === 'price' && !me && m.status === 'open';
    div.innerHTML = `<div class="offer-card"><div class="lbl">${m.type === 'offer' ? 'Offer sent' : m.type === 'price' ? 'Price offer' : m.content.split(':')[0]}</div><div class="amt">${inr(m.price)}</div><div class="small muted">${esc(m.type === 'offer' ? m.content.replace('Offer: ', '') : '')}</div>
      ${m.type === 'price' ? `<div style="margin-top:6px">${canRespond ? `<div class="row"><button class="btn sm ok" data-resp="1">Accept</button><button class="btn sm danger" data-resp="0">Decline</button></div>` : `<span class="pill ${m.status === 'accepted' ? 'ok' : m.status === 'declined' ? 'bad' : 'grey'}">${m.status === 'open' ? 'Waiting for reply' : esc(m.status)}</span>`}</div>` : ''}</div><div class="t">${time(m.createdAt)}${tick}</div>`;
    $$('[data-resp]', div).forEach(b => b.onclick = () => api(`/messages/${m.id}/respond`, { body: { accept: b.dataset.resp === '1' } }).then(() => openThread(conv.id)).catch(fail));
  } else {
    div.className = 'bubble ' + (me ? 'me' : '');
    const atts = (m.attachments || []).map(a => /^image/.test(a.type) ? `<a href="${esc(a.url)}" target="_blank"><img src="${esc(a.url)}"></a>` : /^video/.test(a.type) ? `<video src="${esc(a.url)}" controls></video>` : `<a href="${esc(a.url)}" target="_blank">📄 ${esc(a.name || 'Document')}</a>`).join('');
    div.innerHTML = `${atts}${m.content ? `<div>${esc(m.content)}</div>` : ''}<div class="t">${time(m.createdAt)}${tick}</div>`;
  }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  box.append(div);
  if (live) { if (atBottom || me) box.scrollTop = box.scrollHeight; if (!me) S.socket?.emit('read', m.conversationId); }
}

// ---------- dashboard ----------
async function dashboard(tab = 'requests') {
  if (!requireLogin()) return;
  const tabs = [['requests', '🛒 My requests'], ['received', '📥 Offers received'], ['listings', '🏷️ My listings'], ['offers', '📤 My offers'], ['deals', '🤝 Deals'], ['saved', '♡ Saved']];
  app.innerHTML = `<h1>My Wantly</h1><div class="tabs">${tabs.map(([k, l]) => `<a href="#/dashboard/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div><div id="dash"></div>`;
  const el = $('#dash');
  const groups = (list, key, order, labels, render) => order.map(s => { const items = list.filter(x => (typeof key === 'function' ? key(x) : x[key]) === s); return items.length ? `<h3 style="margin-top:18px">${labels[s]} <span class="muted">(${items.length})</span></h3><div class="grid">${items.map(render).join('')}</div>` : ''; }).join('');
  if (tab === 'requests') {
    const list = await api('/requests?mine=1');
    el.innerHTML = list.length ? `<div class="row spread"><span class="muted">${list.length} requests</span><a class="btn sm" href="#/post">＋ New request</a></div>` + groups(list.filter(r => r.status !== 'deleted'), 'status', ['active', 'paused', 'closed', 'cancelled'], { active: 'Active', paused: 'Paused', closed: 'Completed purchases / closed', cancelled: 'Expired or cancelled' }, wantCard) : empty('🛒', "You haven't posted any buying requests.", '#/post', 'Post your first want');
  } else if (tab === 'listings') {
    const list = await api('/products?mine=1');
    el.innerHTML = list.length ? `<div class="row spread"><span class="muted">${list.length} ads</span><a class="btn sm" href="#/sell">＋ New ad</a></div>` + groups(list, 'status', ['active', 'paused', 'sold'], { active: 'Active', paused: 'Inactive', sold: 'Sold' }, productCard) : empty('🏷️', 'You have no ads yet.', '#/sell', 'Sell something');
  } else if (tab === 'received' || tab === 'offers') {
    const list = await api(tab === 'received' ? '/offers/received' : '/offers/mine');
    el.innerHTML = list.length ? `<div class="panel tablewrap"><table class="t"><thead><tr><th>${tab === 'received' ? 'Seller' : 'Buyer'}</th><th>Request</th><th>Offer</th>${tab === 'received' ? '<th>Match</th>' : ''}<th>Status</th><th></th></tr></thead><tbody>
      ${list.map(o => { const u = tab === 'received' ? o.seller : o.buyer; return `<tr><td><div class="row" style="flex-wrap:nowrap">${av(u)}<b>${esc(u?.name)}</b></div></td><td><a href="#/request/${o.request?.id}">${esc(o.request?.title)}</a><div class="tiny muted">budget ${inr(o.request?.budgetMax)}</div></td><td><b>${inr(o.price)}</b><div class="tiny muted">${ago(o.createdAt)}</div></td>${tab === 'received' ? `<td>${levelPill(o.match.level)}</td>` : ''}<td><span class="pill ${o.status === 'accepted' ? 'ok' : o.status === 'rejected' ? 'bad' : 'grey'}">${esc(o.status)}</span></td><td><a class="btn sm" href="#/chat/${o.conversationId}">Chat</a></td></tr>`; }).join('')}</tbody></table></div>`
      : tab === 'received' ? empty('📥', 'No offers yet.', '#/post', 'Post a request') : empty('📤', "You haven't made any offers. Browse what buyers want.", '#/', 'Browse buyer requests');
  } else if (tab === 'deals') {
    const list = await api('/deals');
    el.innerHTML = list.length ? list.map(d => { const buyer = d.buyerId === S.me.id; const other = buyer ? d.seller : d.buyer; return `<div class="panel"><div class="row spread"><div><span class="pill ${buyer ? 'info' : 'warn'}">${buyer ? 'Purchase' : 'Sale'}</span> <b style="font-size:17px">${esc(d.title)}</b><div class="small muted">with ${esc(other?.name)} · ${ago(d.createdAt)}</div></div>
      <div style="text-align:right"><div class="price">${inr(d.agreedPrice)}</div><span class="pill ${d.status === 'completed' ? 'ok' : d.status === 'cancelled' ? 'bad' : 'grey'}">${d.status.replace('_', ' ')}</span> <span class="pill ${d.paymentStatus === 'paid' ? 'ok' : 'grey'}">payment: ${d.paymentStatus.replace('_', ' ')}</span></div></div>
      <div class="row" style="margin-top:10px">${d.conversationId ? `<a class="btn sm ghost" href="#/chat/${d.conversationId}">Open chat</a>` : ''}
      ${d.status === 'completed' ? d.myReview ? `<span class="small">You rated ${'★'.repeat(d.myReview.rating)}</span>` : `<form class="row" data-review="${d.id}"><select class="inp" style="width:auto" name="rating"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select><input class="inp" name="comment" placeholder="How was the deal?" style="width:260px"><button class="btn sm">Submit review</button></form>` : ''}</div></div>`; }).join('')
      : empty('🤝', 'No deals yet. Accepted offers appear here.', '#/', 'Find something');
    $$('[data-review]').forEach(f => f.onsubmit = e => { e.preventDefault(); api(`/deals/${f.dataset.review}/review`, { body: { rating: +f.rating.value, comment: f.comment.value } }).then(() => { toast('Thanks for the review!'); route(); }).catch(fail); });
  } else if (tab === 'saved') {
    const s = await api('/saved');
    el.innerHTML = (s.requests.length ? `<h3>Saved buyer requests</h3><div class="grid">${s.requests.map(wantCard).join('')}</div>` : '') + (s.products.length ? `<h3 style="margin-top:20px">Saved ads</h3><div class="grid">${s.products.map(productCard).join('')}</div>` : '') + (s.users.length ? `<h3 style="margin-top:20px">Saved sellers</h3><div class="row">${s.users.map(u => `<a class="panel row" href="#/user/${u.id}" style="text-decoration:none">${av(u)}<b>${esc(u.name)}</b></a>`).join('')}</div>` : '') || empty('♡', 'Tap the heart on ads, requests or sellers to save them.', '#/', 'Browse');
    bindSaves();
  }
}
const empty = (icon, text, href, label) => `<div class="empty"><div class="big">${icon}</div><p>${text}</p>${href ? `<a class="btn" href="${href}">${label}</a>` : ''}</div>`;

// ---------- notifications ----------
async function notifications() {
  if (!requireLogin()) return;
  const list = await api('/notifications');
  const icon = { offer: '💰', message: '💬', deal: '🤝', match: '🎯', report: '⚑' };
  app.innerHTML = `<div class="form"><div class="row spread"><h1>Notifications</h1><button class="btn ghost sm" id="markAll">Mark all read</button></div>
    <div class="panel" style="padding:0">${list.length ? list.map(n => `<a class="notif ${n.readAt ? '' : 'unread'}" href="${esc(n.link || '#/')}"><span style="font-size:22px">${icon[n.type] || '🔔'}</span><div class="grow"><div>${esc(n.text)}</div><div class="tiny muted">${ago(n.createdAt)}</div></div>${n.readAt ? '' : '<span class="pill info">new</span>'}</a>`).join('') : empty('🔔', "You're all caught up.")}</div></div>`;
  $('#markAll').onclick = () => api('/notifications/read', { method: 'POST' }).then(() => { refreshSummary(); route(); });
  api('/notifications/read', { method: 'POST' }).then(refreshSummary);
}

// ---------- profiles ----------
async function userPage(id) {
  const u = await api('/users/' + id); const me = S.me?.id === id;
  app.innerHTML = `<div class="two"><div>
    ${u.products.length ? `<h2>Ads by ${esc(u.name)}</h2><div class="grid">${u.products.map(productCard).join('')}</div>` : ''}
    ${u.requests.length ? `<h2 style="margin-top:24px">${esc(u.name)} is looking for</h2><div class="grid">${u.requests.map(r => wantCard({ ...r, offerCount: 0, specs: r.specs })).join('')}</div>` : ''}
    ${!u.products.length && !u.requests.length ? empty('📭', 'No active ads or requests.') : ''}
    <h2 style="margin-top:24px">Reviews</h2><div class="panel">${u.reviews.length ? u.reviews.map(r => `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row">${av(r.reviewer)}<b>${esc(r.reviewer?.name)}</b><span class="stars">${'★'.repeat(r.rating)}</span><span class="tiny muted">${ago(r.createdAt)}</span></div><p style="margin:6px 0 0">${esc(r.comment)}</p></div>`).join('') : '<span class="muted">No reviews yet.</span>'}</div>
  </div><aside><div class="panel stack" style="text-align:center">${av(u, 'lg')}<h2 style="margin:0">${esc(u.name)}</h2><div>${verifiedBadge(u)}</div><div>${stars(u.rating)}</div>
    <div class="small muted">📍 ${esc(u.city || '')} · Member since ${new Date(u.joined).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</div><div class="small"><b>${u.completedDeals}</b> completed deals</div>
    ${me ? '<a class="btn ghost" href="#/profile">Edit profile</a>' : S.me ? `<button class="btn ghost" data-save="${u.id}">♡ Save seller</button><button class="btn link small" id="repU">⚑ Report user</button>` : ''}</div></aside></div>`;
  bindSaves(); $('#repU') && ($('#repU').onclick = () => report(u.id));
}
async function profilePage() {
  if (!requireLogin()) return;
  const me = await api('/me');
  app.innerHTML = `<div class="form"><h1>Profile & settings</h1><form class="panel" id="pf">
    <div class="row" style="margin-bottom:16px">${av(me, 'lg')}<div><b>${esc(me.name)}</b><div>${verifiedBadge(me)}</div></div></div>
    <div class="cols"><div class="field"><label>Name</label><input id="n" value="${esc(me.name)}"></div><div class="field"><label>City</label><input id="c" value="${esc(me.city)}"></div></div>
    <div class="cols"><div class="field"><label>Phone (verified, private)</label><input value="${esc(me.phone)}" disabled></div><div class="field"><label>Email (private)</label><input id="e" type="email" value="${esc(me.email || '')}"></div></div>
    <div class="notice small" style="margin-bottom:14px">🔒 Privacy: your phone and email are never shown publicly. They're only revealed to someone in a chat if you tap “Share my contact details”.</div>
    <div class="field"><label>Identity verification</label><div class="row"><span class="pill ${me.verified === 'id' ? 'ok' : 'grey'}">${me.verified === 'id' ? 'ID verified' : 'Phone verified only'}</span><span class="small muted">ID verification is done by an admin in this demo.</span></div></div>
    <button class="btn">Save</button></form></div>`;
  $('#pf').onsubmit = e => { e.preventDefault(); api('/me', { method: 'PATCH', body: { name: $('#n').value, city: $('#c').value, email: $('#e').value } }).then(u => { S.me = { ...S.me, ...u }; renderNav(); toast('Saved'); }).catch(fail); };
}

// ---------- admin ----------
async function adminPage() {
  if (!requireLogin()) return;
  const a = await api('/admin/overview');
  const st = a.stats;
  app.innerHTML = `<h1>🛡️ Admin panel</h1>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:20px">${[['Users', st.users], ['Active requests', st.activeRequests], ['Active ads', st.listings], ['Offers', st.offers], ['Deals', st.deals], ['Completed', st.completed], ['Messages', st.messages], ['Open reports', st.openReports]].map(([l, v]) => `<div class="stat"><span class="small muted">${l}</span><b>${v}</b></div>`).join('')}</div>
  <div class="panel"><h2>Reports</h2>${a.reports.length ? `<div class="tablewrap"><table class="t"><thead><tr><th>When</th><th>Reporter</th><th>Reported</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${a.reports.map(r => `<tr><td>${ago(r.createdAt)}</td><td>${esc(r.reporter?.name)}</td><td>${esc(r.reported?.name)}</td><td>${esc(r.reason)}</td><td><span class="pill ${r.status === 'open' ? 'warn' : 'ok'}">${r.status}</span></td><td>${r.status === 'open' ? `<button class="btn sm" data-rep="${r.id}">Resolve</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No reports. 🎉</p>'}</div>
  <div class="panel"><h2>Users</h2><div class="tablewrap"><table class="t"><thead><tr><th>User</th><th>Phone</th><th>Ads</th><th>Requests</th><th>Reports</th><th>Verification</th><th></th></tr></thead><tbody>${a.users.map(u => `<tr><td><div class="row" style="flex-wrap:nowrap">${av(u)}<b>${esc(u.name)}</b>${u.isAdmin ? '<span class="pill info">admin</span>' : ''}${u.suspended ? '<span class="pill bad">suspended</span>' : ''}</div></td><td>${esc(u.phone)}</td><td>${u.listings}</td><td>${u.requests}</td><td>${u.reportsAgainst ? `<span class="pill bad">${u.reportsAgainst}</span>` : 0}</td>
    <td><select class="inp" style="width:auto;padding:4px 8px" data-ver="${u.id}"><option value="phone">Phone</option><option value="id">ID verified</option></select></td><td>${u.isAdmin ? '' : `<button class="btn sm ${u.suspended ? 'ghost' : 'danger'}" data-sus="${u.id}" data-v="${u.suspended ? '' : '1'}">${u.suspended ? 'Unsuspend' : 'Suspend'}</button>`}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="two" style="margin-top:16px;grid-template-columns:1fr 1fr"><div class="panel"><h2>Buyer requests</h2><div class="tablewrap"><table class="t"><tbody>${a.requests.map(r => `<tr><td><a href="#/request/${r.id}">${esc(r.title)}</a><div class="tiny muted">${esc(r.buyer)} · ${r.status}</div></td><td><button class="btn sm ghost" data-feat="${r.id}" data-v="${r.featured ? '' : '1'}">${r.featured ? '★ Unfeature' : '☆ Feature'}</button></td><td><button class="btn sm danger" data-rm="${r.id}">Remove</button></td></tr>`).join('')}</tbody></table></div></div>
    <div class="panel"><h2>Ads</h2><div class="tablewrap"><table class="t"><tbody>${a.products.map(p => `<tr><td><a href="#/product/${p.id}">${esc(p.title)}</a><div class="tiny muted">${esc(p.seller)} · ${inr(p.price)} · ${p.status}</div></td><td><button class="btn sm ghost" data-feat="${p.id}" data-v="${p.featured ? '' : '1'}">${p.featured ? '★ Unfeature' : '☆ Feature'}</button></td><td><button class="btn sm danger" data-rm="${p.id}">Remove</button></td></tr>`).join('')}</tbody></table></div></div></div>
  <div class="panel"><h2>Categories</h2><div class="row">${a.categories.map(c => `<span class="chip">${c.icon} ${esc(c.name)}</span>`).join('')}</div>
    <form class="row" id="catF" style="margin-top:12px"><input class="inp" id="cIcon" placeholder="🎮" style="width:70px"><input class="inp" id="cName" placeholder="New category name" style="width:240px"><button class="btn sm">Add category</button></form></div>
  <div class="panel"><h2>Demo controls</h2><p class="small muted">Wipe everything and restore the seed data. Everyone is logged out.</p><button class="btn danger" id="reset">Reset demo data</button></div>`;
  $$('[data-ver]').forEach(s => { s.value = a.users.find(u => u.id === s.dataset.ver).verified === 'id' ? 'id' : 'phone'; s.onchange = () => api('/admin/users/' + s.dataset.ver, { body: { verified: s.value } }).then(() => toast('Verification updated')).catch(fail); });
  $$('[data-sus]').forEach(b => b.onclick = () => api('/admin/users/' + b.dataset.sus, { body: { suspended: !!b.dataset.v } }).then(() => route()).catch(fail));
  $$('[data-rep]').forEach(b => b.onclick = () => api('/admin/reports/' + b.dataset.rep, { body: { status: 'resolved' } }).then(() => route()).catch(fail));
  $$('[data-feat]').forEach(b => b.onclick = () => api('/admin/feature', { body: { id: b.dataset.feat, featured: !!b.dataset.v } }).then(() => route()).catch(fail));
  $$('[data-rm]').forEach(b => b.onclick = () => api('/admin/feature', { body: { id: b.dataset.rm, status: 'deleted' } }).then(() => { toast('Removed'); route(); }).catch(fail));
  $('#catF').onsubmit = e => { e.preventDefault(); api('/admin/categories', { body: { name: $('#cName').value, icon: $('#cIcon').value } }).then(async () => { S.cats = await api('/categories'); route(); }).catch(fail); };
  $('#reset').onclick = async () => { if (await modal('<h2>Reset demo data?</h2><p class="muted">All new users, ads, chats and deals will be deleted.</p><div class="row"><button class="btn danger" id="y">Reset</button><button class="btn ghost" data-close>Cancel</button></div>', (m, close) => $('#y', m).onclick = () => close(true))) { await api('/admin/reset', { method: 'POST' }); logout(true); S.cats = await api('/categories'); location.hash = '#/login'; toast('Demo data restored'); } };
}

// ---------- login ----------
async function loginPage() {
  const users = await api('/demo-users');
  app.innerHTML = `<div class="login"><div class="panel"><h1>Try a demo account</h1><p class="muted">One click. Open a second browser window (or incognito) as another user to see real-time chat.</p>
      <div class="stack">${users.map(u => `<button class="demo-user" data-uid="${u.id}">${av(u, 'lg')}<div><b style="font-size:17px">${esc(u.name)}</b><div class="small muted">${esc(u.bio || '')}</div></div></button>`).join('')}</div></div>
    <div class="panel"><h1>Login with phone</h1><p class="muted">New here? We'll create your account.</p>
      <form id="otpF"><div class="field"><label>Phone number</label><input id="ph" inputmode="numeric" placeholder="10-digit mobile number" required></div><button class="btn">Send OTP</button></form>
      <form id="verF" class="hidden" style="margin-top:16px"><div class="notice" id="otpNote"></div>
        <div class="field" style="margin-top:12px"><label>Enter OTP</label><input id="otp" inputmode="numeric" maxlength="6" required></div>
        <div id="newFields" class="hidden"><div class="field"><label>Your name</label><input id="nm"></div><div class="field"><label>City</label><input id="ct" value="Hyderabad"></div></div>
        <button class="btn">Verify & continue</button></form></div></div>`;
  const after = () => { const to = sessionStorage.getItem('w_after') || '#/'; sessionStorage.removeItem('w_after'); location.hash = to === '#/login' ? '#/' : to; };
  $$('[data-uid]').forEach(b => b.onclick = async () => { try { const r = await api('/auth/demo', { body: { userId: b.dataset.uid } }); await setSession(r.token, r.user); toast('Welcome, ' + r.user.name + '!'); after(); } catch (e) { fail(e); } });
  $('#otpF').onsubmit = async e => { e.preventDefault(); try { const r = await api('/auth/otp', { body: { phone: $('#ph').value } }); $('#verF').classList.remove('hidden'); $('#newFields').classList.toggle('hidden', r.exists); $('#otpNote').innerHTML = `Demo mode: no SMS is sent. Your OTP is <b>${r.demoOtp}</b>`; $('#otp').value = ''; $('#otp').focus(); } catch (e) { fail(e); } };
  $('#verF').onsubmit = async e => { e.preventDefault(); try { const r = await api('/auth/verify', { body: { phone: $('#ph').value, otp: $('#otp').value, name: $('#nm').value, city: $('#ct').value } }); await setSession(r.token, r.user); toast('Welcome, ' + r.user.name + '!'); after(); } catch (e) { fail(e); } };
}

// ---------- boot ----------
(async function boot() {
  S.cats = await api('/categories');
  if (S.token) { try { S.me = await api('/me'); connectSocket(); await refreshSummary(); } catch { S.token = null; localStorage.removeItem('w_token'); } }
  renderNav(); route();
})();
