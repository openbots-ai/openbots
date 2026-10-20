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
messages: conversations and contacts stay on the engine. Keys and account logins either stay on it
(environment variables) or are saved once in Connections for the whole account, encrypted by the backend. See [SECURITY.md](SECURITY.md).

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

This generates the server's own secrets and stores them on the Convex deployment, so nothing secret goes in a file or
the repo: `ENCRYPTION_KEY`, which encrypts the keys people save in Connections, and the sign-in key pair
(`JWT_PRIVATE_KEY`, `JWKS`) for [Convex Auth](https://labs.convex.dev/auth). Running it again only fills in what's
missing; it never replaces `ENCRYPTION_KEY`, since saved keys can't be read without it. Until it has run, the dashboard
shows a setup screen instead of the sign-in page.

The schema scopes everything to a signed-in user's workspace. A deployment holding data from before that won't
accept it; export what you want to keep (`npx convex export`) and clear its tables before deploying. A deployment
that stored conversations or connected accounts in Convex: run `npx convex run migrations:purgeLegacy` once.

If a push fails because older rows don't match (a workspace owned through `ownerId`, numbers without a
`channel`), make those fields optional in `convex/schema.ts`, push, run `npx convex run migrations:upgradeLegacy`,
then put the schema back and push again.

### The engine (`runner/`)

Each account has an always-on computer that runs the engine and is the desktop its agents use. There are two ways
to get one, both under **Connections → Computer use**:

- **On Orgo:** save an [Orgo](https://www.orgo.ai) API key and click **Create on Orgo**. The backend creates the
  computer on that Orgo account (Orgo bills it), installs Node.js, `cloudflared` and the engine (served by this site at
  `/engine/openbots-engine.mjs`, built with every deploy), and keeps it running. Incoming texts reach it through
  Cloudflare's quick tunnel, so it needs no open ports.
- **Your own computer:** a laptop, a server or any VM. Add it to get a token and run the command shown. Computer use
  works on Windows and Mac; a Linux computer (like Fedora) answers texts only.

Either way they save their keys in Connections (once per account, encrypted by the backend) or set them as environment variables on
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
- **Reminders, watches and check-ins:** text your agent from your own phone "remind me at 5 to…" or "text me if …
  changes"; set check-ins on the agent's page. Reminders and watches are stored on the engine, sealed like messages;
  Convex only counts them. Setting reminders and watches by text needs an OpenAI or Anthropic Brain model; check-ins
  and watch checks work with any Brain.
- **Computer use (Windows and Mac):** text your agent a task ("find a table at Nopa for Friday 7pm and book it") and
  it does it on the computer its engine runs on with Claude (Sonnet 5.5 or Opus 5.5, set on the Models page or the
  agent's page), asking "Reply YES" before anything that can't be undone and texting you the result. Turn it on per
  computer in Connections. Needs an Anthropic key, and the agent's Brain must be an OpenAI or Anthropic model (it's
  the Brain that hands the task over).

### How a text flows

1. A text reaches the engine: from Messages on its Mac, or posted by Twilio, Sendblue, BlueBubbles or a relay to the
   engine's own web server.
2. The engine matches the number it was sent to with one of the person's numbers and that number's agent (from
   Convex, live), finds or creates the contact and conversation locally (one per group chat thread), and stores
   the message encrypted. In a group chat the engine answers only when someone uses its name.
3. If the engine is live, the reply waits for the workspace's reply delay (or the end of quiet hours). Then the
   Brain model writes it from its instructions, knowledge, the contact's notes and recent history. Knowledge
   documents are used with other people only when marked "Share with contacts"; the rest stay in the owner's own
   one-to-one chats. If that provider fails, the Backup model takes over.
4. The reply goes out the way the text came in, to the person or the group. Convex gets only counts: texts in and
   out, active conversations, new contacts, model usage. These feed Analytics and the usage budget (200 credits a
   day until the owner sets their own in Settings).
5. When an agent can't reply (no key, paused, budget used up, provider error) or asks for a person, it texts the
   owner's phone (Settings → General), and emails them if Resend is set up, naming the contact but never quoting
   them. Then it stays out of that chat for 24 hours.

Only the Brain, Backup and Computer use model slots run today, so the dashboard offers only those. The other parts
shown on the landing page (voice notes, listening, calls, vision, decisions, router) are not built yet.
