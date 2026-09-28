# Absorb & Order Flow Radar (Multi-TF + CVD + OI)

A 24/7 cloud-based Altcoin Absorb, Cumulative Volume Delta (CVD), and Open Interest (OI) scanner with a modern web dashboard deployable to **Vercel** 100% Free.

---

## ⚡ Architecture

```
[ Binance Futures Public API ] (No API Keys required)
              │
              ▼
   [ Serverless Cron / Engine ]
   (GitHub Actions 24/7 or Vercel Edge API)
   - Fetches Kline & Taker Volume (5m, 15m, 1h, 4h, 1d)
   - Fetches Live Open Interest (OI)
   - Detects Absorption (High Volume + Tight Range + CVD Delta Divergence)
              │
              ▼
   [ Cache / State ] (Upstash Redis Free / In-Memory JSON)
              │
              ▼
   [ Next.js + Tailwind Dashboard on Vercel ]
   - Real-time signals matrix
   - Multi-TF absorption confluence indicator
   - CVD & OI surge tracking
   - One-click TradingView chart redirect
```

---

## 🚀 Quick Start (Deploy to Vercel in 3 Minutes)

### 1. Clone & Install Dependencies
```bash
git clone <your-repo>
cd absorb-radar
npm install
```

### 2. (Optional) Setup Free Upstash Redis (For 24/7 Persistent Cache)
1. Go to [https://upstash.com](https://upstash.com) and create a free Redis database.
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Set them in your `.env.local` or Vercel Environment Variables.
*(If omitted, it falls back to direct API batch scanning).*

### 3. Run Locally
```bash
npm run dev
```
Open `http://localhost:3000` to view the radar.

### 4. Deploy to Vercel
```bash
npx vercel --prod
```
Or push to GitHub and connect the repository on [vercel.com](https://vercel.com).
