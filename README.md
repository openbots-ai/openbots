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
engine first checks who sent it: agents answer only the owner (once their phone is verified) and the people on the
owner's **Allowed people** list (Settings). A text from anyone else is dropped there: no model is called, no contact,
chat or message is stored, nothing is sent back, and the owner isn't texted or emailed about it, so strangers can't
spend the owner's AI keys or texting credit. The engine only counts them, and the dashboard shows how many were
ignored today and the last few numbers, with **Allow** next to each. In a group chat, only allowed senders' texts
reach the agent. With no verified phone yet, agents answer nobody.

For an allowed text, the engine finds the agent for that number in Convex, stores the message locally, writes the reply with the Brain model
(the Backup model if that fails) and sends it back the way it came. Knowledge documents are used with other people
only when marked "Share with contacts"; the rest stay in the owner's own one-to-one chats. Convex only receives counts,
which feed Analytics and the usage budget (200 credits a day until the owner sets their own). An agent sends one
contact at most 20 replies an hour (set in Settings; the owner's own chats aren't limited), and new-contact alerts go
out at most 3 an hour. When an agent can't reply or asks for a person, the engine texts the owner's phone, naming the
contact but never quoting them. A provider error is retried after 1, 4 and 10 minutes first; when the agent asked for
a person or a budget ran out, it stays out of that chat for 24 hours. [SECURITY.md](SECURITY.md) says exactly who can
see what.

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

3. **Set up sign-in with [Clerk](https://clerk.com).** Create a Clerk application, turn on its Convex integration
   (Configure → Integrations → Convex), and put its publishable key in `.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`.

4. **Store the server's settings.** In another terminal:

   ```sh
   npm run setup
   ```

   This generates `ENCRYPTION_KEY` (encrypts the keys people save in Connections) and asks for
   `CLERK_JWT_ISSUER_DOMAIN`, your Clerk app's Frontend API URL (Configure → API keys), and stores both on the
   deployment, so nothing secret goes in a file. Running it again only fills in what's missing, and it never replaces
   `ENCRYPTION_KEY`, since saved keys can't be read without it. Until it has run, the dashboard shows a setup screen
   instead of the sign-in page.

5. **Run the site.** `npm run dev` and open <http://localhost:5173/dashboard>. Sign up with an email code or Google.

6. **Deploy to production** when you're ready:

   ```sh
   npx convex deploy          # push the functions to your production deployment
   npm run setup -- --prod    # production needs its own secrets, and your Clerk production instance's URL
   ```

   Then host the site. On Vercel, import the repository and set `VITE_CONVEX_URL` to the production deployment's URL
   (`https://<name>.convex.cloud`) and `VITE_CLERK_PUBLISHABLE_KEY` to your Clerk production key; `vercel.json` already sets the build command, the output directory and the rewrite
   that sends every path to `index.html`. Any static host works if it does the same. The build also bundles the engine
   into `/engine/openbots-engine.mjs`, which the dashboard's start commands and Orgo computers download from your own
   site.

7. **Start an engine.** In the dashboard, open **Connections**, name a computer and add it. Connections shows, once,
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
  incoming texts to the engine, so it needs a public HTTPS address; the engine gets one from Cloudflare's quick tunnel by
  itself.
- **Their phone number** (Settings → General), verified with a 6-digit code their engine texts to it (so texting must
  be set up first). Until it's verified, agents answer nobody. It's where handoff alerts and check-ins go, and the
  number they text their own agents from for reminders, watches and computer use tasks. An Apple ID email works too
  when the engine texts through iMessage on a Mac (Messages, BlueBubbles or a relay).
- **Allowed people** (Settings): the other people their agents should answer, by name and phone or Apple ID email.
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
