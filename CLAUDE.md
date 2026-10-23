# Wantly — project context for Claude Code

Buyer-first marketplace demo (OLX-style). Buyers post what they want with specs and a budget; sellers send offers; both negotiate in real-time chat. Normal "for sale" listings also exist, as on OLX.

Built from the owner's spec "Buy & Sell Requirement Marketplace". Demo personas: Mudassir (buyer), Ahmed (seller), Priya, Ravi, Admin.

## Run
```
npm install
npm start          # http://localhost:3000
npm run reset      # wipe data.json and re-seed
```
Node 18+. No build step.

## Structure
- `server.js` — Express 5 + Socket.IO. JSON-file storage (`data.json`, auto-created from `seed.js`). All API under `/api`. Contains the matching engine (`matchOffer`, `compareValue`).
- `seed.js` — demo users, categories, requests, listings, and the sample iPhone 15 negotiation from the spec.
- `public/index.html`, `public/app.css`, `public/app.js` — single-page vanilla JS client with hash routing (`#/`, `#/request/:id`, `#/product/:id`, `#/post`, `#/sell`, `#/offer/:reqId`, `#/chat/:id`, `#/dashboard/:tab`, `#/admin`, `#/login`).

## Key rules (from the spec — keep these)
- Match levels: exact / partial / none. A mandatory spec mismatch, or price over budget, means none.
- Numeric specs mean "at least", except words like km/owners/age/driven (lower is better). Field names are matched by whole word — "Storage" must not match "age".
- Condition-type fields (battery, screen, body, warranty, bill…) are seller claims and show "Claim — verify". Sellers can never set `verified`; only the platform can.
- Offer accepted ≠ deal confirmed ≠ paid. Deal flow: accepted → both confirm → seller marks paid → completed → reviews.
- Server-side ownership checks on every write; chats are visible only to their two participants.
- Phone and email stay private unless the user taps "Share my contact details" in a chat.

## Demo shortcuts (replace before production)
- OTP is returned in the API response and shown on screen, so no SMS is sent.
- Sessions are in memory (lost on restart); uploads go to `uploads/`.
- Production plan: PostgreSQL (tables in the spec), SMS provider, JWT/cookies plus rate limiting, S3, HTTPS hosting.

## Status
- Fully tested: API end-to-end flow, two-browser real-time chat, authorization checks, mobile layout.
- Git: one local commit on `main`. Pushing to https://github.com/maqsusiuser/wantit is still pending, because the connected GitHub account (Meeran1786) had no write access to that repo.
