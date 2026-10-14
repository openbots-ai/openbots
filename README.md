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
so the path never changes. Its data lives in [Convex](https://convex.dev) (`convex/`).

People sign up with an email and password and get a private workspace. They run their own **engine** and bring
their own accounts, so hosting OpenBots costs only Convex and Vercel, and nobody hosting it can read their
messages: conversations, contacts, AI keys and account logins stay on the engine. See [SECURITY.md](SECURITY.md).

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
npm test                # unit tests, the Convex tests (convex-test) and the engine's tests
npm run runner          # build and start the engine locally (reads runner/.env)
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel. `.env.example` lists every variable.

### Server secrets (once, by whoever hosts OpenBots)

```sh
npm run setup             # the dev deployment
npm run setup -- --prod   # production
```

This generates the sign-in key pair (`JWT_PRIVATE_KEY`, `JWKS`) for [Convex Auth](https://labs.convex.dev/auth)
and stores it on the Convex deployment: nothing secret goes in a file or the repo. Running it again keeps a pair
that's already set. Until it has run, the dashboard shows a setup screen instead of the sign-in page. That's all
Convex needs: no AI keys, no texting accounts, no encryption key.

The schema scopes everything to a signed-in user's workspace. A deployment holding data from before that won't
accept it; export what you want to keep (`npx convex export`) and clear its tables before deploying. A deployment
that stored conversations or connected accounts in Convex: run `npx convex run migrations:purgeLegacy` once.

If a push fails because older rows don't match (a workspace owned through `ownerId`, numbers without a
`channel`), make those fields optional in `convex/schema.ts`, push, run `npx convex run migrations:upgradeLegacy`,
then put the schema back and push again.

### The engine (`runner/`)

Each person runs the engine on a machine they choose: the Mac signed in to iMessage, a VM, a server at home. They
add it in **Connections**, which gives them a token, and enter their keys in Connections (locked so only the engine can read them) or set them as environment variables on
that machine. It keeps contacts, conversations and messages in a local encrypted SQLite file. Setup, settings and
release verification are in [runner/README.md](runner/README.md).

What the engine can use, all with the person's own accounts:

- **AI**: OpenAI, Anthropic, Google Gemini or xAI keys, or a local model server (Ollama, LM Studio…). The engine asks
  each provider which models the key can use and reports them, so the Models page and each agent's page offer
  exactly those; a choice is saved as `provider:model`.
- **Texting**, one or more of:
  - **Messages on a Mac**: iMessage straight from the Mac the engine runs on. One-to-one chats.
  - **BlueBubbles**: iMessage from their Mac running BlueBubbles Server (free), with group chats. The engine
    registers its webhook on the Mac.
  - **Sendblue**: iMessage on their Sendblue line, no Mac. The engine registers its webhook with Sendblue. Group
    chats work on plans that include them.
  - **Twilio**: SMS. They search and buy a number (billed by Twilio to them) or reuse one they own, right in
    Numbers; the dashboard queues the request and the engine carries it out with their Twilio login, pointing the
    number at itself. Every incoming request's Twilio signature is checked. US texting needs A2P 10DLC registration.
  - **A relay** of their own, posting texts to the engine.
- **Email** (optional): a Resend key and from address, to also email handoff alerts.

### How a text flows

1. A text reaches the engine: from Messages on its Mac, or posted by Twilio, Sendblue, BlueBubbles or a relay to the
   engine's own web server.
2. The engine matches the number it was sent to with one of the person's numbers and that number's agent (from
   Convex, live), finds or creates the contact and conversation locally (one per group chat thread), and stores
   the message encrypted. In a group chat the engine answers only when someone uses its name.
3. If the engine is live, the reply waits for the workspace's reply delay (or the end of quiet hours). Then the
   Brain model writes it from its instructions, knowledge, the contact's notes and recent history. If that
   provider fails, the Backup model takes over.
4. The reply goes out the way the text came in, to the person or the group. Convex gets only counts: texts in and
   out, active conversations, new contacts, model usage. These feed Analytics and the usage budget.
5. When an agent can't reply (no key, paused, budget used up, provider error) or asks for a person, it texts the
   owner's phone (Settings → General), and emails them if Resend is set up, naming the contact but never quoting
   them. Then it stays out of that chat for 24 hours.

Only the Brain and Backup model slots run today, so the dashboard offers only those. The other parts shown on
the landing page (voice notes, listening, calls, vision, computer use, decisions, router) are not built yet.
