# The OpenBots app

A small app that turns a computer you keep on (a spare laptop, a Mac mini, a rented cloud machine) into your agents'
computer. It runs the same engine as `runner/`, inside Electron's own Node.js, so there's nothing else to install and
no terminal.

What it does:

- **Connects without copying anything.** On first start it shows a QR code and a code. Scan it with your phone (or
  type the code in Connections) and approve; see `convex/pairing.ts`. The token is made on this computer and never
  leaves it.
- **Stays on.** It starts when the computer starts, keeps the screen awake for computer use, restarts the engine if it
  stops, and updates itself from GitHub releases. Closing the window keeps it running in the tray or menu bar.
- **Asks for what macOS needs.** Screen Recording and Accessibility can only be switched on by a person; the app opens
  the right pane and shows when each is allowed. It also links to the system's automatic sign-in setting.

Everything else (agents, numbers, keys) stays in the dashboard.

## Develop

```sh
npm run runner:build          # at the repo root: builds the engine the app runs
cd desktop && npm install
npm start                     # connects to the deployment in ../.env.local (VITE_CONVEX_URL)
```

Set `OPENBOTS_SITE_URL=http://localhost:5173` to open pairing links on your dev dashboard, and `OPENBOTS_DATA_DIR` to
keep a test engine's data apart from a real one. A dev build prints the engine's log in the terminal.

`npm run dist` builds installers for this machine into `release/` (unsigned unless signing is set up).

## Release

Push a tag matching `desktop/package.json`'s version, e.g. `desktop-v0.1.0`. `.github/workflows/desktop-release.yml`
builds the Mac (`.dmg`, Apple silicon and Intel), Windows (`.exe`) and Linux (`.AppImage`, `.deb`) installers and
publishes them as a GitHub release. The file names don't change between versions, so the dashboard links to
`releases/latest/download/…`.

Set these on the GitHub repository first:

| | |
| --- | --- |
| `OPENBOTS_CONVEX_URL` (variable) | Your production Convex URL. Required. |
| `OPENBOTS_SITE_URL` (variable) | Your dashboard, if not `https://getopenbots.com`. |
| `RELEASES_REPO` (variable), `RELEASES_TOKEN` (secret) | Installers and updates must be downloadable by anyone, so if this repository is private, publish to a public one (e.g. `openbots-releases`, same owner) with a token that can write releases there. |
| `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (secrets) | Mac signing and notarizing, from an Apple Developer account. Without them macOS refuses to open the app normally. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` (secrets) and `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `AZURE_PUBLISHER` (variables) | Windows signing with Azure Trusted Signing. Without it Windows shows a SmartScreen warning. |

Then set `VITE_DESKTOP_RELEASES` (the repo with the releases, e.g. `you/openbots-releases`) on the website, and
Connections shows Download buttons instead of the start command.
