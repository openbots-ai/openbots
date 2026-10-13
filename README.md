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
Only the exact path `/dashboard` loads it, and it is served with `noindex`. Views switch via `?view=`
so the path never changes. Everything it shows lives in [Convex](https://convex.dev) (`convex/`).

People sign up with an email and password and get a private workspace. They bring their own accounts:
OpenBots runs nothing on platform keys, so hosting it costs only Convex and Vercel.

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
npm test                # unit tests and the Convex pipeline tests (convex-test)
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel.

### Server secrets (once, by whoever hosts OpenBots)

```sh
npm run setup             # the dev deployment
npm run setup -- --prod   # production
```

This generates the server's own secrets and stores them on the Convex deployment, the way Vercel keeps
environment variables on its side: nothing secret goes in a file or the repo. It sets `ENCRYPTION_KEY`, which
encrypts every key people connect, and the sign-in key pair (`JWT_PRIVATE_KEY`, `JWKS`). Running it again only
fills in what's missing; it never replaces `ENCRYPTION_KEY`, since stored connections can't be read without it.
Until it has run, the dashboard shows a setup screen instead of the sign-in page.

`.env.local` only holds the deployment's address (written by `npx convex dev`). None of the values in it are secret.

The schema now scopes everything to a signed-in user's workspace. A deployment holding data from before
sign-in existed won't accept the new schema; clear its tables (Convex dashboard → Data) before deploying.

### What each person connects (Connections page)

- **AI**: an OpenAI, Anthropic, Google Gemini or xAI API key. Agents can't reply until the provider behind
  their Brain (or Backup) model is connected. Keys are checked with the provider before they're saved.
- **Texting**, one or more of:
  - **BlueBubbles**: iMessage from their own Mac running BlueBubbles Server (free). They paste its URL and
    password; the incoming-message webhook is registered on the Mac automatically. Group chats work.
  - **Sendblue**: iMessage on their Sendblue line, no Mac. They paste their API key ID and secret; the receive
    webhook is registered through Sendblue's API. Group chats work on plans that include them.
  - **Twilio**: SMS. They paste their Account SID and auth token, then search and buy a number (billed by Twilio
    to them) or reuse one they own, right in Numbers; its SMS webhook is set automatically and every incoming
    request's Twilio signature is checked. US texting needs A2P 10DLC registration in their Twilio account.
- **Email** (optional): their Resend key and a from address, to email notifications and the daily digest.

Credentials are encrypted (AES-GCM) before they're stored, decrypted only inside backend actions, and never
sent back to the browser.

### How a text flows

1. The texting account posts the message to `{CONVEX_SITE_URL}/hooks/<provider>/<token>`, where the token picks
   the connection (and its workspace).
2. Convex matches the number it was sent to and its agent, finds or creates the contact and conversation
   (one per group chat thread), and stores the message. In a group chat the agent answers only when someone
   uses its name.
3. If the agent is live, a reply is scheduled after the workspace's reply delay (or when quiet hours end).
   It's written by the agent's Brain model, with the person's own key, using its instructions, knowledge, the
   contact's notes and the recent history. If that provider fails, the Backup model takes over. Draft and
   paused agents leave the conversation for you.
4. The reply goes out through the same account (Twilio, Sendblue or BlueBubbles), to the person or the group,
   and its delivery state is shown in the thread.
5. When an agent can't reply (no key, budget used up, provider error) or hands off, the conversation is marked
   "Needs you" and a notification is added (and emailed when Resend is connected). Usage is recorded per agent,
   model and day for Analytics and the usage budget.

"Test a text" in the dashboard runs the same path with the real model, but marks the conversation as a test and
never sends anything to a phone.

Only the Brain and Backup model slots run today, so the dashboard offers only those. The other parts shown on
the landing page (voice notes, listening, calls, vision, computer use, decisions, router) are not built yet.
