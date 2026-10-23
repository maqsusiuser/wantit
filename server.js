// Wantly — Buyer-first marketplace (demo)
// Run: npm install && npm start  → http://localhost:3000
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- storage (JSON file, good enough for a demo) ----------
let db;
const empty = () => ({ users: [], requests: [], products: [], offers: [], conversations: [], messages: [], deals: [], notifications: [], reports: [], reviews: [], saved: [], blocks: [], categories: [] });
function load() {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  else { db = empty(); require('./seed')(db, id); }
  for (const k of Object.keys(empty())) db[k] = db[k] || [];
  save();
}
let saveTimer;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 1)), 100); }
function id(prefix) { return prefix + '_' + crypto.randomBytes(5).toString('hex'); }
const now = () => new Date().toISOString();
const sessions = new Map(); // token -> userId
const otps = new Map();     // phone -> otp

// ---------- matching engine ----------
// Fields whose value is a seller *claim* that can't be checked by the platform.
const CLAIM_FIELDS = ['battery', 'screen', 'body', 'condition', 'repair', 'damage', 'scratch', 'warranty', 'bill', 'invoice', 'km', 'kilometer', 'owner'];
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9.%+ ]/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
const LOWER_IS_BETTER = ['km', 'kms', 'kilometer', 'kilometers', 'age', 'owner', 'owners', 'driven'];
const hasWord = (text, words) => { const t = norm(text).split(' '); return words.some(w => t.includes(w)); };
function compareValue(field, want, have) {
  if (have == null || String(have).trim() === '') return 'missing';
  const w = norm(want), h = norm(have);
  if (!w || w === 'any') return 'match';
  if (w === h || h.includes(w) || w.includes(h)) return 'match';
  const wn = num(want), hn = num(have);
  if (wn != null && hn != null) {
    const f = norm(field);
    if (hasWord(field, LOWER_IS_BETTER)) return hn <= wn ? 'match' : 'mismatch';
    return hn >= wn ? 'match' : 'mismatch'; // "at least" semantics: 256 GB satisfies 128 GB
  }
  if (['yes', 'required', 'true'].includes(w)) return ['yes', 'available', 'true', 'included'].some(x => h.includes(x)) ? 'match' : 'mismatch';
  // token overlap (e.g. "original unreplaced" vs "original screen")
  const wt = w.split(' ').filter(t => t.length > 2), ht = new Set(h.split(' '));
  const overlap = wt.filter(t => ht.has(t)).length;
  return wt.length && overlap / wt.length >= 0.5 ? 'match' : 'mismatch';
}
function matchOffer(request, attrs, price) {
  const lookup = {};
  for (const a of attrs || []) lookup[norm(a.field)] = a;
  const rows = request.specs.map(s => {
    const a = lookup[norm(s.field)] || Object.values(lookup).find(x => norm(x.field).includes(norm(s.field)) || norm(s.field).includes(norm(x.field)));
    let result = compareValue(s.field, s.value, a?.value);
    const isClaim = hasWord(s.field, CLAIM_FIELDS);
    if (result === 'match' && isClaim && !a?.verified) result = 'claimed';
    return { field: s.field, want: s.value, have: a?.value ?? '', mandatory: !!s.mandatory, result };
  });
  const priceOk = price == null || price <= request.budgetMax;
  rows.push({ field: 'Price', want: 'Up to ₹' + fmt(request.budgetMax), have: price == null ? '' : '₹' + fmt(price), mandatory: true, result: priceOk ? 'match' : 'mismatch' });
  const mand = rows.filter(r => r.mandatory), pref = rows.filter(r => !r.mandatory);
  const ok = r => r.result === 'match' || r.result === 'claimed';
  let level;
  if (mand.some(r => r.result === 'mismatch')) level = 'none';
  else if (mand.every(ok) && pref.every(ok)) level = 'exact';
  else if (mand.every(ok)) level = 'partial';
  else level = 'partial'; // some mandatory info missing — buyer must ask
  const met = rows.filter(ok).length;
  return { level, rows, score: Math.round(100 * met / rows.length), needsVerification: rows.some(r => r.result === 'claimed') };
}
const fmt = n => Number(n).toLocaleString('en-IN');

