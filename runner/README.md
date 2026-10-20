# OpenBots engine

The engine answers the texts your OpenBots agents receive, using the models you choose. You run it on a machine you
control: the Mac signed in to iMessage, a VM, a server at home.

You can save your keys in the dashboard (Connections) instead of setting them here. They belong to your account, so
every engine you run gets them, and a key saved there wins over the same variable here.

**Messages never leave it.** Contacts, conversations and message text are kept in a local SQLite file, encrypted
with a key that sits next to it. Keys you set here stay here too (keys saved in Connections are stored in Convex, encrypted by the backend). The OpenBots dashboard and its Convex
backend only ever see your settings (agents, models, knowledge, numbers), anonymous daily counts, and what the engine
reports as set up: which services, which models your keys can use, and which addresses it texts from.

The one exception is the model you pick: a cloud model (OpenAI, Anthropic, Google, xAI) receives each conversation
so it can write the reply. Use a local model server if nothing should leave your machines.

## Start it

1. In the dashboard, open **Connections**, name the computer and add it. Connections then shows, once, the commands
   to start the engine on Windows, Mac or Linux, with this computer's token already in them. The token is never
   stored, because Convex keeps only its hash.
2. Run those commands on the computer (Node.js 22 or newer). They download the engine, a single file this site
   serves, and start it. Add your AI key(s) and a way to text in Connections, or as environment variables on the
   engine (see Settings below).

By hand, on a Mac or Linux:

```sh
mkdir -p ~/openbots && cd ~/openbots
curl -L -o openbots-engine.mjs https://www.getopenbots.com/engine/openbots-engine.mjs
OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud \
OPENBOTS_TOKEN=obr_... \
OPENBOTS_TUNNEL=true \
node openbots-engine.mjs
```

On Windows, in PowerShell:

```powershell
mkdir -Force $HOME\openbots | Out-Null; cd $HOME\openbots
curl.exe -L -o openbots-engine.mjs https://www.getopenbots.com/engine/openbots-engine.mjs
$env:OPENBOTS_CONVEX_URL = "https://<your-deployment>.convex.cloud"
$env:OPENBOTS_TOKEN = "obr_..."
$env:OPENBOTS_TUNNEL = "true"
node openbots-engine.mjs
```

Keep the window open: the engine runs while it's open. Start it from your normal desktop session, not as a
service, if you want computer use (it needs to see the screen).

