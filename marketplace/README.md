# Claude Marketplace

An admin-run marketplace for selling **Claude.ai subscription setup**. You (the
admin) create member accounts and list subscription plans. A member signs in
with the link, sees your plans, clicks **Buy**, and a **persistent chat** opens
with you — where you arrange payment, open and subscribe their Claude.ai
account, hand it over, and teach them how to use it for writing, science,
coding and more.

```
Customer (public link) ──► signs in ──► sees your plans ──► clicks Buy
        │                                                      │
        └────────────── persistent chat with the admin ◄───────┘
                 (survives sign-out, restart, and laptop sleep)
```

## How it works

- **Admin creates accounts.** There is no public self-signup. You create each
  member's email + password and give it to them.
- **Admin sets the plans.** Name, price, currency, and monthly or one-time
  billing. Edit or hide them anytime; the public page updates instantly.
- **Buy = start a conversation.** Clicking Buy drops a message into the
  member's thread naming the plan, so you know exactly what they want.
- **One thread per member, forever.** The same chat is waiting every time they
  sign back in. Unread badges show who has new messages.
- **Everything persists.** Accounts, plans, and every message live in an
  on-disk SQLite database (`data/marketplace.db`, WAL mode). They survive the
  server restarting and the laptop going to sleep — nothing is kept only in
  memory.

## Run it (on your laptop)

Needs **Node.js 20+**.

```bash
cd marketplace/server
npm install
cp .env.example .env     # then edit: set ADMIN_PASSWORD and JWT_SECRET
npm start                # open http://localhost:8080
```

Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`. The admin
account is created automatically on first launch. Then:

1. **Plans** tab → add your Claude subscription plans.
2. **Members** tab → create a member account and give them the login.
3. The member opens the site, signs in, clicks **Buy**, and chats with you.

## Share a public link (Cloudflare — auto, free, no account)

```bash
npm run public
```

This starts the server **and** a Cloudflare *quick tunnel*, then prints a public
link like:

```
PUBLIC LINK (share this):  https://something-random.trycloudflare.com
```

Share that URL — anyone can reach your marketplace, no Cloudflare account or
domain required. The tunnel **auto-reconnects**, so when your laptop wakes from
sleep the link keeps working.

You just need the `cloudflared` tool installed once:

| System | Install |
|--------|---------|
| macOS | `brew install cloudflared` |
| Windows | `winget install --id Cloudflare.cloudflared` |
| Linux / any | https://github.com/cloudflare/cloudflared/releases/latest |

> **Note on the quick-tunnel URL:** it's random and *changes* if `cloudflared`
> fully restarts (e.g. you quit and relaunch). Your members' logins and
> messages are **not** affected — those are in the database and always survive.
> If you want a **permanent** URL, create a free Cloudflare account and a *named*
> tunnel (`cloudflared tunnel create`), pointing it at `http://localhost:8080`;
> see the Cloudflare Tunnel docs. The quick tunnel above is the zero-setup
> option.

## Keeping it running when the laptop sleeps

The database is on disk, so **data is never lost** on sleep. To keep the
*service* reachable 24/7 you have two options:

- **Prevent sleep while serving:** macOS `caffeinate -s npm run public`;
  Windows set power plan to never sleep; Linux `systemd-inhibit`.
- **Host it instead of a laptop:** deploy `marketplace/server` to any Node host
  (Render, Railway, Fly, a VPS) with a persistent disk for `data/`, and you get
  a stable public URL with no tunnel needed.

## Security notes

- Change `ADMIN_PASSWORD` and set a long random `JWT_SECRET` before going
  public (the server warns you if you haven't).
- Passwords are hashed with bcrypt; logins use signed JWT tokens (30-day).
- This tool helps you *sell a service*. Follow Anthropic's terms when you set up
  and hand over Claude.ai accounts for customers.