// ---------- app ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));
const upload = multer({
  storage: multer.diskStorage({ destination: UPLOAD_DIR, filename: (_, f, cb) => cb(null, id('img') + path.extname(f.originalname).toLowerCase()) }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^(image|video)\//.test(f.mimetype) || f.mimetype === 'application/pdf'),
});

const publicUser = u => u && ({ id: u.id, name: u.name, city: u.city, verified: u.verified, isAdmin: !!u.isAdmin, joined: u.createdAt, avatar: u.avatar, rating: ratingOf(u.id), suspended: !!u.suspended });
function ratingOf(uid) { const r = db.reviews.filter(x => x.reviewedUserId === uid); return { avg: r.length ? +(r.reduce((a, b) => a + b.rating, 0) / r.length).toFixed(1) : null, count: r.length }; }
const userById = uid => db.users.find(u => u.id === uid);

function auth(req, res, next) {
  const uid = sessions.get(req.get('x-token'));
  const u = uid && userById(uid);
  if (!u) return res.status(401).json({ error: 'Please log in' });
  if (u.suspended) return res.status(403).json({ error: 'Account suspended by admin' });
  req.user = u; next();
}
function optionalAuth(req, _res, next) { const uid = sessions.get(req.get('x-token')); req.user = uid && userById(uid); next(); }
const adminOnly = (req, res, next) => req.user.isAdmin ? next() : res.status(403).json({ error: 'Admins only' });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

function notify(userId, type, text, link) {
  const n = { id: id('ntf'), userId, type, text, link, createdAt: now(), readAt: null };
  db.notifications.push(n); save();
  io.to('u:' + userId).emit('notification', n);
}
const isBlocked = (a, b) => db.blocks.some(x => (x.by === a && x.user === b) || (x.by === b && x.user === a));

// ----- auth (demo OTP) -----
app.post('/api/auth/otp', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (phone.length < 10) return bad(res, 'Enter a valid 10-digit phone number');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otps.set(phone, code);
  // In production this goes out by SMS. For the demo we return it so you can log in.
  res.json({ ok: true, demoOtp: code, exists: db.users.some(u => u.phone === phone) });
});
app.post('/api/auth/verify', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (otps.get(phone) !== String(req.body.otp || '').trim()) return bad(res, 'Wrong OTP');
  otps.delete(phone);
  let u = db.users.find(x => x.phone === phone);
  if (!u) {
    if (!req.body.name) return bad(res, 'Enter your name to create an account');
    u = { id: id('usr'), name: String(req.body.name).slice(0, 40), phone, email: req.body.email || '', city: req.body.city || 'Hyderabad', verified: 'phone', createdAt: now() };
    db.users.push(u); save();
  }
  const token = crypto.randomBytes(16).toString('hex'); sessions.set(token, u.id);
  res.json({ token, user: publicUser(u) });
});
app.post('/api/auth/demo', (req, res) => { // one-click login as a seeded demo user
  const u = userById(req.body.userId); if (!u || !u.demo) return bad(res, 'Unknown demo user');
  const token = crypto.randomBytes(16).toString('hex'); sessions.set(token, u.id);
  res.json({ token, user: publicUser(u) });
});
app.get('/api/demo-users', (_, res) => res.json(db.users.filter(u => u.demo).map(u => ({ ...publicUser(u), bio: u.bio }))));
app.get('/api/me', auth, (req, res) => res.json({ ...publicUser(req.user), phone: req.user.phone, email: req.user.email, shareContact: !!req.user.shareContact }));
app.patch('/api/me', auth, (req, res) => {
  const { name, email, city } = req.body;
  if (name) req.user.name = String(name).slice(0, 40);
  if (email !== undefined) req.user.email = String(email).slice(0, 80);
  if (city) req.user.city = String(city).slice(0, 40);
  save(); res.json(publicUser(req.user));
});
app.get('/api/users/:id', (req, res) => {
  const u = userById(req.params.id); if (!u) return bad(res, 'Not found', 404);
  res.json({
    ...publicUser(u),
    reviews: db.reviews.filter(r => r.reviewedUserId === u.id).map(r => ({ ...r, reviewer: publicUser(userById(r.reviewerId)) })),
    products: db.products.filter(p => p.sellerId === u.id && p.status === 'active'),
    requests: db.requests.filter(r => r.buyerId === u.id && r.status === 'active'),
    completedDeals: db.deals.filter(d => d.status === 'completed' && (d.buyerId === u.id || d.sellerId === u.id)).length,
  });
});

app.get('/api/categories', (_, res) => res.json(db.categories));
app.post('/api/upload', auth, upload.array('files', 6), (req, res) => res.json((req.files || []).map(f => ({ url: '/uploads/' + f.filename, type: f.mimetype, name: f.originalname }))));

