# Deploy Claude Studio and get your public link

No terminal on your computer needed. You'll connect GitHub to a host, paste a
few keys into a dashboard, and get a public URL to share. ~20 minutes.

Follow the steps in order. **Do step 1 first** — nothing works without the key.

---

## Step 1 — Get your Anthropic API key (required)

This is a separate, pay-as-you-go product. It is NOT your Claude.ai subscription.

1. Go to <https://console.anthropic.com> and sign up.
2. **Billing** → add a little credit (minimum ~$5; each message costs a fraction of a cent).
3. **API Keys** → **Create Key** → copy it (starts with `sk-ant-…`) and keep it safe.

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
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key from step 1 |
   | `CLAUDE_MODEL` | `claude-sonnet-5-5` (or `claude-haiku-4-5-20251001` for cheaper) |
   | `JWT_SECRET` | click "Generate" if offered, else paste a long random string |
   | `DB_PATH` | `/data/studio.db` |
   | `FREE_MONTHLY_LIMIT` | `5` |
   | `PRO_MONTHLY_LIMIT` | `1000` |

7. Click **Create Web Service**. Wait for it to build and go live.
8. Render gives you a URL like `https://claude-studio-xxxx.onrender.com`.
   **Copy it.**
9. Add one more environment variable and redeploy:
   - `PUBLIC_URL` = that `https://…onrender.com` URL

**That URL is your public link.** Open it, create an account, and chat. It runs
in free mode (no payments) until you do step 4. Your free messages work right away.

---

## Step 4 — Turn on subscriptions (Stripe) — when you're ready

1. Create a Stripe account at <https://stripe.com> and finish onboarding
   (add your bank account so you can get paid out).
2. **Product catalog** → add a product with a **recurring monthly price**
   (e.g. $10/month). Copy its **Price ID** (`price_…`).
3. **Developers → API keys** → copy the **Secret key** (`sk_test_…` while
   testing, `sk_live_…` for real money).
4. **Developers → Webhooks** → **Add endpoint**:
   - Endpoint URL: `https://YOUR-RENDER-URL/webhook/stripe`
   - Select events: `checkout.session.completed`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).
5. Back in Render → your service → **Environment** → add:
   - `STRIPE_SECRET_KEY` = your `sk_…`
   - `STRIPE_PRICE_ID` = your `price_…`
   - `STRIPE_WEBHOOK_SECRET` = your `whsec_…`
6. Save — Render redeploys. The Subscribe button now works, and money goes to
   your Stripe account.

---

## After it's live

- **Custom domain:** Render → Settings → Custom Domains (point your own domain).
  Remember to update `PUBLIC_URL` and the Stripe webhook URL if you do.
- **Check your costs:** watch usage at console.anthropic.com; watch revenue at
  dashboard.stripe.com. Profit = Stripe revenue − Anthropic usage.
- **Set your price above your cost:** keep the monthly price comfortably higher
  than `PRO_MONTHLY_LIMIT × your per-message cost`.

---

## Quick troubleshooting

- **Chat says "the assistant had a problem"** → usually a missing/invalid
  `ANTHROPIC_API_KEY`, or no billing credit on the Anthropic account.
- **Subscribe button says "payments are not set up"** → the three `STRIPE_…`
  variables aren't all set yet (that's fine; it means you're still in free mode).
- **Accounts disappear after a while** → you're on Free instance or have no
  disk; use Starter + the `/data` disk from step 3.
- **Checkout succeeds but user still blocked** → the Stripe webhook URL is wrong
  or `STRIPE_WEBHOOK_SECRET` doesn't match; re-check step 4.