On a Mac signed in to Messages with nothing else set up, it texts through Messages on that Mac. Give the app that
runs it (Terminal, iTerm, or your launchd job's binary) **Full Disk Access** in System Settings → Privacy & Security,
so it can read `~/Library/Messages`, and allow it to control **Messages** when macOS asks. It answers one-to-one
chats and starts from the newest message, so old history isn't answered.

Twilio and Sendblue post incoming texts to the engine, so it needs a public HTTPS URL. `OPENBOTS_TUNNEL=true` gets one
from Cloudflare (install `cloudflared` first: `winget install --id Cloudflare.cloudflared` on Windows, `brew install
cloudflared` on a Mac); your own tunnel or Tailscale Funnel to port 8787 works too. BlueBubbles only needs the Mac to reach the engine, so a private
network address works. Every webhook path carries a random secret, and Twilio's requests are checked against its
signature.

On start, and every six hours, the engine checks each key and account with its provider and reports what it found.
Use **Re-check** in Connections after you get access to a new model.

## Settings

| Variable | |
| --- | --- |
| `OPENBOTS_CONVEX_URL` | Your Convex deployment URL (the dashboard's `VITE_CONVEX_URL`). Required. |
| `OPENBOTS_TOKEN` | The token from Connections. Required. |
| `OPENBOTS_DATA_DIR` | Where history and its key live. Default `~/.openbots`; `/data` in Docker. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | Your AI keys. The engine lists the chat models each can use, and the dashboard offers exactly those. |
| `OPENBOTS_LOCAL_URL` | A local, OpenAI-compatible model server, e.g. `http://localhost:11434/v1` for Ollama. Its models are listed too. `OPENBOTS_LOCAL_KEY` if it needs one. |
| `OPENBOTS_MAC` | `true` to text through Messages on this Mac. On by default on macOS when no other texting is set up. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS through your Twilio account. Buy or reuse numbers from the dashboard's Numbers page; the engine does it. |
| `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET` | iMessage through your Sendblue line. |
| `BLUEBUBBLES_URL`, `BLUEBUBBLES_PASSWORD` | iMessage through BlueBubbles Server on your Mac, with group chats. |
| `OPENBOTS_TUNNEL` | `true` to get a public HTTPS address from Cloudflare's quick tunnel (no open ports, no account). The engine uses it as its public URL when none is set and re-points Sendblue and Twilio when it changes. Orgo computers use this. |
| `OPENBOTS_CLOUDFLARED` | Path to the `cloudflared` binary for the tunnel (default: `cloudflared` on the PATH). |
| `OPENBOTS_PUBLIC_URL` | Where Twilio, Sendblue or BlueBubbles reach the engine's web server. Needed for any of them; can also be set per engine in Connections. |
| `OPENBOTS_ROTATE_WEBHOOKS` | `true` for one start to make new webhook secrets (each of Twilio, Sendblue and BlueBubbles has its own). The engine points your Twilio numbers and registers Sendblue and BlueBubbles at the new addresses and logs them; remove the old addresses from Sendblue and BlueBubbles, then unset it. |
| `OPENBOTS_HOST`, `OPENBOTS_PORT` | Where the engine's web server listens. Default `127.0.0.1:8787` (`0.0.0.0` in Docker). |
| `OPENBOTS_INBOUND_SECRET`, `OPENBOTS_RELAY_URL`, `OPENBOTS_RELAY_SECRET` | Your own relay (protocol below). |
| `RESEND_API_KEY`, `RESEND_FROM` | Also email you handoff alerts, at the email in Settings. |
| `OPENBOTS_DEMO` | `true` answers with sample replies when no AI key is set up. |

### Relay protocol

- **In:** `POST http://<engine>:8787/inbound` with `Authorization: Bearer $OPENBOTS_INBOUND_SECRET` and
  `{ "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional>" }`. Answers `{ ok, markRead }`.
- **Out:** the engine POSTs `{ "type": "message", from, to, body }` to `OPENBOTS_RELAY_URL` (with
  `Authorization: Bearer $OPENBOTS_RELAY_SECRET` if set), and `{ "type": "typing", from, to }` just before a reply.

## Handoffs

When an agent can't or shouldn't answer (it asked for you, its model failed, the budget ran out, it's paused), the
engine texts **your phone** (Settings → General) from the engine's number, for example "Dana needs you (Pip)", and
emails you too if Resend is set up. The alert names the contact (or the group) but never quotes them. Answer them
yourself; the engine stays out of that chat for 24 hours. In a group chat it only answers when someone uses its name.

## Reminders, watches and check-ins

Text your agent from your own phone (Settings → General): "remind me at 5 to call Dana", "text me if the Oilers game
gets moved", "what do I have scheduled?", "cancel 2". Up to 50 reminders and 10 watches per agent; a watch checks
at most every 30 minutes, texts you only when the answer changes, and stops after 30 days or 3 failed checks.
Check-ins are set on the agent's page and go out at their time in your timezone. Quiet hours hold check-ins and watch
alerts; reminders go out at the time you asked for. A reminder or watch whose channel isn't running waits for it
(the dashboard shows the problem), and a reminder that fails to send is tried up to 3 times. Setting reminders and
watches by text needs the agent's Brain to be an OpenAI or Anthropic model; check-ins and watch checks work with any
Brain. Reminders and watches are kept in the engine's sealed database: back it up with your history.

## Computer use

On a Windows or Mac computer, your agent can do tasks on this computer's screen: text it from your own phone "open
Notepad and type hello" or "find a table at Nopa for Friday 7pm and book it". Claude (Sonnet 5.5 or Opus 5.5, set on
the Models page or the agent's page) looks at screenshots and clicks and types. Turn it on for this computer in
Connections, and save an Anthropic key there. The agent's Brain must be an OpenAI or Anthropic model too, since it's
the Brain that hands the task over.

- **Windows** needs nothing else.
- **Mac** needs **Screen Recording** and **Accessibility** allowed for the app the engine runs in (Terminal, or the
  service that starts it) in System Settings → Privacy & Security. After allowing them, quit and reopen that app (for
  Terminal, Cmd+Q and open it again), then start the engine; restarting only the engine isn't enough for Screen
  Recording. Until then Connections shows what's missing.
- It texts "Reply YES to …" before anything that can't be undone (sending, paying, booking, deleting, posting) and
  waits for your answer; it texts you the result when it's done or stuck. Text **stop** in that chat to cancel.
- One task at a time, with at most 200 steps or 30 minutes per task. Turning Computer use off, or pausing the agent,
  stops a running task at its next step.
- It moves your real mouse and keyboard, so don't use the computer while a task runs.
- On a Mac, key presses use US key positions, so on other keyboard layouts some shortcuts land on different keys.
- On a Mac, typed text is pasted, so the clipboard briefly holds it and is then restored. The paste presses Cmd and
  the key in the US V position, so on layouts like Dvorak typing may not work.
- If the engine restarts mid-task, the task ends and you get a text about it once the engine is back.
- Screenshots go only to Anthropic, step by step. They're never saved, logged or sent to Convex; the engine logs only
  which agent ran a task, how many steps it took and how it ended.

## Back up your history

Everything is in `OPENBOTS_DATA_DIR`: `openbots.db` and `key`. **Back up both.** The database is unreadable without
the key, and if you lose the key the history is gone for good. Nobody, including the OpenBots developers, can
recover it. Turn on FileVault (or your OS's disk encryption) on the machine as well: macOS keeps its own
Messages history unencrypted on disk.

## Updating, and checking what you run

The engine never updates itself. Change the pinned version (`openbots-runner@x.y.z`, or the image tag) when you
decide to. Releases are built and published by GitHub Actions from this repository, never from a laptop:

```sh
# npm: check the package's provenance and registry signatures
npm view openbots-runner@0.2.0 dist.attestations
npm audit signatures

# Docker: check the image was signed by this repository's release workflow
cosign verify ghcr.io/shidhartha-sen/openbots-runner:0.2.0 \
  --certificate-identity-regexp 'https://github.com/shidhartha-sen/opendots/.github/workflows/runner-release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/shidhartha-sen/openbots-runner:0.2.0 --owner shidhartha-sen
```

Or build it yourself from a commit you've read:

```sh
git clone https://github.com/shidhartha-sen/opendots && cd opendots
npm ci && npm run runner:build
node runner/dist/main.mjs
```

To release a new version, bump `runner/package.json` and push a matching tag (`runner-v0.2.1`). The workflow needs
an `NPM_TOKEN` secret.
