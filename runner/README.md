# OpenBots engine

The engine answers the texts your OpenBots agents receive, using the models you choose. You run it on a machine you
control: the Mac signed in to iMessage, a VM, a server at home.

You can save your keys in the dashboard (Connections) instead of setting them here. They belong to your account, so
every engine you run gets them, and a key saved there wins over the same variable here.

**Messages never leave it.** Contacts, conversations and message text are kept in a local SQLite file, encrypted
with a key that sits next to it. Keys you set here stay here too (keys saved in Connections are stored in Convex, encrypted by the backend). The OpenBots dashboard and its Convex
backend only ever see your settings (agents, models, knowledge, numbers, your phone and Allowed people), anonymous daily
counts, the numbers of the last few people whose texts were ignored, and what the engine reports as set up: which
services, which models your keys can use, and which addresses it texts from.

The one exception is the model you pick: a cloud model (OpenAI, Anthropic, Google, xAI) receives each conversation
so it can write the reply. Use a local model server if nothing should leave your machines.

## Start it

1. In the dashboard, open **Connections**, name the computer and add it. Connections then shows, once, this
   computer's token and the commands to start the engine on Windows, Mac or Linux. Convex keeps only the token's hash, so
   copy it then.
2. Run those commands on the computer. It needs [Node.js](https://nodejs.org/en/download) **22.13 or newer**; the
   engine checks when it starts and says so if yours is older. The commands download the engine, a single file this
   site serves, and start it.
3. The first time it starts, the engine asks for the token. Paste it there (it doesn't show as you paste). It's saved
   in `token` in the data folder (`~/.openbots` by default), readable only by you, so later starts don't ask again.
   The token never goes on the command line, so your shell history doesn't keep it; it unlocks every key saved in
   Connections.
4. Add your AI key(s) and a way to text in Connections, or as environment variables on the engine (see Settings
   below).

By hand, on a Mac or Linux:

```sh
mkdir -p ~/openbots && cd ~/openbots
curl -fL -o openbots-engine.mjs https://www.getopenbots.com/engine/openbots-engine.mjs
OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud node openbots-engine.mjs
```

On Windows, in PowerShell:

```powershell
mkdir -Force $HOME\openbots | Out-Null; cd $HOME\openbots
curl.exe -fL -o openbots-engine.mjs https://www.getopenbots.com/engine/openbots-engine.mjs
$env:OPENBOTS_CONVEX_URL = "https://<your-deployment>.convex.cloud"
node openbots-engine.mjs
```

Twilio and Sendblue need nothing extra: the engine gets its own public address (see below). Where no one is at a terminal to
paste the token (Docker, a service), set `OPENBOTS_TOKEN` in its environment or an env file instead, or start it once
by hand so the token is saved. **Reset token** in Connections gives the same engine a new token and stops the old one;
on its next start the engine says the saved token no longer works and asks for the new one.

Keep the window open: the engine runs while it's open. Start it from your normal desktop session, not as a
service, if you want computer use (it needs to see the screen).

On a Mac signed in to Messages with nothing else set up, it texts through Messages on that Mac. Give the app that
runs it (Terminal, iTerm, or your launchd job's binary) **Full Disk Access** in System Settings → Privacy & Security,
so it can read `~/Library/Messages`, and allow it to control **Messages** when macOS asks. It answers one-to-one
chats and starts from the newest message, so old history isn't answered.

Twilio and Sendblue post incoming texts to the engine, so it needs a public HTTPS URL. With no Public URL set, the
engine starts Cloudflare's free quick tunnel for one: the first time, it downloads a pinned `cloudflared` release into
`~/.openbots/bin`, checked against its published SHA-256, and it re-points Twilio and Sendblue whenever the address
changes. Nothing to install or sign up for. Your own tunnel or Tailscale Funnel to port 8787 works too: set it as the
Public URL and no tunnel starts. Messages on a Mac
needs no URL at all. BlueBubbles needs only an address your Mac can reach the engine at, so a private one works: on the
same Mac, `http://127.0.0.1:8787`; from another machine on your network, its private address, with the engine started
with `OPENBOTS_HOST=0.0.0.0`. Set it as the Public URL in Connections (or `OPENBOTS_PUBLIC_URL`). Every webhook path carries a random secret, and Twilio's requests are checked against its
signature.

On start, and every six hours, the engine checks each key and account with its provider and reports what it found.
Use **Re-check** in Connections after you get access to a new model.

## Settings

| Variable | |
| --- | --- |
| `OPENBOTS_CONVEX_URL` | Your Convex deployment URL (the dashboard's `VITE_CONVEX_URL`). Required. |
| `OPENBOTS_TOKEN` | The token from Connections. Optional: without it the engine asks for the token once and saves it in `OPENBOTS_DATA_DIR`. Set it where there's no terminal (Docker, a service). |
| `OPENBOTS_DATA_DIR` | Where history, its key and the saved token live. Default `~/.openbots`; `/data` in Docker. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | Your AI keys. The engine lists the chat models each can use, and the dashboard offers exactly those. |
| `OPENBOTS_LOCAL_URL` | A local, OpenAI-compatible model server, e.g. `http://localhost:11434/v1` for Ollama. Its models are listed too. `OPENBOTS_LOCAL_KEY` if it needs one. |
| `OPENBOTS_MAC` | `true` to text through Messages on this Mac. On by default on macOS when no other texting is set up. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS through your Twilio account. Buy or reuse numbers from the dashboard's Numbers page; the engine does it. |
| `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET` | iMessage through your Sendblue line. |
| `BLUEBUBBLES_URL`, `BLUEBUBBLES_PASSWORD` | iMessage through BlueBubbles Server on your Mac, with group chats. |
| `OPENBOTS_TUNNEL` | `false` to never start Cloudflare's quick tunnel. Otherwise it starts when Twilio or Sendblue need a public address and none is set (no open ports, no account), and the engine re-points Sendblue and Twilio when it changes. |
| `OPENBOTS_CLOUDFLARED` | Path to your own `cloudflared` for the tunnel (default: a pinned release the engine downloads and verifies; `cloudflared` on the PATH on systems without one). |
| `OPENBOTS_PUBLIC_URL` | Where Twilio, Sendblue or BlueBubbles reach the engine's web server. Needed for any of them; public HTTPS for Twilio and Sendblue, any address your Mac can reach for BlueBubbles. Can also be set per engine in Connections. |
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

## How a text flows

1. A text arrives (Messages, a relay, or a post from Twilio, Sendblue or BlueBubbles) and the engine finds the agent
   for the number it was sent to.
2. **Who sent it?** Your agents answer only you, from your phone in Settings once you've verified it, and the people
   on your **Allowed people** list (Settings). Numbers match however they're written. Anyone else's text stops here:
   the engine calls no model, stores no contact, chat or message, sends nothing back, and doesn't text or email you
   about it. It only counts it; each heartbeat reports the count and the last few numbers (never the text), which the
   dashboard shows with **Allow** next to each. Ignored texts are left unread. In a group chat each text is checked
   by its sender, so other members' texts never reach the agent or its history.
3. The engine stores the text (encrypted), and after the reply delay and quiet hours asks the agent's Brain (or its
   Backup) for a reply, within your budget and the per-contact reply limit, and sends it back the way it came.

Allowed people get replies, not your powers: only you, texting over iMessage, can set reminders and watches, start
computer use tasks and answer their questions. Until your phone is verified the engine treats it like any other
number: no replies, no handoff texts, alerts or check-ins to it.

**Verifying your phone.** In Settings → General, type your phone and choose **Send code**. The dashboard asks your
engine (it must be running, with a texting channel and one of your numbers on it) to text "Your OpenBots code is
123456…" from one of your numbers. The engine reports only the code's hash to Convex; type the code in the dashboard
within 10 minutes (5 tries, 3 codes an hour). An Apple ID email can be verified only through iMessage on a Mac
(Messages, a relay or BlueBubbles); Twilio and Sendblue text phone numbers. Changing the number undoes the
verification, and a phone saved before verification existed has to be verified again.

## Handoffs

When an agent can't or shouldn't answer (it asked for you, its model failed, the budget ran out, it's paused), the
engine texts **your verified phone** (Settings → General) from the engine's number, for example "Dana needs you (Pip)", and
emails you too if Resend is set up. The alert names the contact (or the group) but never quotes them. Answer them
yourself; the engine stays out of that chat for 24 hours. In a group chat it only answers when someone uses its name.

## Reminders, watches and check-ins

Text your agent from your own verified phone (Settings → General): "remind me at 5 to call Dana", "text me if the Oilers game
gets moved", "what do I have scheduled?", "cancel 2". Up to 50 reminders and 10 watches per agent; a watch checks
at most every 30 minutes, texts you only when the answer changes, and stops after 30 days or 3 failed checks.
Check-ins are set on the agent's page and go out at their time in your timezone. Quiet hours hold check-ins and watch
alerts; reminders go out at the time you asked for. A reminder or watch whose channel isn't running waits for it
(the dashboard shows the problem), and a reminder that fails to send is tried up to 3 times. Setting reminders and
watches by text needs the agent's Brain to be an OpenAI or Anthropic model; check-ins and watch checks work with any
Brain. Reminders and watches are kept in the engine's sealed database: back it up with your history.

## Computer use

On a Windows, Mac or Linux computer, your agent can do tasks on this computer's screen: text it from your own phone "open
Notepad and type hello" or "find a table at Nopa for Friday 7pm and book it". Claude (Sonnet 5.5 or Opus 5.5, set on
the Models page or the agent's page) looks at screenshots and clicks and types. Turn it on for this computer in
Connections, and save an Anthropic key there. The agent's Brain must be an OpenAI or Anthropic model too, since it's
the Brain that hands the task over.

- **Windows** needs nothing else.
- **Mac** needs **Screen Recording** and **Accessibility** allowed for the app the engine runs in (Terminal, or the
  service that starts it) in System Settings → Privacy & Security. After allowing them, quit and reopen that app (for
  Terminal, Cmd+Q and open it again), then start the engine; restarting only the engine isn't enough for Screen
  Recording. Until then Connections shows what's missing.
- **Linux** works on a desktop with KDE Plasma or GNOME, on Wayland or X11, through the desktop's own remote control
  permission. Start the engine from your desktop session (not over SSH or as a system service). Once computer use is on
  for it, the desktop asks to share the screen and input devices: pick the screen and choose **Allow**. It's remembered
  (`~/.openbots/linux-remote-control`), so it isn't asked again; delete that file to be asked again. One screen.
- It texts "Reply YES to …" before anything that can't be undone (sending, paying, booking, deleting, posting) and
  waits for your answer; it texts you the result when it's done or stuck. Text **stop** in that chat to cancel.
- Before it types anything, presses Enter (or Cmd/Ctrl+Enter) or pastes, the engine itself texts you the exact text
  and the app and window it's going to, and does it only if you reply **YES**. Reply **YES ALL** to any of its texts
  and it stops asking, about typing or anything else, in this task and every later one. Turn **Ask before computer
  actions** back on in Settings to be asked again. Anything else, or no answer within 30 minutes, declines it; a second unanswered request ends the
  task. Moving the mouse, clicking, scrolling and screenshots aren't asked about.
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

The engine never updates itself: it runs the file you downloaded until you download it again. Connections shows each
engine's version. To stay on one version, download that version's file, which the site also serves under its number:
`/engine/openbots-engine-0.2.0.mjs`. If you use the npm package or Docker image that the release workflow builds
instead, pin `openbots-runner@x.y.z` or the image tag. Those releases are built and published by GitHub Actions from
this repository, never from a laptop:

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
