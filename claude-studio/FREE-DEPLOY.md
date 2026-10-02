# Get online FAST on a free tier

This is the quickest way to put the site on the internet for **$0**. Two things
to know going in:

1. **You do the clicks.** Deploying needs *your* login and *your* Gemini key —
   nobody can do that part for you. The steps below are click-by-click.
2. **Free tiers forget data.** On a free instance the site **sleeps when idle**
   and **loses accounts/files on restart** (every ~15 min of inactivity, and on
   each deploy). That's perfect to see it live and demo it — but before charging
   real customers, switch to a plan that keeps data (see the last section).

You need **1 thing first**: a free **Gemini API key** from
<https://aistudio.google.com> → *Get API key*. (No credit card.)

---

## Option A — Render (free, recommended)

Render has a genuinely free web tier (it just sleeps when idle).

1. Go to <https://render.com> → **Sign in with GitHub**.
2. **New +** → **Web Service** → pick the **`encrypted`** repo →
   (authorize Render to see it if asked).
3. Settings:
   - **Branch:** `claude/peaceful-planck-wepjsn`
   - **Root Directory:** `claude-studio/server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
   - **Do NOT add a disk** (free tier has none — that's fine).
4. **Environment Variables** → add:
   - `AI_PROVIDER` = `gemini`
   - `PAID_AI_PROVIDER` = `gemini`  *(use Gemini for everyone for now; add Groq later)*
   - `GEMINI_API_KEY` = your key
   - `JWT_SECRET` = a long random string (mash the keyboard, 40+ chars)
   - `FREE_TRIAL_DAYS` = `1`
   - *(leave DB_PATH unset — it defaults correctly with no disk)*
5. **Create Web Service**. Wait ~2–3 min for "Live".
6. Copy the URL it gives you (like `https://claude-studio-xxxx.onrender.com`).
7. Add one more variable `PUBLIC_URL` = that URL, then **Manual Deploy → Deploy
   latest commit** (or just save, it redeploys).

**That URL is your public link.** Open it, sign up, and chat. First load after
it's been asleep takes ~30 seconds to wake — that's normal on free.

---

## Option B — Railway

Railway gives a small free trial credit (it's usage-based, not unlimited-free,
so a busy site will eventually need a few dollars of credit).

1. Go to <https://railway.app> → sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → pick **`encrypted`**.
3. Open the service → **Settings**:
   - **Root Directory:** `claude-studio/server`
   - Start command is already handled by `railway.json` (`npm start`).
4. **Variables** → add the same ones as Render step 4 above
   (`AI_PROVIDER`, `PAID_AI_PROVIDER`, `GEMINI_API_KEY`, `JWT_SECRET`,
   `FREE_TRIAL_DAYS`).
5. **Settings → Networking → Generate Domain** to get a public URL.
6. Add `PUBLIC_URL` = that domain, and redeploy.

Open the domain — that's your live site.

---

## When you're ready: keep accounts (still cheap/free)

Free web instances lose data on restart. Two ways to fix that:

- **Easiest (paid, ~$7/mo):** Render **Starter** instance + a 1 GB disk, and set
  `DB_PATH=/data/studio.db`. See `DEPLOY.md`. Accounts then persist.
- **Free but needs a code change:** use a free **Postgres** database (Render and
  Railway both offer one) so data lives in the database, not on the disk. The
  app uses SQLite today — ask and I'll add Postgres support so free-tier data
  survives restarts.

---

## Turning on real payments

Free-tier or not, taking money needs Stripe (two prices: $10 Basic, $20 Pro).
Full steps are in `DEPLOY.md` → *Turn on subscriptions*. Until then the site
runs on the 1-day free trial only.
