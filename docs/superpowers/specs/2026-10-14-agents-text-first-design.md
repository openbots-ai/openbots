# Agents that act: a tool loop, and texting you first

Date: 2026-10-14. Status: draft, awaiting review.

## Goal

Agents stop being one-reply chatbots. When you text one, it can use tools (search, set a reminder, start watching
something) over several steps and then answer; and it can text you first: reminders you ask for, check-ins you schedule,
and alerts when something it's watching changes.

This is projects 1 and 2 of three. Project 3, computer use on Windows (Claude or OpenAI driving the screen, with a YES
by text before anything irreversible, and follow-ups when a long task finishes), builds on the loop here and comes
when the user moves to a Windows machine.

## Decisions

- **Scheduling is owner-only.** Reminders, watches and check-ins are created from your own phone (Settings → Your phone)
  or on the agent's page. Someone else texting an agent never gets the scheduling tools, so an agent can't be made to
  text strangers on a timer.
- **Reminders and watches stay on the engine,** like messages: stored in its encrypted local database, never in
  Convex. You list and cancel them by text. The dashboard only sees a count per agent.
- **Check-ins are agent settings,** set on the agent's page (days, time, what to send), stored in Convex like the
  agent's prompt; the engine schedules them.
- **First providers for tools:** OpenAI (Responses API function calling, alongside its web_search) and Anthropic
  (tool use, alongside its web search tool). Agents on Gemini, xAI or a local model keep replying without tools and
  are told they can't schedule anything yet.
- **Quiet hours** (Settings) hold check-ins and watch alerts until they end. Reminders go out at the time you asked
  for, since you chose it.
- Never called "routines" anywhere.

## 1. The tool loop (engine)

`runner/src/agent-loop.ts` replaces the single model call in `pipeline.ts`:

1. Send the conversation, the system prompt and the tool definitions to the agent's Brain model.
2. If the model calls tools, run them on the engine and send the results back. Repeat, up to 6 rounds.
3. The model's final text is the reply, sent as now (SMS length rule, citations stripped).

Tools are defined once (`runner/src/tools.ts`: name, description, JSON schema, handler) and translated per provider.
Each handler gets the conversation, agent and owner context. A failing tool returns its error to the model as the
tool result instead of breaking the reply. The Backup model takes over on provider errors as today.

First tools (owner chats only):

| Tool | What it does |
|---|---|
| `set_reminder` | `{ at: ISO time, text }`, or `{ in_minutes, text }`. Texts you `text` at that time. |
| `watch` | `{ what, check_every_minutes (≥ 30), until?: ISO time }`. Re-checks with web search on that schedule and texts you only when the answer changes. |
| `list_scheduled` | Your active reminders and watches for this agent, with short ids. |
| `cancel_scheduled` | `{ id }`. Cancels one. |

Web search stays the provider's built-in tool, not one of ours.

## 2. Texting you first (engine)

A `jobs` table in the engine's store (text sealed with the Vault like messages): `kind` (reminder | watch | checkin),
agent, your handle, the number and channel to text from, `dueAt`, `every` (minutes, for watches), `until`, the
instruction, the last result (for watches), active. A scheduler checks every 30 seconds and survives restarts (due
jobs that were missed while the engine was off run once on start, not once per missed time).

- **Reminder:** texts the reminder text, then ends.
- **Watch:** runs the agent loop with the instruction and the last result, asking for either a short update or
  the marker `[[no-change]]`. Texts you only on a change. Ends at `until`, after 30 days, or when cancelled.
- **Check-in:** at the set time on the set days (in your timezone), runs the agent loop with the check-in's
  instruction (e.g. "the weather in Saskatoon today and anything on my mind from yesterday") and texts the result.

A job texts from the number the conversation used. If that number is gone or its channel isn't running, the job
waits and the heartbeat reports a problem for the agent.

## 3. Dashboard

- **Agent page → Check-ins:** add, edit and remove check-ins (days, time, what to send, on/off). Stored on the agent
  (`agents.checkIns`, a short list). Saved through its own mutation, like the computer picker, so the edit form
  never clears it.
- **Agent page:** "3 reminders and 1 watch active" from the heartbeat (counts only), with a line explaining they're
  managed by texting the agent.

## Error handling

- Model or tool failures in an owner chat are texted to you, as now.
- A watch whose checks fail 3 times in a row texts you once and pauses itself.
- A reminder in the past is refused with a message to the model ("that time has passed").
- Limits per agent: 50 active reminders, 10 watches, 5 check-ins.

## Testing

- Tool loop: fake OpenAI and Anthropic responses with tool calls (one round, several rounds, a failing tool, the
  6-round cap).
- Scheduler with fake timers: a reminder fires once, watches text only on change and stop at `until`, check-ins
  fire on the right days in the owner's timezone and respect quiet hours, a restart runs missed jobs once.
- Owner-only: a stranger's chat gets no scheduling tools.
- Convex: check-ins mutation (owner only, limits, survives the agent edit form).
- Live: "remind me in 2 minutes to stretch" from your phone, and a check-in two minutes out.
