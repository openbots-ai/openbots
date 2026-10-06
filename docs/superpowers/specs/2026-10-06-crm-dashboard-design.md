# OpenBots CRM Dashboard — Design

Date: 2026-10-06

## Goal

A hidden operator dashboard at `/crm` where an individual builds and manages their own
OpenBots agents (AI agents people text in iMessage). The layout copies the Retell AI
dashboard; the content is OpenBots-specific. Data lives in Convex.

## Access

- Only the exact path `/crm` (trailing slash tolerated, as with other routes) renders the CRM.
  `/crm/<anything>` and all other unknown paths keep redirecting to `/`.
- No link to `/crm` anywhere on the landing site.
- CRM sets `<meta name="robots" content="noindex, nofollow">` at runtime; `public/robots.txt`
  gets `Disallow: /crm`.
- In-app navigation uses the query string (`/crm?view=agents&id=...`), never path segments.
- No auth (explicitly out of scope).

## Bundle isolation

`App.tsx` lazy-loads `src/crm/crm-app.tsx` via `React.lazy`. Convex client, provider and all CRM
code live in that chunk, so the landing page bundle is unchanged. Lenis smooth scroll is not
mounted on `/crm` (the dashboard scrolls inside panes).

## Layout (Retell-style)

Light, neutral app shell, full viewport height, no page scroll.

- **Sidebar** (fixed width ~232px, collapsible on mobile into a drawer):
  - Top: OpenBots logo, workspace switcher card ("Workspace / <name>").
  - Nav groups with small uppercase labels:
    - Home
    - BUILD: Agents, Knowledge
    - DEPLOY: iMessage Numbers, Broadcasts
    - DATA: Conversations, Contacts
    - MONITOR: Analytics, Live
    - SYSTEM: Settings
  - Bottom: plan card, account row, Help / Updates.
- **Main area**: rounded white panel with header toolbar (title, search, secondary action,
  primary dark action). Views that have grouping (Agents, Knowledge) get a secondary list pane
  (e.g. "All Agents" + folders), like Retell.

## Views

| View | Content |
| --- | --- |
| Home | "Good evening, <name>" + Conductor-style prompt "Describe the agent you want". Submitting creates a draft agent from the text (name/role heuristics, no LLM) and opens it. Left history pane lists recent drafts. |
| Agents | Table: avatar+name, role, iMessage number, status, edited. Folders pane. Create, search. Row → agent detail. |
| Agent detail | Edit name, role, avatar, personality/system prompt, greeting, status (draft/live/paused), folder, linked knowledge. Delete. |
| Knowledge | Docs (title, body, agent). Create/edit/delete. |
| iMessage Numbers | Handles (phone/email) with assigned agent; add, reassign, remove. |
| Broadcasts | Scheduled message to a tag of contacts via an agent: create, list with status. No real sending. |
| Conversations | Two panes: conversation list (contact, agent, last message, time) and message thread. Compose box adds a message (stored only). |
| Contacts | Table with name, handle, tags, agent, last seen; create/edit/delete, search. |
| Analytics | Stat tiles (agents live, contacts, conversations, messages 7d) + messages-per-day bar chart + per-agent breakdown. |
| Live | Conversations with activity in the last 24h, refreshed via Convex reactivity. |
| Settings | Workspace name, owner name. |

## Data model (Convex)

```
workspace:     { name, ownerName }
agents:        { name, role, avatar, prompt, greeting, status: 'draft'|'live'|'paused', folder?: string, updatedAt }
numbers:       { handle, kind: 'phone'|'email', agentId?: Id<'agents'> }
contacts:      { name, handle, tags: string[], agentId?: Id<'agents'>, notes, lastSeenAt? }
conversations: { contactId, agentId, lastMessage, lastAt }       index by_lastAt
messages:      { conversationId, from: 'contact'|'agent', body, at }  index by_conversation
knowledge:     { title, body, agentId?: Id<'agents'>, updatedAt }
broadcasts:    { title, body, agentId, tag, scheduledFor, status: 'scheduled'|'sent' }
```

Functions per table in `convex/<table>.ts`: `list`, `get`, `create`, `update`, `remove`
(conversations also `messages`, `send`). `convex/seed.ts` has a `run` mutation that is a no-op
if agents exist, otherwise seeds the eight mascots (Ava, Emily, Jason, Kai, Leo, Marcus, Nora,
Sam using `/avatars/*.webp`), numbers, ~20 contacts, conversations with messages across the last
14 days, knowledge docs, and one broadcast. The CRM calls it on first load when the agents list
is empty.

## Configuration

- `convex` npm dependency; `convex/` directory at repo root.
- `VITE_CONVEX_URL` in `.env.local` (written by `npx convex dev`) and in Vercel env vars.
- If `VITE_CONVEX_URL` is missing, `/crm` shows a setup message instead of crashing.
- README documents the `/crm` route and Convex setup/deploy (`npx convex deploy`).

## Errors and empty states

- Each table view has an empty state with a create action.
- Loading uses skeleton rows (as Retell does).
- Mutations failing show an inline toast-style message.

## Testing

No test framework exists in the repo. Verification: `npm run build` and `npm run lint` pass;
manual run with a Convex dev deployment checking every view, CRUD on agents/contacts, the
`/crm` vs `/crm/x` vs landing routing, and that the landing bundle has no Convex code.

## Out of scope

Auth, real iMessage delivery, real LLM generation, multi-workspace.
