# Deploy Claude Studio and get your public link

No terminal on your computer needed. You'll connect GitHub to a host, paste a
few keys into a dashboard, and get a public URL to share. ~20 minutes.

Follow the steps in order. **Do step 1 first** — nothing works without the key.

---

## Step 1 — Get your free AI key(s)

The site uses **free** AI providers — no credit card needed. You can serve free
users with one and paying customers with another.

**Google Gemini** (serves free users by default):
1. Go to <https://aistudio.google.com> → sign in with your Google account.
2. Click **Get API key** → **Create API key** → copy it and keep it safe.

**Groq** (used for paying subscribers by default — optional but recommended):
1. Go to <https://console.groq.com> → sign up.
2. **API Keys** → **Create API Key** → copy it.

> You only strictly need the Gemini key to launch. If you skip Groq, set
> `PAID_AI_PROVIDER=gemini` so paying users also use Gemini.
> (Claude/Anthropic is also supported but is paid — see the README.)

---

## Step 2 — Put your code on GitHub

Your code is already pushed to GitHub (the `nwaforjohn/encrypted` repository,
branch `claude/peaceful-planck-wepjsn`). You'll point the host at it in step 3.

---

## Step 3 — Create the web service on Render

1. Go to <https://render.com> and sign up (use "Sign in with GitHub").
2. Click **New +** → **Web Service**.
3. Connect your GitHub and pick the **`encrypted`** repository.
4. Fill in these settings:
   - **Branch:** `claude/peaceful-planck-wepjsn`
   - **Root Directory:** `claude-studio/server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Starter** (~$7/mo — needed so customer accounts
     survive restarts). You can pick Free just to test, but accounts reset
     when it sleeps.
5. **Add a disk** (so the accounts database persists):
   - Scroll to **Disks** → **Add Disk**
   - Name: `studio-data` · Mount Path: `/data` · Size: 1 GB
6. Add **Environment Variables** (click **Advanced** / **Add Environment Variable**):

   | Key | Value |
   |-----|-------|
   | `AI_PROVIDER` | `gemini` (what free + Basic users get) |
   | `PAID_AI_PROVIDER` | `groq` (what Pro users get; or `gemini` if you skipped Groq) |
   | `GEMINI_API_KEY` | your Gemini key from step 1 |
   | `GROQ_API_KEY` | your Groq key from step 1 (skip if not using Groq) |
   | `JWT_SECRET` | click "Generate" if offered, else paste a long random string |
   | `DB_PATH` | `/data/studio.db` |
   | `FREE_TRIAL_DAYS` | `1` |
   | `FREE_MONTHLY_LIMIT` | `25` |
   | `BASIC_MONTHLY_LIMIT` | `300` |
   | `PRO_MONTHLY_LIMIT` | `2000` |

7. Click **Create Web Service**. Wait for it to build and go live.
8. Render gives you a URL like `https://claude-studio-xxxx.onrender.com`.
   **Copy it.**
9. Add one more environment variable and redeploy:
   - `PUBLIC_URL` = that `https://…onrender.com` URL

**That URL is your public link.** Open it, create an account, and chat. New
users get a **1-day free trial**; after that they must upgrade. Payments turn on
in step 4 — until then the site runs in free mode.

---

## Step 4 — Turn on subscriptions (Stripe) — when you're ready

1. Create a Stripe account at <https://stripe.com> and finish onboarding
   (add your bank account so you can get paid out).
2. **Product catalog** → create **two** products, each with a **recurring
   monthly price**, and copy each **Price ID** (`price_…`):
   - **Basic — $10/month** → this is your `STRIPE_PRICE_BASIC`
   - **Pro — $20/month** → this is your `STRIPE_PRICE_PRO`
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…` while
   testing, `sk_live_…` for real money).
4. **Developers → Webhooks** → **Add endpoint**:
   - Endpoint URL: `https://YOUR-RENDER-URL/webhook/stripe`
   - Select events: `checkout.session.completed`,
     `customer.subscription.created`, `customer.subscription.updated`,
     `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).
5. Back in Render → your service → **Environment** → add:
   - `STRIPE_SECRET_KEY` = your `sk_…`
   - `STRIPE_WEBHOOK_SECRET` = your `whsec_…`
   - `STRIPE_PRICE_BASIC` = your `$10` price id
   - `STRIPE_PRICE_PRO` = your `$20` price id
6. Save — Render redeploys. The upgrade plans now work, and money goes to your
   Stripe account.

---

## After it's live

- **Custom domain:** Render → Settings → Custom Domains (point your own domain).
  Remember to update `PUBLIC_URL` and the Stripe webhook URL if you do.
- **Check your costs:** Gemini and Groq have free tiers (watch limits in their
  dashboards); watch revenue at dashboard.stripe.com. On the free tiers your AI
  cost is ~$0, so a $10 or $20 subscription is almost all profit — until you
  outgrow the free tiers and move to a paid plan.
- **Mind the free-tier limits:** Gemini/Groq free tiers are rate-limited and may
  not permit heavy commercial use. If the site gets busy, upgrade that provider
  to a paid tier (or point Pro at Claude for best quality).

---

## Quick troubleshooting

- **Chat says "the assistant had a problem"** → usually a missing/invalid
  `GEMINI_API_KEY` (or `GROQ_API_KEY` for Pro users), or you hit the provider's
  free-tier rate limit.
- **Upgrade says "payments aren't available yet"** → your `STRIPE_…` variables
  (secret, webhook, and at least one price id) aren't all set (you're still in
  free mode).
- **Accounts disappear after a while** → you're on Free instance or have no
  disk; use Starter + the `/data` disk from step 3.
- **Checkout succeeds but user still blocked** → the Stripe webhook URL is wrong
  or `STRIPE_WEBHOOK_SECRET` doesn't match; re-check step 4.
