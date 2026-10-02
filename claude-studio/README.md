# Claude Studio — public AI assistant with subscriptions

A ready-to-run website where **anyone with the link** can sign up, chat with an
AI assistant, and download files it creates (documents, code, spreadsheets,
etc.). New users get a **1-day free trial**; after that they pick a paid plan,
and the money goes to **you**.

> **How you earn:** You run the AI on a provider (Gemini and Groq both have
> **free tiers** — no credit card). Customers pay you a monthly subscription.
> Your profit is the difference. On the free AI tiers your cost is near zero,
> so a $10–$20 subscription is almost all margin.

```
Visitor's browser  ──►  This server (your AI key, runs the model)  ──►  AI provider
   (public link)          1-day trial, then plan + message limits        (Gemini/Groq/Claude)
```

---

## Plans (edit anytime in `.env` or your host dashboard)

| Plan | Price | AI provider | Monthly messages |
|------|-------|-------------|------------------|
| Free trial | 1 day free | Gemini | 25 (safety cap) |
| Basic | $10/mo | Gemini | 300 |
| Pro | $20/mo | Groq (or Claude) | 2000 |

- Free users get full access for `FREE_TRIAL_DAYS`, then must upgrade.
- Which provider serves each tier is configurable: `AI_PROVIDER` (free + basic)
  and `PAID_AI_PROVIDER` (pro). Valid values: `gemini`, `groq`, `anthropic`.

---

## What's included

- **Public web page** (`server/public/`) — landing, sign-up/sign-in, chat, file
  downloads, and the plan picker.
- **Backend** (`server/src/`) — accounts, the 1-day trial, per-plan usage limits,
  a provider-agnostic AI layer, file creation, and Stripe subscriptions.
- **SQLite database** — created automatically; stores accounts and files.

The assistant can **write files** for users to download, but it **cannot run
code** on your server. That's the safe design for a public site.

---

## Which AI (and getting free keys)

- **Google Gemini** — free API key at <https://aistudio.google.com> (no card).
- **Groq** — free API key at <https://console.groq.com> (fast open models).
- **Anthropic Claude** — paid, best quality, at <https://console.anthropic.com>.
  Only needed if you set a provider to `anthropic`.

Switching a tier's provider is one line (`AI_PROVIDER` / `PAID_AI_PROVIDER`).

> Free tiers are rate-limited and may not allow heavy commercial use. Great for
> launching and early users; move to a paid tier (or Claude) as you grow.

---

## 1. Run it on your computer (test mode)

Needs **Node.js 20+**.

```bash
cd claude-studio/server
npm install
cp .env.example .env     # then edit .env: set GEMINI_API_KEY and JWT_SECRET
npm start                # open http://localhost:8080
```

Leave the Stripe values as placeholders — the site runs in **free mode** (trial
only, no payments) until Stripe is set up.

---

## 2. Turn on payments (Stripe)

1. Create a Stripe account (add your bank account for payouts).
2. Create **two** recurring monthly Prices: **$10 (Basic)** and **$20 (Pro)**;
   copy each **Price ID** (`price_…`) into `STRIPE_PRICE_BASIC` / `STRIPE_PRICE_PRO`.
3. Copy your **Secret key** → `STRIPE_SECRET_KEY`.
4. Add a **Webhook** to `https://YOUR-DOMAIN/webhook/stripe` for events
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`; copy the
   **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
5. Restart. The plan picker now takes real payments.

---

## 3. Put it online

See **[DEPLOY.md](./DEPLOY.md)** for the full click-by-click guide (Render), the
persistent-disk setup so accounts survive restarts, and going live.

---

## Where this is headed (the "platform" vision)

To grow this into a big public place where people create and keep their work:

- **Save chat history + creations** to the database (currently chat history is
  in memory and resets on restart; files already persist).
- **A public gallery** of opt-in creations so visitors see what others made.
- **Move to Postgres** (from SQLite) when you have many users.
- **Email verification / password reset**, and **image generation**.

These are the natural next steps — ask and I'll build them one at a time.

---

## Important: don't share your personal Claude account

This app uses provider **APIs** (the allowed way to offer AI to other people).
Sharing your personal Claude.ai or any personal AI login with the public is
against those services' terms.