// ----- buyer requests -----
function decorateRequest(r, viewer) {
  const offers = db.offers.filter(o => o.requestId === r.id && o.status !== 'withdrawn');
  const out = { ...r, buyer: publicUser(userById(r.buyerId)), offerCount: offers.length, lowestOffer: offers.length ? Math.min(...offers.map(o => o.price)) : null, saved: !!viewer && db.saved.some(s => s.userId === viewer.id && s.refId === r.id) };
  if (viewer && viewer.id !== r.buyerId) { // how well do the viewer's own listings fit this request?
    const mine = db.products.filter(p => p.sellerId === viewer.id && p.status === 'active' && p.category === r.category).map(p => ({ product: p, match: matchOffer(r, p.attrs, p.price) }));
    mine.sort((a, b) => b.match.score - a.match.score);
    if (mine[0]) out.myBestMatch = { productId: mine[0].product.id, title: mine[0].product.title, level: mine[0].match.level, score: mine[0].match.score };
    out.myOffer = db.offers.find(o => o.requestId === r.id && o.sellerId === viewer.id && o.status !== 'withdrawn') || null;
  }
  return out;
}
app.get('/api/requests', optionalAuth, (req, res) => {
  const { q, category, city, max, mine, sort } = req.query;
  let list = db.requests.filter(r => mine ? req.user && r.buyerId === req.user.id : r.status === 'active');
  if (!mine) list = list.filter(r => !userById(r.buyerId)?.suspended && !(req.user && isBlocked(req.user.id, r.buyerId)));
  if (q) { const t = norm(q); list = list.filter(r => norm(r.title + ' ' + r.description + ' ' + r.specs.map(s => s.value).join(' ')).includes(t)); }
  if (category) list = list.filter(r => r.category === category);
  if (city) list = list.filter(r => norm(r.location).includes(norm(city)));
  if (max) list = list.filter(r => r.budgetMax <= +max);
  list = list.map(r => decorateRequest(r, req.user));
  if (sort === 'budget') list.sort((a, b) => b.budgetMax - a.budgetMax);
  else if (sort === 'match' && req.user) list.sort((a, b) => (b.myBestMatch?.score || 0) - (a.myBestMatch?.score || 0));
  else list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  res.json(list);
});
app.get('/api/requests/:id', optionalAuth, (req, res) => {
  const r = db.requests.find(x => x.id === req.params.id); if (!r) return bad(res, 'Request not found', 404);
  const out = decorateRequest(r, req.user);
  if (req.user && req.user.id === r.buyerId) {
    out.offers = db.offers.filter(o => o.requestId === r.id && o.status !== 'withdrawn').map(o => ({ ...o, seller: publicUser(userById(o.sellerId)), match: matchOffer(r, o.attrs, o.price), conversationId: db.conversations.find(c => c.offerId === o.id)?.id }));
  }
  res.json(out);
});
function cleanSpecs(specs) {
  return (Array.isArray(specs) ? specs : []).filter(s => s && String(s.field || '').trim() && String(s.value || '').trim()).slice(0, 20).map(s => ({ field: String(s.field).trim().slice(0, 40), value: String(s.value).trim().slice(0, 120), mandatory: !!s.mandatory }));
}
app.post('/api/requests', auth, (req, res) => {
  const b = req.body;
  if (!b.title || !(+b.budgetMax > 0) || !b.category) return bad(res, 'Title, category and budget are required');
  const r = { id: id('req'), buyerId: req.user.id, category: b.category, title: String(b.title).slice(0, 80), description: String(b.description || '').slice(0, 1000), budgetMin: +b.budgetMin || 0, budgetMax: +b.budgetMax, location: b.location || req.user.city, condition: b.condition || 'Any', delivery: b.delivery || 'In-person inspection', allowPartial: b.allowPartial !== false, deadline: b.deadline || null, specs: cleanSpecs(b.specs), images: (b.images || []).slice(0, 6), status: 'active', createdAt: now() };
  db.requests.push(r); save();
  // ping sellers whose listings look like a fit
  const sellers = new Set(db.products.filter(p => p.category === r.category && p.status === 'active' && p.sellerId !== r.buyerId && matchOffer(r, p.attrs, p.price).level !== 'none').map(p => p.sellerId));
  sellers.forEach(s => notify(s, 'match', `New buyer request matches your listing: “${r.title}”`, '#/request/' + r.id));
  io.emit('feed', { type: 'request', id: r.id });
  res.json(r);
});
app.patch('/api/requests/:id', auth, (req, res) => {
  const r = db.requests.find(x => x.id === req.params.id); if (!r) return bad(res, 'Not found', 404);
  if (r.buyerId !== req.user.id && !req.user.isAdmin) return bad(res, 'You can only edit your own requests', 403);
  const b = req.body;
  for (const k of ['title', 'description', 'location', 'condition', 'delivery', 'deadline', 'category']) if (b[k] !== undefined) r[k] = b[k];
  if (b.budgetMax !== undefined) r.budgetMax = +b.budgetMax;
  if (b.allowPartial !== undefined) r.allowPartial = !!b.allowPartial;
  if (b.specs) r.specs = cleanSpecs(b.specs);
  if (b.images) r.images = b.images.slice(0, 6);
  if (b.status && ['active', 'paused', 'closed', 'cancelled'].includes(b.status)) r.status = b.status;
  save(); res.json(r);
});
app.delete('/api/requests/:id', auth, (req, res) => {
  const r = db.requests.find(x => x.id === req.params.id); if (!r) return bad(res, 'Not found', 404);
  if (r.buyerId !== req.user.id && !req.user.isAdmin) return bad(res, 'Not allowed', 403);
  r.status = 'deleted'; save(); res.json({ ok: true });
});

