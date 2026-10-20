# OpenBots

OpenBots lets you build AI agents that answer your texts. You set each agent up in a web dashboard (its
instructions, knowledge, models and the numbers it answers), and an **engine** you run on your own computer does the
texting: it receives iMessages or SMS, writes replies with the AI provider and model you chose, and sends them back.
Agents can search the web, set reminders and watches when you text them, send you scheduled check-ins, hand a chat
over to you when they can't help, and, on a Windows or Mac computer, carry out tasks on its screen with Claude computer
use. Conversations and contacts stay on the engine's machine, encrypted; the backend sees settings and daily counts,
never message text. Everyone brings their own AI keys and texting accounts.

> OpenBots is early software. It hasn't had an external security review yet; read [SECURITY.md](SECURITY.md) before
> you rely on it.

## What's built, and what isn't

**Built**

- Dashboard (`/dashboard`): email and password sign-in, a private workspace per account, and pages for Agents,
  Models, Knowledge, Numbers, Connections, Analytics and Settings.
- Model slots that run today: **Brain** (writes replies), **Backup** (takes over when the Brain's provider fails) and
  **Computer use**.
- AI providers: OpenAI, Anthropic, Google Gemini, xAI, and local OpenAI-compatible servers (Ollama, LM Studio...). The
  engine asks each key which models it can use, and the dashboard offers exactly those.
- Texting: Messages on the engine's Mac, BlueBubbles, Sendblue, Twilio SMS (search and buy numbers from the
  dashboard), or your own relay.
- Web search in replies (OpenAI, Anthropic and Gemini models), reminders and watches set by text, scheduled check-ins,
  quiet hours, a reply delay, a usage budget, and handoff alerts by text (and by email with Resend).
- Computer use on Windows and Mac, with a "Reply YES" check before anything that can't be undone.
- Engine computers of your own, or created on your [Orgo](https://www.orgo.ai) account from the dashboard.

**Roadmap (not built)**

Voice notes, listening (speech to text), calls, vision, and the Decisions and Router model slots. The landing page
and the Models page mention them, but nothing runs them yet.

## Architecture

| Part | Code | Runs on | Holds |
| --- | --- | --- | --- |
| **Dashboard** | `src/` (React, Vite, Tailwind). The dashboard is `src/crm`; the landing site is `src/pages` and `src/components/landing` | Any static host (Vercel config included) | Nothing of its own |
| **Backend** | `convex/` | A [Convex](https://convex.dev) deployment | Accounts, workspaces, agents, model choices, knowledge, numbers, engine token hashes, keys saved in Connections (encrypted), daily counts |
| **Engine** | `runner/` (Node.js) | A computer you control, or an Orgo computer | Contacts, conversations and messages in an encrypted local SQLite file; keys set as environment variables |

A text reaches the engine (from Messages, or posted to its web server by Twilio, Sendblue, BlueBubbles or a relay). The
engine finds the agent for that number in Convex, stores the message locally, writes the reply with the Brain model
(the Backup model if that fails) and sends it back the way it came. Convex only receives counts. When an agent can't
reply or asks for a person, the engine texts the owner's phone, naming the contact but never quoting them, and stays
out of that chat for 24 hours. [SECURITY.md](SECURITY.md) says exactly who can see what.

## Self-host it

You need Node.js 22.13 or newer, a free [Convex](https://convex.dev) account and, for production, somewhere to host a
static site (the repo includes a `vercel.json`).

1. **Clone and install.**

   ```sh
   git clone https://github.com/shidhartha-sen/opendots && cd opendots
   npm ci
   ```

2. **Create a dev deployment.** `npx convex dev` logs you in, creates a deployment, pushes the functions in
   `convex/`, writes `.env.local` (`CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`) and keeps watching for changes. Leave it
   running.

   ```sh
   npx convex dev
   ```

3. **Generate the server's secrets.** In another terminal:

   ```sh
   npm run setup
   ```

   This stores `ENCRYPTION_KEY` (encrypts the keys people save in Connections) and the sign-in key pair
   (`JWT_PRIVATE_KEY`, `JWKS`) on the deployment, so nothing secret goes in a file. Running it again only fills in what's
   missing, and it never replaces `ENCRYPTION_KEY`, since saved keys can't be read without it. Until it has run, the
   dashboard shows a setup screen instead of the sign-in page.

4. **Run the site.** `npm run dev` and open <http://localhost:5173/dashboard>. Sign up with an email and password.

5. **Deploy to production** when you're ready:

   ```sh
   npx convex deploy          # push the functions to your production deployment
   npm run setup -- --prod    # production needs its own secrets
   ```

   Then host the site. On Vercel, import the repository and set `VITE_CONVEX_URL` to the production deployment's URL
   (`https://<name>.convex.cloud`); `vercel.json` already sets the build command, the output directory and the rewrite
   that sends every path to `index.html`. Any static host works if it does the same. The build also bundles the engine
   into `/engine/openbots-engine.mjs`, which the dashboard's start commands and Orgo computers download from your own
   site.

6. **Start an engine.** In the dashboard, open **Connections**, name a computer and add it. Connections shows, once,
   the commands to start the engine on Windows, Mac or Linux with that computer's token filled in. Or click **Create on
   Orgo** after saving an Orgo API key. To run an engine from this checkout instead, put `OPENBOTS_CONVEX_URL` and
   `OPENBOTS_TOKEN` in `runner/.env` and run `npm run runner`. Every setting, the Mac permissions, the Docker image and
   how to verify a release are in [runner/README.md](runner/README.md).

`.env.example` lists every variable, for the site, the deployment and the engine. If you're upgrading a deployment
that holds data from older versions, see [docs/migrations.md](docs/migrations.md).

## What each user connects

Every account brings its own accounts, so hosting OpenBots costs only Convex and static hosting. Keys are saved once
in **Connections** (they belong to the account, encrypted by the backend, and every engine of the account gets them)
or set as environment variables on the engine, where they never leave that machine.

- **An engine computer**: their own laptop, server or VM, or an always-on computer on their Orgo account.
- **At least one AI provider**: an OpenAI, Anthropic, Google Gemini or xAI key, or a local model server.
- **At least one way to text**: Messages on the engine's Mac, BlueBubbles Server on their Mac, a Sendblue line, a
  Twilio account (US texting needs A2P 10DLC registration), or their own relay. Twilio, Sendblue and BlueBubbles post
  incoming texts to the engine, so it needs a public HTTPS address; `OPENBOTS_TUNNEL=true` gets one from Cloudflare's
  quick tunnel.
- **Their phone number** (Settings → General), for handoff alerts and for texting their own agents reminders,
  watches and computer use tasks.
- Optional: a **Resend** key to also email handoff alerts, and an **Anthropic** key with Computer use turned on for a
  Windows or Mac computer.

## Development

```sh
npm run dev       # the site, on http://localhost:5173
npx convex dev    # the backend, watching convex/
npm run runner    # build and start the engine (reads runner/.env)
npm test          # unit tests, the Convex tests (convex-test) and the engine's tests
npm run lint
npm run build     # typecheck, build the engine and build the site
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details, the checks CI runs and how to open a pull request. Changes
are listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). Provider names and logos are trademarks of their owners; see [NOTICE](NOTICE).
