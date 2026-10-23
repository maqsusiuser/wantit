# Wantly — Buyer-First Marketplace (demo)

An OLX-style marketplace where **buyers post what they want** and **sellers compete with offers**.
Normal "for sale" ads work too, just like OLX.

## Run it on your computer

1. Install **Node.js 18 or newer** from https://nodejs.org (choose the LTS version).
2. Unzip this folder.
3. Start it:
   - **Windows:** double-click `start-windows.bat`
   - **Mac / Linux:** double-click `start-mac-linux.sh` (or run `./start-mac-linux.sh` in Terminal)
   - **Or manually**, in a terminal inside this folder:
     ```
     npm install
     npm start
     ```
4. Open **http://localhost:3000** in your browser.

To stop the server press `Ctrl + C` in the terminal window.

## Try the demo

On the Login page, click a demo account — no password needed:

| Account  | Role in the demo |
|----------|------------------|
| Mudassir | Buyer — has posted "Wanted: iPhone 15" and already has an offer from Ahmed |
| Ahmed    | Seller — phones, has the matching iPhone 15 |
| Priya    | Seller — laptops |
| Ravi     | Buys & sells bikes |
| Admin    | Opens the admin panel |

**See real-time chat:** open one normal window as *Mudassir* and an incognito/private window as *Ahmed*.
Open the iPhone chat in both and message each other, counter the price, accept the offer, confirm the deal.

You can also sign up with any 10-digit phone number. No SMS is sent — the OTP is shown on screen.

## What's included

- **Buyer requests** with specs marked *Must have* / *Preferred*, budget, location, deadline, photos; edit, pause, close, delete
- **OLX-style ads** with categories, search, city filter, price/condition sorting, saved items
- **Smart matching engine** — Exact / Partial / Not a match, with a per-requirement breakdown.
  Numbers mean "at least" (RAM 16 GB accepts 32 GB) except km/owners (lower is better).
  Seller claims like battery health or screen condition are shown as **"Claim — verify"**; sellers can never mark them verified.
- **Offers & comparison** — buyer sees all offers side by side, sorted by match quality and price
- **Live match preview** while a seller fills in an offer
- **Real-time chat** (Socket.IO): photos/videos/PDFs, typing indicator, delivered/read ticks, quick replies,
  offer cards, counter-offers, accept/reject/withdraw
- **Deals kept separate from payment**: offer accepted → both confirm → payment marked → completed → reviews
- **Trust & safety**: block, report, opt-in contact sharing, phone/email kept private, server-side ownership checks
- **Notifications** (live toasts + notification page), including "a new request matches your listing"
- **Admin panel**: stats, users (suspend / ID-verify), reports, feature or remove listings, add categories, reset demo data
- Responsive — works on mobile browsers

## Resetting data

Everything is saved in `data.json`. Delete it (or use **Admin → Reset demo data**, or `npm run reset`) to start fresh.
Uploaded images go into the `uploads/` folder.

## Demo vs. production

This is a working prototype for demos and user testing. Before a public launch you'd swap in:

| Demo | Production |
|------|-----------|
| `data.json` file | PostgreSQL (tables from the spec) |
| OTP shown on screen | SMS provider (e.g. MSG91, Twilio) |
| In-memory login sessions | JWT / secure cookies, rate limiting |
| `uploads/` folder | Amazon S3 or similar |
| Single Node process | Hosted on AWS / VPS with HTTPS, backups, monitoring |

## Files

- `server.js` — API, matching engine, real-time chat
- `seed.js` — demo users, requests, listings and the sample negotiation
- `public/` — the web app (HTML, CSS, JavaScript; no build step)