// ----- product listings (OLX-style "for sale") -----
const decorateProduct = (p, viewer) => ({ ...p, seller: publicUser(userById(p.sellerId)), saved: !!viewer && db.saved.some(s => s.userId === viewer.id && s.refId === p.id) });
app.get('/api/products', optionalAuth, (req, res) => {
  const { q, category, city, max, min, mine, sort, condition } = req.query;
  let list = db.products.filter(p => mine ? req.user && p.sellerId === req.user.id && p.status !== 'deleted' : p.status === 'active');
  if (!mine) list = list.filter(p => !userById(p.sellerId)?.suspended && !(req.user && isBlocked(req.user.id, p.sellerId)));
  if (q) { const t = norm(q); list = list.filter(p => norm(p.title + ' ' + p.description + ' ' + p.attrs.map(a => a.value).join(' ')).includes(t)); }
  if (category) list = list.filter(p => p.category === category);
  if (city) list = list.filter(p => norm(p.location).includes(norm(city)));
  if (max) list = list.filter(p => p.price <= +max);
  if (min) list = list.filter(p => p.price >= +min);
  if (condition) list = list.filter(p => p.condition === condition);
  if (sort === 'low') list.sort((a, b) => a.price - b.price);
  else if (sort === 'high') list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  res.json(list.map(p => decorateProduct(p, req.user)));
});
app.get('/api/products/:id', optionalAuth, (req, res) => {
  const p = db.products.find(x => x.id === req.params.id); if (!p || p.status === 'deleted') return bad(res, 'Listing not found', 404);
  p.views = (p.views || 0) + 1; save();
  const out = decorateProduct(p, req.user);
  // buyer requests this listing could satisfy (seller sees these)
  out.matchingRequests = db.requests.filter(r => r.status === 'active' && r.category === p.category && r.buyerId !== p.sellerId).map(r => ({ id: r.id, title: r.title, budgetMax: r.budgetMax, location: r.location, match: matchOffer(r, p.attrs, p.price) })).filter(x => x.match.level !== 'none').sort((a, b) => b.match.score - a.match.score).slice(0, 5);
  res.json(out);
});
const cleanAttrs = a => (Array.isArray(a) ? a : []).filter(x => x && String(x.field || '').trim() && String(x.value || '').trim()).slice(0, 20).map(x => ({ field: String(x.field).trim().slice(0, 40), value: String(x.value).trim().slice(0, 120), verified: false })); // sellers can never self-verify
app.post('/api/products', auth, (req, res) => {
  const b = req.body;
  if (!b.title || !(+b.price > 0) || !b.category) return bad(res, 'Title, category and price are required');
  const p = { id: id('prd'), sellerId: req.user.id, category: b.category, title: String(b.title).slice(0, 80), description: String(b.description || '').slice(0, 1500), price: +b.price, negotiable: b.negotiable !== false, condition: b.condition || 'Used', location: b.location || req.user.city, attrs: cleanAttrs(b.attrs), images: (b.images || []).slice(0, 8), status: 'active', views: 0, createdAt: now() };
  db.products.push(p); save();
  io.emit('feed', { type: 'product', id: p.id });
  res.json(p);
});
app.patch('/api/products/:id', auth, (req, res) => {
  const p = db.products.find(x => x.id === req.params.id); if (!p) return bad(res, 'Not found', 404);
  if (p.sellerId !== req.user.id && !req.user.isAdmin) return bad(res, 'You can only edit your own listings', 403);
  const b = req.body;
  for (const k of ['title', 'description', 'condition', 'location', 'category', 'negotiable']) if (b[k] !== undefined) p[k] = b[k];
  if (b.price !== undefined) p.price = +b.price;
  if (b.attrs) p.attrs = cleanAttrs(b.attrs);
  if (b.images) p.images = b.images.slice(0, 8);
  if (b.status && ['active', 'paused', 'sold', 'deleted'].includes(b.status)) p.status = b.status;
  save(); res.json(p);
});

// ----- saved items -----
app.post('/api/saved/:refId', auth, (req, res) => {
  const i = db.saved.findIndex(s => s.userId === req.user.id && s.refId === req.params.refId);
  if (i >= 0) db.saved.splice(i, 1); else db.saved.push({ userId: req.user.id, refId: req.params.refId, kind: req.params.refId.startsWith('req') ? 'request' : req.params.refId.startsWith('usr') ? 'user' : 'product', createdAt: now() });
  save(); res.json({ saved: i < 0 });
});
app.get('/api/saved', auth, (req, res) => {
  const s = db.saved.filter(x => x.userId === req.user.id);
  res.json({
    requests: s.filter(x => x.kind === 'request').map(x => db.requests.find(r => r.id === x.refId)).filter(r => r && r.status !== 'deleted').map(r => decorateRequest(r, req.user)),
    products: s.filter(x => x.kind === 'product').map(x => db.products.find(p => p.id === x.refId)).filter(p => p && p.status !== 'deleted').map(p => decorateProduct(p, req.user)),
    users: s.filter(x => x.kind === 'user').map(x => publicUser(userById(x.refId))).filter(Boolean),
  });
});

