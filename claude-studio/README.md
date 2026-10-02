# Claude Studio — public AI assistant with subscriptions

A ready-to-run website where **anyone with the link** can sign up, chat with a
Claude-powered assistant, and download files it creates (documents, code,
spreadsheets, etc.). Free users get a few messages; after that they **subscribe
monthly** through Stripe, and the money goes to **you**.

> **How you earn:** You pay Anthropic a tiny amount per message (your cost).
> Customers pay you a monthly subscription. Your profit is the difference.
> There is no "AI that pays you" — you resell Claude's power at a markup.

```
Visitor's browser  ──►  This server (your API key, runs Claude)  ──►  Claude API
   (public link)            enforces free limit + Stripe sub
```

---

## What's included

- **Public web page** (`server/public/`) — landing, sign-up/sign-in, chat, file downloads, subscribe button.
- **Backend** (`server/src/`) — accounts, usage limits, Claude agent loop with a safe `create_file` tool, Stripe subscriptions.
- **SQLite database** — created automatically; no separate database to set up.

The assistant can **write files** but **cannot run code** on your server. That's
the safe design for a public site.

---

## 1. Run it on your computer first (test mode)

You need **Node.js 20+** installed.

```bash
cd claude-studio/server
npm install
cp .env.example .env
```

Open `.env` and set at minimum:

- `ANTHROPIC_API_KEY` — from <https://console.anthropic.com> → **API Keys**. Add
  a little billing credit there; this is your per-message cost.
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and paste the result.

You can leave the Stripe values as placeholders for now — the site runs in
**free mode** (no payments) until Stripe is configured.

Start it:

```bash
npm start
```

Open <http://localhost:8080>, create an account, and chat. Ask it to
"write me a budget spreadsheet as a CSV" and you'll get a download link.

---

## 2. Turn on payments (Stripe)

This is how you collect money. You must do these steps yourself — they need
your identity and bank details.

1. Create a Stripe account at <https://stripe.com> and finish onboarding (bank
   account for payouts).
2. In the Stripe Dashboard → **Product catalog** → add a product with a
   **recurring monthly price** (e.g. $10/month). Copy its **Price ID**
   (`price_…`) → put it in `.env` as `STRIPE_PRICE_ID`.
3. Dashboard → **Developers → API keys** → copy the **Secret key** (`sk_…`) →
   `.env` as `STRIPE_SECRET_KEY`. (Use **test mode** keys while building.)
4. Dashboard → **Developers → Webhooks** → **Add endpoint**:
   - URL: `https://YOUR-DOMAIN/webhook/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`) → `.env` as `STRIPE_WEBHOOK_SECRET`.
5. Restart the server. The console now shows `Stripe: on`.

To test webhooks locally, install the Stripe CLI and run:
`stripe listen --forward-to localhost:8080/webhook/stripe`.

---

## 3. Put it online (get your public link)

This project already fits the repo's Render setup. The simplest path:

1. Push this repo to GitHub.
2. Create a **Web Service** on <https://render.com> (or Railway/Fly.io) pointing
   at `claude-studio/server`, build command `npm install`, start command `npm start`.
3. Add all the `.env` values as environment variables in the host's dashboard
   (never commit `.env`).
4. Set `PUBLIC_URL` to the URL the host gives you (e.g. `https://yourapp.onrender.com`).
5. Point your Stripe webhook at `https://yourapp.onrender.com/webhook/stripe`.

That URL is the public link you share. Add a custom domain in the host's
dashboard when you're ready.

> **Note on the database:** this MVP stores accounts in a local SQLite file.
> On hosts with disposable disks, attach a **persistent disk** (Render offers
> one) so accounts survive restarts, or move to a hosted Postgres later.

---

## 4. Setting your price so you actually profit

- Each message costs you roughly a fraction of a cent to a few cents depending
  on the model and length. Cheaper model (`claude-haiku-4-5-20251001`) = more margin.
- `PRO_MONTHLY_LIMIT` caps how many messages a subscriber gets per month, so a
  single heavy user can't cost you more than they pay. Set subscription price
  comfortably above `PRO_MONTHLY_LIMIT × your-per-message-cost`.
- `FREE_MONTHLY_LIMIT` is your free trial. Keep it small (3–10).

---

## Things to add later (not in this MVP)

- Password reset / email verification (needs an email service).
- Image generation (the Messages API can't make images; you'd add a separate image model).
- A sandbox if you ever want the assistant to actually **run** code.
- Move conversation history and accounts to a managed database for scale.

---

## Important: don't share your personal Claude account

This app uses the **Claude API** (a separate, pay-as-you-go product) — that is
the allowed way to offer Claude to other people. Sharing your personal
Claude.ai Pro/Max login with the public is against Anthropic's terms and would
put your account at risk.
