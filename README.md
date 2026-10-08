# OpenBots

Landing site for OpenBots: a team of AI agents you text in iMessage.

Built with Vite, React, Tailwind CSS v4, Motion and Lenis.

## Develop

```sh
npm install
npm run dev
```

## Deploy

The site is hosted on Vercel and connected to this repo. Every push to `main`
deploys to production; pushes to other branches get preview deployments.

`vercel.json` rewrites every path to `index.html` so routes like `/privacy`
and `/contact` resolve on direct load.

## Pages

| Path | Page |
| --- | --- |
| `/` | Landing page (`/about` redirects here) |
| `/privacy`, `/terms` | Legal pages |
| `/contact` | Contact form |
| `/pricing`, `/changelog`, `/docs`, `/careers`, `/security` | Coming soon |
| `/dashboard` | Agent dashboard (noindex; see below) |

## Dashboard (`/dashboard`)

The dashboard for building and managing agents, linked from "Explore the builder" on the landing page.
Only the exact path `/dashboard` loads it, and it is served with `noindex`. It has no login yet.
Views switch via `?view=` so the path never changes. Everything it shows lives in [Convex](https://convex.dev) (`convex/`);
nothing is seeded. A fresh deployment asks for your name and a workspace name, then starts empty.

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
npm test                # unit tests and the Convex pipeline tests (convex-test)
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel.

### How a text flows

1. Your iMessage relay POSTs each incoming text to `{CONVEX_SITE_URL}/inbound` with
   `Authorization: Bearer $INBOUND_SECRET` and JSON `{ to, from, body, name? }`. The answer is
   `{ ok, conversationId, markRead }`. (Conversations → "Test a text" sends one through the same path.)
2. Convex matches `to` to one of your iMessage numbers and its agent, finds or creates the contact and
   conversation, and stores the message.
3. If the agent is live, a reply is scheduled after the workspace's reply delay (or when quiet hours end).
   It's written by the agent's Brain model with its instructions, knowledge, the contact's notes and the
   recent history. If that provider fails, the Backup model takes over. Draft and paused agents leave the
   conversation for you.
4. The reply is POSTed to `OUTBOUND_WEBHOOK_URL` as `{ type: "message", from, to, body, ... }`
   (plus a `{ type: "typing" }` event first when the typing indicator is on), and its delivery state is shown
   in the thread.
5. When an agent can't reply (missing key, budget used up, provider error) or hands off, the conversation is
   marked "Needs you" and you get a notification (also emailed when Resend is set up). Usage is recorded per
   agent, model and day for Analytics and the usage budget.

### Environment variables

All optional; Settings → Integrations shows which are set. Set them with `npx convex env set NAME value`.

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | Writing replies with the model chosen for Brain / Backup |
| `INBOUND_SECRET` | Authenticating your relay on `POST /inbound` |
| `OUTBOUND_WEBHOOK_URL`, `OUTBOUND_SECRET` | Delivering replies and typing events to your relay |
| `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL` | Emailing notifications and the daily digest to the workspace email |

Deployments made before handles had lookup keys need one migration: `npx convex run migrations:backfillKeys`.