// ----- offers -----
app.post('/api/match-preview', auth, (req, res) => {
  const r = db.requests.find(x => x.id === req.body.requestId); if (!r) return bad(res, 'Not found', 404);
  res.json(matchOffer(r, cleanAttrs(req.body.attrs), +req.body.price || null));
});
function getOrCreateConv({ requestId = null, productId = null, offerId = null, buyerId, sellerId }) {
  let c = db.conversations.find(x => x.buyerId === buyerId && x.sellerId === sellerId && (offerId ? x.offerId === offerId : (x.productId === productId && x.requestId === requestId && !x.offerId)));
  if (!c) { c = { id: id('cnv'), requestId, productId, offerId, buyerId, sellerId, contactShared: { [buyerId]: false, [sellerId]: false }, createdAt: now(), updatedAt: now() }; db.conversations.push(c); }
  return c;
}
function postMessage(conv, senderId, type, content, extra = {}) {
  const m = { id: id('msg'), conversationId: conv.id, senderId, type, content, ...extra, createdAt: now(), deliveredAt: null, readAt: null };
  const otherId = senderId === conv.buyerId ? conv.sellerId : conv.buyerId;
  if (senderId && io.sockets.adapter.rooms.get('u:' + otherId)?.size) m.deliveredAt = m.createdAt; // recipient online
  db.messages.push(m); conv.updatedAt = m.createdAt; save();
  io.to('c:' + conv.id).emit('message', m);
  io.to('u:' + conv.buyerId).to('u:' + conv.sellerId).emit('inbox', { conversationId: conv.id });
  return m;
}
app.post('/api/offers', auth, (req, res) => {
  const b = req.body; const r = db.requests.find(x => x.id === b.requestId);
  if (!r || r.status !== 'active') return bad(res, 'This request is not accepting offers');
  if (r.buyerId === req.user.id) return bad(res, "You can't make an offer on your own request");
  if (isBlocked(req.user.id, r.buyerId)) return bad(res, 'You cannot contact this user', 403);
  if (db.offers.some(o => o.requestId === r.id && o.sellerId === req.user.id && ['pending', 'accepted'].includes(o.status))) return bad(res, 'You already have an open offer here — revise it in chat');
  if (!(+b.price > 0)) return bad(res, 'Enter your offered price');
  let product = b.productId ? db.products.find(p => p.id === b.productId && p.sellerId === req.user.id) : null;
  const attrs = cleanAttrs(b.attrs?.length ? b.attrs : product?.attrs);
  const match = matchOffer(r, attrs, +b.price);
  if (match.level === 'partial' && !r.allowPartial && !b.confirmPartial) return res.status(409).json({ error: 'The buyer only accepts exact matches. Your offer misses some requirements.', match });
  const o = { id: id('off'), requestId: r.id, sellerId: req.user.id, productId: product?.id || null, title: b.title || product?.title || r.title, price: +b.price, attrs, condition: b.condition || product?.condition || 'Used', repairHistory: b.repairHistory || '', accessories: b.accessories || '', warranty: b.warranty || '', delivery: b.delivery || 'Pickup', notes: String(b.notes || '').slice(0, 800), images: (b.images?.length ? b.images : product?.images || []).slice(0, 6), status: 'pending', history: [{ by: req.user.id, price: +b.price, at: now() }], matchLevel: match.level, createdAt: now() };
  db.offers.push(o);
  const c = getOrCreateConv({ requestId: r.id, productId: o.productId, offerId: o.id, buyerId: r.buyerId, sellerId: req.user.id });
  postMessage(c, req.user.id, 'offer', `Offer: ${o.title}`, { price: o.price, offerId: o.id });
  if (o.notes) postMessage(c, req.user.id, 'text', o.notes);
  notify(r.buyerId, 'offer', `${req.user.name} offered ₹${fmt(o.price)} for “${r.title}”`, '#/chat/' + c.id);
  res.json({ offer: o, conversationId: c.id, match });
});
app.get('/api/offers/mine', auth, (req, res) => {
  res.json(db.offers.filter(o => o.sellerId === req.user.id && o.status !== 'withdrawn').map(o => { const r = db.requests.find(x => x.id === o.requestId); return { ...o, request: r && { id: r.id, title: r.title, budgetMax: r.budgetMax, status: r.status }, buyer: publicUser(userById(r?.buyerId)), conversationId: db.conversations.find(c => c.offerId === o.id)?.id }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});
app.get('/api/offers/received', auth, (req, res) => {
  const mine = new Set(db.requests.filter(r => r.buyerId === req.user.id).map(r => r.id));
  res.json(db.offers.filter(o => mine.has(o.requestId) && o.status !== 'withdrawn').map(o => { const r = db.requests.find(x => x.id === o.requestId); return { ...o, request: { id: r.id, title: r.title, budgetMax: r.budgetMax }, seller: publicUser(userById(o.sellerId)), match: matchOffer(r, o.attrs, o.price), conversationId: db.conversations.find(c => c.offerId === o.id)?.id }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});
// price negotiation inside a conversation: counter / accept / reject / withdraw
app.post('/api/offers/:id/action', auth, (req, res) => {
  const o = db.offers.find(x => x.id === req.params.id); if (!o) return bad(res, 'Offer not found', 404);
  const r = db.requests.find(x => x.id === o.requestId);
  const isBuyer = r.buyerId === req.user.id, isSeller = o.sellerId === req.user.id;
  if (!isBuyer && !isSeller) return bad(res, 'Not your offer', 403);
  const c = db.conversations.find(x => x.offerId === o.id);
  const { action, price } = req.body;
  if (['accepted', 'rejected', 'withdrawn'].includes(o.status) && action !== 'reopen') return bad(res, `Offer is already ${o.status}`);
  if (action === 'counter') {
    if (!(+price > 0)) return bad(res, 'Enter a price');
    o.price = +price; o.lastBy = req.user.id; o.history.push({ by: req.user.id, price: +price, at: now() });
    postMessage(c, req.user.id, 'counter', `${isBuyer ? 'Counter-offer' : 'Revised offer'}: ₹${fmt(price)}`, { price: +price, offerId: o.id });
  } else if (action === 'accept') {
    if (o.lastBy === req.user.id) return bad(res, 'Wait for the other side to respond to your last price');
    if (isSeller && !o.lastBy) return bad(res, 'The buyer has to accept your offer');
    o.status = 'accepted';
    const deal = { id: id('dl'), offerId: o.id, requestId: r.id, buyerId: r.buyerId, sellerId: o.sellerId, title: o.title, agreedPrice: o.price, status: 'awaiting_confirmation', confirmations: { [r.buyerId]: false, [o.sellerId]: false }, paymentStatus: 'not_paid', createdAt: now() };
    db.deals.push(deal); o.dealId = deal.id;
    postMessage(c, null, 'system', `Offer accepted at ₹${fmt(o.price)}. Next: both sides confirm the deal after inspection. Payment is NOT handled by Wantly — mark it once done.`, { dealId: deal.id });
    notify(isBuyer ? o.sellerId : r.buyerId, 'deal', `Offer accepted at ₹${fmt(o.price)} for “${o.title}”`, '#/chat/' + c.id);
  } else if (action === 'reject') {
    if (!isBuyer) return bad(res, 'Only the buyer can reject — sellers can withdraw');
    o.status = 'rejected';
    postMessage(c, null, 'system', 'The buyer declined this offer.');
    notify(o.sellerId, 'offer', `Your offer for “${r.title}” was declined`, '#/chat/' + c.id);
  } else if (action === 'withdraw') {
    if (!isSeller) return bad(res, 'Only the seller can withdraw');
    o.status = 'withdrawn'; postMessage(c, null, 'system', 'The seller withdrew this offer.');
  } else return bad(res, 'Unknown action');
  save(); io.to('c:' + c.id).emit('offer', o); res.json(o);
});

// ----- deals (offer acceptance ≠ deal confirmed ≠ paid) -----
const convOfDeal = d => db.conversations.find(c => d.offerId ? c.offerId === d.offerId : c.id === d.conversationId);
app.get('/api/deals', auth, (req, res) => res.json(db.deals.filter(d => d.buyerId === req.user.id || d.sellerId === req.user.id).map(d => ({ ...d, buyer: publicUser(userById(d.buyerId)), seller: publicUser(userById(d.sellerId)), conversationId: convOfDeal(d)?.id, myReview: db.reviews.find(r => r.dealId === d.id && r.reviewerId === req.user.id) || null })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/deals/:id/action', auth, (req, res) => {
  const d = db.deals.find(x => x.id === req.params.id); if (!d) return bad(res, 'Not found', 404);
  if (![d.buyerId, d.sellerId].includes(req.user.id)) return bad(res, 'Not your deal', 403);
  const c = convOfDeal(d);
  const { action } = req.body;
  if (action === 'confirm') {
    d.confirmations[req.user.id] = true;
    if (Object.values(d.confirmations).every(Boolean)) d.status = 'confirmed';
    postMessage(c, null, 'system', `${req.user.name} confirmed the deal.${d.status === 'confirmed' ? ' Deal confirmed by both sides.' : ''}`);
  } else if (action === 'paid') {
    if (req.user.id !== d.sellerId) return bad(res, 'Only the seller can mark payment as received');
    d.paymentStatus = 'paid'; postMessage(c, null, 'system', 'Seller marked payment as received.');
  } else if (action === 'complete') {
    if (d.status !== 'confirmed') return bad(res, 'Both sides must confirm the deal first');
    d.status = 'completed'; d.completedAt = now();
    const r = db.requests.find(x => x.id === d.requestId); if (r) r.status = 'closed';
    const o = db.offers.find(x => x.id === d.offerId); const pid = o?.productId || d.productId; const p = pid && db.products.find(x => x.id === pid); if (p) p.status = 'sold';
    postMessage(c, null, 'system', 'Deal completed 🎉 You can now rate each other.');
    notify(req.user.id === d.buyerId ? d.sellerId : d.buyerId, 'deal', `Deal completed: “${d.title}”. Leave a review.`, '#/dashboard/deals');
  } else if (action === 'cancel') {
    if (d.status === 'completed') return bad(res, 'Completed deals cannot be cancelled');
    d.status = 'cancelled'; const o = db.offers.find(x => x.id === d.offerId); if (o) o.status = 'rejected';
    postMessage(c, null, 'system', `${req.user.name} cancelled the deal.`);
  } else return bad(res, 'Unknown action');
  save(); if (c) io.to('c:' + c.id).emit('deal', d); res.json(d);
});
app.post('/api/deals/:id/review', auth, (req, res) => {
  const d = db.deals.find(x => x.id === req.params.id); if (!d) return bad(res, 'Not found', 404);
  if (![d.buyerId, d.sellerId].includes(req.user.id)) return bad(res, 'Not your deal', 403);
  if (d.status !== 'completed') return bad(res, 'You can review after the deal is completed');
  if (db.reviews.some(r => r.dealId === d.id && r.reviewerId === req.user.id)) return bad(res, 'Already reviewed');
  const rating = Math.max(1, Math.min(5, +req.body.rating || 0));
  db.reviews.push({ id: id('rev'), dealId: d.id, reviewerId: req.user.id, reviewedUserId: req.user.id === d.buyerId ? d.sellerId : d.buyerId, rating, comment: String(req.body.comment || '').slice(0, 500), createdAt: now() });
  save(); res.json({ ok: true });
});

// ----- conversations & messages -----
function decorateConv(c, me) {
  const otherId = me === c.buyerId ? c.sellerId : c.buyerId;
  const msgs = db.messages.filter(m => m.conversationId === c.id);
  const last = msgs[msgs.length - 1];
  const r = c.requestId && db.requests.find(x => x.id === c.requestId);
  const p = c.productId && db.products.find(x => x.id === c.productId);
  const o = c.offerId && db.offers.find(x => x.id === c.offerId);
  const other = userById(otherId);
  return {
    ...c, role: me === c.buyerId ? 'buyer' : 'seller', other: publicUser(other),
    otherContact: c.contactShared[otherId] ? { phone: other.phone, email: other.email } : null,
    blocked: isBlocked(me, otherId), blockedByMe: db.blocks.some(b => b.by === me && b.user === otherId),
    last, unread: msgs.filter(m => m.senderId && m.senderId !== me && !m.readAt).length,
    request: r && { id: r.id, title: r.title, budgetMax: r.budgetMax, specs: r.specs, status: r.status },
    product: p && { id: p.id, title: p.title, price: p.price, images: p.images, status: p.status },
    offer: o, deal: o?.dealId ? db.deals.find(d => d.id === o.dealId) : db.deals.filter(d => d.conversationId === c.id).at(-1) || null,
    match: r && o ? matchOffer(r, o.attrs, o.price) : null,
  };
}
const canSee = (c, u) => c && (c.buyerId === u.id || c.sellerId === u.id);
app.get('/api/conversations', auth, (req, res) => res.json(db.conversations.filter(c => canSee(c, req.user)).map(c => decorateConv(c, req.user.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
app.get('/api/conversations/:id', auth, (req, res) => {
  const c = db.conversations.find(x => x.id === req.params.id);
  if (!canSee(c, req.user)) return bad(res, 'Conversation not found', 404); // private chats stay private
  let changed = false;
  for (const m of db.messages) if (m.conversationId === c.id && m.senderId && m.senderId !== req.user.id && !m.readAt) { m.readAt = now(); m.deliveredAt = m.deliveredAt || m.readAt; changed = true; }
  if (changed) { save(); io.to('c:' + c.id).emit('read', { conversationId: c.id, by: req.user.id }); }
  res.json({ ...decorateConv(c, req.user.id), messages: db.messages.filter(m => m.conversationId === c.id) });
});
// start chat from a product listing (classic OLX "Chat with seller")
app.post('/api/conversations', auth, (req, res) => {
  const p = db.products.find(x => x.id === req.body.productId);
  if (!p || p.status !== 'active') return bad(res, 'Listing not available');
  if (p.sellerId === req.user.id) return bad(res, "That's your own listing");
  if (isBlocked(req.user.id, p.sellerId)) return bad(res, 'You cannot contact this user', 403);
  const c = getOrCreateConv({ productId: p.id, buyerId: req.user.id, sellerId: p.sellerId });
  save(); res.json({ id: c.id });
});
app.post('/api/conversations/:id/messages', auth, (req, res) => {
  const c = db.conversations.find(x => x.id === req.params.id);
  if (!canSee(c, req.user)) return bad(res, 'Not found', 404);
  const otherId = req.user.id === c.buyerId ? c.sellerId : c.buyerId;
  if (isBlocked(req.user.id, otherId)) return bad(res, 'Messaging is blocked in this conversation', 403);
  const { type = 'text', content = '', attachments = [], price } = req.body;
  if (type === 'price') { // listing chat: make an offer on a product
    if (!(+price > 0)) return bad(res, 'Enter a price');
    const m = postMessage(c, req.user.id, 'price', `Offered ₹${fmt(price)}`, { price: +price, status: 'open' });
    notify(otherId, 'offer', `${req.user.name} offered ₹${fmt(price)}`, '#/chat/' + c.id); return res.json(m);
  }
  if (!String(content).trim() && !attachments.length) return bad(res, 'Empty message');
  const m = postMessage(c, req.user.id, attachments.length ? 'media' : 'text', String(content).slice(0, 2000), { attachments: attachments.slice(0, 6) });
  const room = io.sockets.adapter.rooms.get('c:' + c.id), theirs = io.sockets.adapter.rooms.get('u:' + otherId);
  const viewing = room && theirs && [...theirs].some(s => room.has(s));
  if (!viewing) notify(otherId, 'message', `${req.user.name}: ${String(content).slice(0, 60) || 'sent an attachment'}`, '#/chat/' + c.id);
  res.json(m);
});
// accept/decline a price message in a listing chat → creates a deal too
app.post('/api/messages/:id/respond', auth, (req, res) => {
  const m = db.messages.find(x => x.id === req.params.id); const c = m && db.conversations.find(x => x.id === m.conversationId);
  if (!canSee(c, req.user) || m.type !== 'price') return bad(res, 'Not found', 404);
  if (m.senderId === req.user.id) return bad(res, "You can't respond to your own price");
  if (m.status !== 'open') return bad(res, 'Already answered');
  m.status = req.body.accept ? 'accepted' : 'declined';
  if (req.body.accept) {
    const p = db.products.find(x => x.id === c.productId);
    const deal = { id: id('dl'), offerId: null, conversationId: c.id, requestId: null, productId: p?.id, buyerId: c.buyerId, sellerId: c.sellerId, title: p?.title || 'Item', agreedPrice: m.price, status: 'awaiting_confirmation', confirmations: { [c.buyerId]: false, [c.sellerId]: false }, paymentStatus: 'not_paid', createdAt: now() };
    db.deals.push(deal);
    postMessage(c, null, 'system', `Price ₹${fmt(m.price)} accepted. Both sides confirm after inspection; payment happens outside Wantly.`, { dealId: deal.id });
  } else postMessage(c, null, 'system', `Price ₹${fmt(m.price)} declined.`);
  save(); io.to('c:' + c.id).emit('refresh', {}); res.json(m);
});
app.post('/api/conversations/:id/share-contact', auth, (req, res) => {
  const c = db.conversations.find(x => x.id === req.params.id); if (!canSee(c, req.user)) return bad(res, 'Not found', 404);
  c.contactShared[req.user.id] = true;
  postMessage(c, null, 'system', `${req.user.name} shared their contact details.`);
  save(); res.json({ ok: true });
});
app.post('/api/block/:userId', auth, (req, res) => {
  const i = db.blocks.findIndex(b => b.by === req.user.id && b.user === req.params.userId);
  if (i >= 0) db.blocks.splice(i, 1); else db.blocks.push({ by: req.user.id, user: req.params.userId, at: now() });
  save(); res.json({ blocked: i < 0 });
});
app.post('/api/reports', auth, (req, res) => {
  const { reportedUserId, refId, reason } = req.body;
  if (!reason) return bad(res, 'Pick a reason');
  db.reports.push({ id: id('rpt'), reporterId: req.user.id, reportedUserId, refId: refId || null, reason: String(reason).slice(0, 300), status: 'open', createdAt: now() });
  db.users.filter(u => u.isAdmin).forEach(a => notify(a.id, 'report', `New report: ${reason}`, '#/admin'));
  save(); res.json({ ok: true });
});

// ----- notifications -----
app.get('/api/notifications', auth, (req, res) => res.json(db.notifications.filter(n => n.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)));
app.post('/api/notifications/read', auth, (req, res) => { db.notifications.forEach(n => { if (n.userId === req.user.id && !n.readAt) n.readAt = now(); }); save(); res.json({ ok: true }); });
app.get('/api/summary', auth, (req, res) => {
  const convs = db.conversations.filter(c => canSee(c, req.user));
  const ids = new Set(convs.map(c => c.id));
  res.json({ unreadMessages: db.messages.filter(m => ids.has(m.conversationId) && m.senderId && m.senderId !== req.user.id && !m.readAt).length, unreadNotifications: db.notifications.filter(n => n.userId === req.user.id && !n.readAt).length });
});

// ----- admin -----
app.get('/api/admin/overview', auth, adminOnly, (_, res) => res.json({
  stats: { users: db.users.length, activeRequests: db.requests.filter(r => r.status === 'active').length, listings: db.products.filter(p => p.status === 'active').length, offers: db.offers.length, deals: db.deals.length, completed: db.deals.filter(d => d.status === 'completed').length, openReports: db.reports.filter(r => r.status === 'open').length, messages: db.messages.length },
  users: db.users.map(u => ({ ...publicUser(u), phone: u.phone, listings: db.products.filter(p => p.sellerId === u.id).length, requests: db.requests.filter(r => r.buyerId === u.id).length, reportsAgainst: db.reports.filter(r => r.reportedUserId === u.id).length })),
  reports: db.reports.map(r => ({ ...r, reporter: publicUser(userById(r.reporterId)), reported: publicUser(userById(r.reportedUserId)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  requests: db.requests.filter(r => r.status !== 'deleted').map(r => ({ id: r.id, title: r.title, status: r.status, featured: !!r.featured, buyer: userById(r.buyerId)?.name })),
  products: db.products.filter(p => p.status !== 'deleted').map(p => ({ id: p.id, title: p.title, price: p.price, status: p.status, featured: !!p.featured, seller: userById(p.sellerId)?.name })),
  categories: db.categories,
}));
app.post('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const u = userById(req.params.id); if (!u) return bad(res, 'Not found', 404);
  if (req.body.suspended !== undefined) { if (u.isAdmin) return bad(res, "Can't suspend an admin"); u.suspended = !!req.body.suspended; }
  if (req.body.verified !== undefined) u.verified = req.body.verified;
  save(); res.json(publicUser(u));
});
app.post('/api/admin/reports/:id', auth, adminOnly, (req, res) => { const r = db.reports.find(x => x.id === req.params.id); if (!r) return bad(res, 'Not found', 404); r.status = req.body.status || 'resolved'; save(); res.json(r); });
app.post('/api/admin/feature', auth, adminOnly, (req, res) => {
  const item = db.requests.find(x => x.id === req.body.id) || db.products.find(x => x.id === req.body.id); if (!item) return bad(res, 'Not found', 404);
  if (req.body.featured !== undefined) item.featured = !!req.body.featured;
  if (req.body.status) item.status = req.body.status;
  save(); res.json(item);
});
app.post('/api/admin/categories', auth, adminOnly, (req, res) => {
  const { name, icon } = req.body; if (!name) return bad(res, 'Name required');
  const c = { id: norm(name).replace(/ /g, '-'), name, icon: icon || '📦', fields: [] }; db.categories.push(c); save(); res.json(c);
});
app.post('/api/admin/reset', auth, adminOnly, (_, res) => { db = empty(); require('./seed')(db, id); save(); sessions.clear(); res.json({ ok: true }); });

app.use('/api', (_, res) => bad(res, 'Not found', 404));
app.get(/^(?!\/api).*/, (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- realtime ----------
io.on('connection', socket => {
  const uid = sessions.get(socket.handshake.auth?.token);
  if (!uid) return;
  socket.join('u:' + uid);
  socket.on('join', convId => { const c = db.conversations.find(x => x.id === convId); if (canSee(c, { id: uid })) socket.join('c:' + convId); });
  socket.on('leave', convId => socket.leave('c:' + convId));
  socket.on('typing', convId => { const c = db.conversations.find(x => x.id === convId); if (canSee(c, { id: uid })) socket.to('c:' + convId).emit('typing', { conversationId: convId, userId: uid }); });
  socket.on('read', convId => {
    const c = db.conversations.find(x => x.id === convId); if (!canSee(c, { id: uid })) return;
    let changed = false; for (const m of db.messages) if (m.conversationId === convId && m.senderId && m.senderId !== uid && !m.readAt) { m.readAt = now(); changed = true; }
    if (changed) { save(); io.to('c:' + convId).emit('read', { conversationId: convId, by: uid }); }
  });
});

load();
server.listen(PORT, () => console.log(`\n  Wantly demo running →  http://localhost:${PORT}\n  (data stored in data.json — delete it to reset demo data)\n`));
module.exports = { matchOffer };
