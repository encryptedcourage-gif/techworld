# Claude Marketplace

An admin-run marketplace for selling **Claude.ai subscription setup**. You (the
admin) create member accounts and list subscription plans. A member signs in
with the customer link, sees your plans, clicks **Buy**, and a **persistent
chat** opens with you — where you arrange payment, open and subscribe their
Claude.ai account, hand it over, and teach them how to use it for writing,
science, coding and more.

```
Customer (CLIENT link) ──► signs in ──► sees your plans ──► clicks Buy
        │                                                      │
        └────────────── persistent chat with the admin ◄───────┘
                 (survives sign-out, restart, and laptop sleep)

You (ADMIN link, a separate private URL) ──► plans · members · reply to everyone
```

## Two separate links

- **CLIENT link** — the customer-facing site. Share this. Customers sign in
  with the member accounts you create.
- **ADMIN link** — your control panel, on its **own separate URL** that
  customers never receive. The admin sign-in **rejects customer accounts**, and
  the customer site exposes **none** of the admin pages or APIs, so the two
  sides stay isolated.

## How it works

- **Admin creates accounts.** No public self-signup. You create each member's
  email + password and give it to them.
- **Admin sets the plans.** Name, price, currency, monthly or one-time billing.
  Edit or hide anytime; the customer page updates instantly.
- **Buy = start a conversation.** Clicking Buy drops a message into the member's
  thread naming the plan, so you know exactly what they want.
- **One thread per member, forever.** The same chat is waiting every time they
  sign back in. Unread badges show who has new messages.
- **Everything persists.** Accounts, plans, and every message live in an on-disk
  SQLite database (`data/marketplace.db`, WAL mode). They survive the server
  restarting and the laptop going to sleep — nothing is kept only in memory.

## Run it (on your laptop)

Needs **Node.js 22.5+** (24 or newer recommended — the database uses Node's
built-in SQLite, so there is nothing to compile).

```bash
cd marketplace/server
npm install
cp .env.example .env     # then edit: set a STRONG ADMIN_PASSWORD and a random JWT_SECRET
npm start                # CLIENT http://localhost:8080 · ADMIN http://localhost:8787
```

Open the **ADMIN** URL, sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then:

1. **Plans** tab → add your Claude subscription plans.
2. **Members** tab → create a member account and give them the login.
3. Send the member the **CLIENT** URL. They sign in, click **Buy**, and chat
   with you.

## Share public links (Cloudflare — auto, free, no account)

```bash
npm run public
```

This starts the server **and two** Cloudflare quick tunnels, then prints:

```
  CLIENT LINK (share with customers)
    https://<random-a>.trycloudflare.com

  ADMIN LINK  (keep private — your control panel)
    https://<random-b>.trycloudflare.com
```

Two different random hostnames — hand out only the CLIENT one. Both tunnels
**auto-reconnect**, so the links keep working when the laptop wakes from sleep.

Install `cloudflared` once:

| System | Install |
|--------|---------|
| macOS | `brew install cloudflared` |
| Windows | `winget install --id Cloudflare.cloudflared` |
| Linux / any | https://github.com/cloudflare/cloudflared/releases/latest |

> **Quick-tunnel URLs are random and change** if `cloudflared` fully restarts.
> Member logins and messages are unaffected — those are in the database and
> always survive. For a **permanent** URL, use a free *named* Cloudflare tunnel
> (`cloudflared tunnel create`) pointing at ports 8080 (client) and 8787
> (admin), or deploy `marketplace/server` to a host.

## Keeping it running when the laptop sleeps

Data is never lost on sleep (it's on disk). To keep the *service* reachable:

- **Prevent sleep while serving:** macOS `caffeinate -s npm run public`.
- **Host it instead of a laptop:** deploy to any Node host (Render, Railway, Fly,
  a VPS) with a persistent disk for `data/`, for a stable URL with no tunnel.

## Security notes

- Use a **strong** `ADMIN_PASSWORD` and a long random `JWT_SECRET` (the server
  warns on insecure defaults). The admin link is separate, but a strong
  password is still your main lock.
- Passwords are hashed with bcrypt; logins use signed JWT tokens (30-day).
- This tool helps you *sell a service*. Follow Anthropic's terms when you set up
  and hand over Claude.ai accounts for customers.
