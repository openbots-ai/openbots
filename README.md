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
Only the exact path `/dashboard` loads it, and it is served with `noindex`. It needs a sign-in (email and password).
Views switch via `?view=` so the path never changes. Everything it shows lives in [Convex](https://convex.dev) (`convex/`);
nothing is seeded. Conversations and contacts aren't part of it: they stay on your agent (see below and
[SECURITY.md](SECURITY.md)). On a fresh deployment, the first account to sign in sets up the workspace and owns it;
other accounts can sign in but can't open it.

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
npm test                # unit tests, the Convex tests (convex-test) and the agent's tests
npm run runner          # build and start the agent locally (reads runner/.env)
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel. `.env.example` lists every variable.

### Sign-in

Sign-in uses [Convex Auth](https://labs.convex.dev/auth). Each deployment (dev and production) needs its own
signing key pair and `SITE_URL`. Generate the pair and set it:

```sh
node -e 'import("jose").then(async({generateKeyPair,exportPKCS8,exportJWK})=>{const k=await generateKeyPair("RS256",{extractable:true});const priv=await exportPKCS8(k.privateKey);const pub=await exportJWK(k.publicKey);console.log(priv.trimEnd().replace(/\n/g," "));console.log(JSON.stringify({keys:[{use:"sig",...pub}]}))})' > keys.txt
npx convex env set "JWT_PRIVATE_KEY=$(sed -n 1p keys.txt)"
npx convex env set "JWKS=$(sed -n 2p keys.txt)"
npx convex env set "SITE_URL=http://localhost:5173"   # your dashboard's URL in production
rm keys.txt
```

Add `--prod` to each `env set` for the production deployment.

### The agent (`runner/`)

Replies are written by the **agent**, a program the workspace owner runs on a machine they choose: the Mac signed in
to iMessage, or a VM/server with a relay on the Mac. It keeps contacts, conversations and messages in a local
encrypted SQLite file and calls the model the owner picked, with keys set on the agent. Convex never receives
message text, contact details or model keys. Setup, settings and release verification are in
[runner/README.md](runner/README.md); add an agent in **Settings → Agent**.

### How a text flows

1. A text reaches the agent, either from Messages on its Mac or from your relay (`POST /inbound` on the agent).
2. The agent matches the number it was sent to with one of your iMessage numbers and that number's agent (from
   Convex, live), then finds or creates the contact and conversation locally and stores the message encrypted.
3. If the agent is live, the reply waits for the workspace's reply delay (or the end of quiet hours). Then the
   agent's Brain model writes it from its instructions, knowledge, the contact's notes and recent history. If that
   provider fails, the Backup model takes over.
4. The agent sends the reply from the same number and sends Convex only counts: texts in and out, active
   conversations, new contacts, model usage. These feed Analytics and the usage budget.
5. When an agent can't reply (paused, budget used up, provider error) or asks for you, it texts your phone
   (Settings → General) without quoting the contact, and stays out of that chat for 24 hours.

### Environment variables

The Convex deployment only needs the sign-in variables. Set them with `npx convex env set "NAME=value"`.

| Variable | Used for |
| --- | --- |
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | Dashboard sign-in (see Sign-in above) |

Model keys, the relay settings and demo mode are set on the agent instead; see
[runner/README.md](runner/README.md#settings).

Deployments that stored conversations in Convex before the agent existed: run `npx convex run migrations:purgeLegacy`
once to delete them (export first with `npx convex export` if you want a copy).

Deployments made before handles had lookup keys need one migration: `npx convex run migrations:backfillKeys`.
