// Demo data. Delete data.json (or use Admin → Reset demo data) to re-seed.
module.exports = function seed(db, id) {
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();

  db.categories = [
    { id: 'mobiles', name: 'Mobiles', icon: '📱', fields: ['Brand', 'Model', 'Storage', 'Battery health', 'Screen', 'Body', 'Accessories', 'Purchase bill'] },
    { id: 'laptops', name: 'Laptops', icon: '💻', fields: ['Brand', 'Processor', 'RAM', 'Storage', 'Battery', 'Body', 'Charger'] },
    { id: 'cars', name: 'Cars', icon: '🚗', fields: ['Brand', 'Model', 'Year', 'Fuel', 'KM driven', 'Owners', 'Transmission'] },
    { id: 'bikes', name: 'Bikes', icon: '🏍️', fields: ['Brand', 'Model', 'Year', 'KM driven', 'Owners'] },
    { id: 'electronics', name: 'Electronics', icon: '📺', fields: ['Brand', 'Type', 'Size', 'Condition', 'Warranty'] },
    { id: 'furniture', name: 'Furniture', icon: '🛋️', fields: ['Type', 'Material', 'Seating', 'Condition'] },
  ];

  const U = (name, phone, city, extra = {}) => { const u = { id: id('usr'), name, phone, email: '', city, verified: 'phone', demo: true, createdAt: ago(24 * 90), ...extra }; db.users.push(u); return u; };
  const mudassir = U('Mudassir', '9000000001', 'Hyderabad', { bio: 'Buyer — wants an iPhone 15', avatar: '#0f766e' });
  const ahmed = U('Ahmed', '9000000002', 'Hyderabad', { bio: 'Seller — phones & gadgets', avatar: '#b45309', verified: 'id' });
  const priya = U('Priya', '9000000003', 'Hyderabad', { bio: 'Seller — laptops', avatar: '#7c3aed' });
  const ravi = U('Ravi', '9000000004', 'Secunderabad', { bio: 'Buys & sells bikes', avatar: '#be123c' });
  U('Admin', '9000000000', 'Hyderabad', { bio: 'Platform admin panel', isAdmin: true, avatar: '#334155' });

  const R = (buyer, category, title, budgetMax, specs, extra = {}) => { const r = { id: id('req'), buyerId: buyer.id, category, title, description: '', budgetMin: 0, budgetMax, location: buyer.city, condition: 'Used', delivery: 'In-person inspection', allowPartial: true, deadline: null, specs: specs.map(([field, value, mandatory]) => ({ field, value, mandatory })), images: [], status: 'active', createdAt: ago(2), ...extra }; db.requests.push(r); return r; };
  const iphoneReq = R(mudassir, 'mobiles', 'Wanted: iPhone 15 (128 GB)', 35000, [
    ['Model', 'iPhone 15', true], ['Storage', '128 GB', true], ['Battery health', '100%', true],
    ['Screen', 'Original, unreplaced, no cracks', true], ['Body', 'No major damage', true],
    ['Accessories', 'Original box and cable', false], ['Purchase bill', 'Yes', false],
  ], { description: 'Used phone is fine. I want to inspect in person before paying. Hyderabad only.', allowPartial: true, deadline: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), createdAt: ago(5) });
  R(ravi, 'laptops', 'Laptop with 16 GB RAM for coding', 40000, [
    ['Processor', 'Core i5', true], ['RAM', '16 GB', true], ['Storage', '512 GB SSD', true], ['Battery', 'Good backup', false], ['Body', 'No hardware damage', true],
  ], { description: 'Core i5 or better, SSD, good battery. Need it for college work.', createdAt: ago(9) });
  R(priya, 'bikes', 'Royal Enfield Classic 350, 2021 or newer', 140000, [
    ['Model', 'Classic 350', true], ['Year', '2021', true], ['KM driven', '20000', true], ['Owners', '1', false],
  ], { location: 'Hyderabad', createdAt: ago(20) });
  R(mudassir, 'furniture', 'L-shaped sofa, 5 seater', 18000, [
    ['Type', 'L-shaped sofa', true], ['Seating', '5', true], ['Condition', 'No tears or stains', false],
  ], { createdAt: ago(30) });
  R(ravi, 'electronics', '55" 4K Smart TV', 30000, [['Size', '55', true], ['Type', '4K Smart TV', true], ['Warranty', 'Yes', false]], { createdAt: ago(40) });

  const P = (seller, category, title, price, attrs, extra = {}) => { const p = { id: id('prd'), sellerId: seller.id, category, title, description: '', price, negotiable: true, condition: 'Used', location: seller.city, attrs: attrs.map(([field, value]) => ({ field, value, verified: false })), images: [], status: 'active', views: Math.floor(Math.random() * 120), createdAt: ago(3), ...extra }; db.products.push(p); return p; };
  const iphone = P(ahmed, 'mobiles', 'iPhone 15 128 GB — Black, with box', 32000, [
    ['Brand', 'Apple'], ['Model', 'iPhone 15'], ['Storage', '128 GB'], ['Battery health', '100%'], ['Screen', 'Original, unreplaced'], ['Body', 'No damage, minor hairline on frame'], ['Accessories', 'Original box and cable'], ['Purchase bill', 'Yes, available'],
  ], { description: 'Single owner, bought in Dec 2024. Never repaired. Inspection welcome near Mehdipatnam.', createdAt: ago(26) });
  P(ahmed, 'mobiles', 'iPhone 13 128 GB — Blue', 27500, [['Brand', 'Apple'], ['Model', 'iPhone 13'], ['Storage', '128 GB'], ['Battery health', '86%'], ['Screen', 'Original']], { createdAt: ago(50) });
  P(ahmed, 'mobiles', 'Samsung Galaxy S23 256 GB', 38000, [['Brand', 'Samsung'], ['Model', 'Galaxy S23'], ['Storage', '256 GB'], ['Battery health', 'Good'], ['Accessories', 'Charger only']], { createdAt: ago(70) });
  P(priya, 'laptops', 'Dell Inspiron 15 — i5 12th Gen, 16 GB / 512 GB SSD', 38500, [['Brand', 'Dell'], ['Processor', 'Core i5 12th Gen'], ['RAM', '16 GB'], ['Storage', '512 GB SSD'], ['Battery', 'Around 5 hours'], ['Body', 'No hardware damage'], ['Charger', 'Original']], { description: 'Used for office work, 1.5 years old.', createdAt: ago(12) });
  P(priya, 'laptops', 'MacBook Air M1 8 GB / 256 GB', 46000, [['Brand', 'Apple'], ['Processor', 'M1'], ['RAM', '8 GB'], ['Storage', '256 GB SSD'], ['Battery', '89% health']], { createdAt: ago(80) });
  P(ravi, 'bikes', 'Honda Activa 6G 2022', 62000, [['Brand', 'Honda'], ['Model', 'Activa 6G'], ['Year', '2022'], ['KM driven', '9800'], ['Owners', '1']], { location: 'Secunderabad', createdAt: ago(15) });
  P(ravi, 'bikes', 'Royal Enfield Classic 350 — 2022, 14k km', 155000, [['Brand', 'Royal Enfield'], ['Model', 'Classic 350'], ['Year', '2022'], ['KM driven', '14000'], ['Owners', '1']], { location: 'Secunderabad', createdAt: ago(60) });
  P(priya, 'furniture', 'Wooden study table with chair', 4500, [['Type', 'Study table'], ['Material', 'Sheesham wood'], ['Condition', 'Good']], { createdAt: ago(100) });
  P(ravi, 'electronics', 'Sony Bravia 43" Full HD', 18000, [['Brand', 'Sony'], ['Type', 'Full HD Smart TV'], ['Size', '43'], ['Warranty', 'No']], { location: 'Secunderabad', createdAt: ago(110) });
  P(ahmed, 'cars', 'Maruti Swift VXI 2019 Petrol', 485000, [['Brand', 'Maruti'], ['Model', 'Swift VXI'], ['Year', '2019'], ['Fuel', 'Petrol'], ['KM driven', '42000'], ['Owners', '1'], ['Transmission', 'Manual']], { createdAt: ago(130) });

  // The negotiation from the project spec
  const offer = { id: id('off'), requestId: iphoneReq.id, sellerId: ahmed.id, productId: iphone.id, title: 'iPhone 15, 128 GB', price: 32000, attrs: iphone.attrs.map(a => ({ ...a })), condition: 'Used — like new', repairHistory: 'Never repaired', accessories: 'Original box and cable', warranty: 'Bill available', delivery: 'Pickup / in-person inspection', notes: '', images: [], status: 'pending', history: [{ by: ahmed.id, price: 32000, at: ago(4) }], matchLevel: 'exact', createdAt: ago(4) };
  db.offers.push(offer);
  const conv = { id: id('cnv'), requestId: iphoneReq.id, productId: iphone.id, offerId: offer.id, buyerId: mudassir.id, sellerId: ahmed.id, contactShared: { [mudassir.id]: false, [ahmed.id]: false }, createdAt: ago(4), updatedAt: ago(3.5) };
  db.conversations.push(conv);
  const M = (sender, type, content, h, extra = {}) => db.messages.push({ id: id('msg'), conversationId: conv.id, senderId: sender && sender.id, type, content, createdAt: ago(h), deliveredAt: ago(h), readAt: sender === ahmed && h > 3.6 ? ago(h - 0.01) : null, ...extra });
  M(ahmed, 'offer', 'Offer: iPhone 15, 128 GB', 4, { price: 32000, offerId: offer.id });
  M(ahmed, 'text', 'Hi Mudassir, I saw your iPhone 15 requirement. I have the same model with 100% battery health, an original screen, box and cable.', 3.98);
  M(mudassir, 'text', 'Is the phone repaired before? Can you share actual photos and battery health proof?', 3.95);
  M(ahmed, 'text', "No screen replacement. I'll share photos and a screenshot of battery health. You can inspect the phone before paying.", 3.92);
  M(mudassir, 'text', 'My budget is ₹35,000. What is your final price?', 3.9);
  M(ahmed, 'text', 'My asking price is ₹32,000. I can offer it for ₹31,000 if you collect it in person.', 3.88);
  M(ahmed, 'counter', 'Revised offer: ₹31,000', 3.87, { price: 31000, offerId: offer.id });
  offer.price = 31000; offer.lastBy = ahmed.id; offer.history.push({ by: ahmed.id, price: 31000, at: ago(3.87) });
  db.notifications.push({ id: id('ntf'), userId: mudassir.id, type: 'offer', text: 'Ahmed revised the offer to ₹31,000 for “Wanted: iPhone 15 (128 GB)”', link: '#/chat/' + conv.id, createdAt: ago(3.87), readAt: null });

  // a past completed deal so profiles have ratings
  db.deals.push({ id: 'dl_seed', offerId: null, requestId: null, buyerId: ravi.id, sellerId: ahmed.id, title: 'OnePlus Nord earbuds', agreedPrice: 1800, status: 'completed', confirmations: { [ravi.id]: true, [ahmed.id]: true }, paymentStatus: 'paid', createdAt: ago(24 * 20), completedAt: ago(24 * 19) });
  db.reviews.push({ id: id('rev'), dealId: 'dl_seed', reviewerId: ravi.id, reviewedUserId: ahmed.id, rating: 5, comment: 'Product exactly as described. Smooth deal.', createdAt: ago(24 * 19) });
  db.reviews.push({ id: id('rev'), dealId: 'dl_seed', reviewerId: ahmed.id, reviewedUserId: ravi.id, rating: 4, comment: 'On time, polite buyer.', createdAt: ago(24 * 19) });
};
