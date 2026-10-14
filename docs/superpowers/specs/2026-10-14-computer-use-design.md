# Computer use: agents do tasks on your Windows or Mac computer

Date: 2026-10-14. Status: draft, awaiting review.

## Goal

You text an agent a task ("find a table at Nopa for Friday 7pm and book it"). The agent does it on your own computer
with Claude's computer use (screenshots in, clicks and typing out), texts you "Reply YES to …" before anything that
can't be undone, and texts you the result when it's done or stuck.

This is project 3 of three. It builds on the tool loop and texting-first work (projects 1 and 2, merged).

## Decisions

- **Claude drives the computer.** The `computer_toolset_20260801` tool on the Claude API (GA, no beta header), with
  Claude Sonnet 5.5 by default and Opus 5.5 as the other choice. Needs an Anthropic key in Connections. OpenAI's
  computer use can be added later behind the same driver.
- **Windows and Mac only.** The computer is the one the engine runs on. Your own Linux computers stay texting-only, as
  the app already says. Orgo is out of scope here.
- **No extra installs.** The engine drives the screen with what the OS already has: PowerShell and .NET on Windows,
  `screencapture`, `sips` and JavaScript for Automation on Mac. The engine stays one file.
- **Owner-only,** like reminders: only you, in your one-on-one chat with the agent, can start a task.
- **The computer picker goes away for now.** An agent uses the computer its engine runs on. The picker comes back when
  there's a real choice (e.g. Orgo next to your own computer).
- **One task at a time per computer.** A second request while one is running gets "I'm still working on …; text stop
  to cancel it."
- Never called "routines".

## 1. Starting a task

A new tool in owner chats, offered when the engine's computer can do computer use and an Anthropic key is saved:

| Tool | What it does |
|---|---|
| `use_computer` | `{ task }`. Starts the task in the background and returns "Started". The agent tells you it's on it. |

The reply goes out right away; the task keeps running and texts you later (section 3).

## 2. The computer loop (engine)

`runner/src/computer/` holds:

- **`loop.ts`**: sends the task, a system prompt and the toolset to Claude; runs each `tool_use` block in order through
  the driver; returns one `tool_result` per block with `toolset_name: "computer"` (screenshots as images, `OK`
  otherwise); stops at the first failed action and marks the rest "Not executed: an earlier computer action in this
  turn failed."; repeats until Claude answers without tool calls.
- **`driver.ts`** interface: `screenshot()`, `click`, `type`, `key`, `scroll`, `drag`, `move`, `wait`, `cursor`;
  implemented by `windows.ts` (one long-lived PowerShell process taking commands on stdin: `CopyFromScreen` for
  screenshots, `SendInput` for mouse and keyboard) and `mac.ts` (`screencapture` + `sips` for screenshots, CGEvent
  through `osascript -l JavaScript` for input). Unknown members (`hold_key`, `left_mouse_down`, …) return `is_error`.
- **Scaling:** screenshots are resized to fit Claude's limit (long edge ≤ 1568 px for safety, Retina halved), and
  Claude's coordinates are scaled back to the real screen.
- **Two custom tools** alongside the toolset: `ask_owner` (`{ question }`) and `finish` (`{ summary }`).
- **Limits:** at most 200 actions and 30 minutes per task; only the last 3 screenshots are kept in the request; the
  daily budget is checked each round and stops the task when it's reached.

## 3. Texting you while it works

- **Asking first.** The system prompt tells Claude to call `ask_owner` before anything that can't be undone: sending a
  message or email, paying, booking, deleting, accepting terms or cookies, posting. The engine texts you
  "Reply YES to …" and the task waits. Your next text in that chat answers it: YES continues, anything else is passed to
  Claude as your answer. No answer in 30 minutes cancels the task.
- **Done:** `finish`'s summary is texted to you (kept short for SMS).
- **Stuck or failed:** you get one text saying what went wrong (step limit, time limit, budget, an error), never the
  screen contents.
- **Stop:** texting "stop" in that chat cancels the running task at the next action.
- These are the "follow-ups" from the texting-first project.

## 4. Dashboard

- **Models page:** a "Computer use" slot listing the Claude models that support the toolset (Sonnet 5.5 default,
  Opus 5.5).
- **Connections → Your own computer:** shows whether that computer can do computer use (Windows or Mac, online) and a
  one-time consent: "Agents can see your screen and use your mouse and keyboard while doing a task you text them. They
  ask before anything that can't be undone." Computer use stays off until you turn it on there.
- **Mac:** the first time, the engine tells you to allow Screen Recording and Accessibility for it in System Settings,
  and reports a problem on the heartbeat until it can take a screenshot.
- The Computer picker is removed from the Models page and agent pages.

## Privacy and safety

- Screenshots go only to Anthropic, for each step. They're never stored, logged or sent to Convex. The engine logs
  only the agent, the number of actions and how it ended.
- Claude can be misled by instructions on a web page. The ask-first rule, the owner-only start, the step and time
  limits, and "stop" are the guards; the consent text says so.
- The agent moves your real mouse. Using the computer at the same time will confuse it.

## Error handling

- No Anthropic key, Linux computer, consent off, or Mac permissions missing: `use_computer` isn't offered, and the agent
  says what's missing if you ask.
- Claude API errors retry once, then end the task with a text to you.
- The engine restarting mid-task ends the task; you get a text when it's back.

## Testing

- Loop with a fake driver and recorded Claude responses: batches run in order, a failed action skips the rest with the
  exact text, every `tool_use` gets a result with `toolset_name`, coordinates scale both ways, old screenshots pruned,
  the 200-action and 30-minute limits, budget stop.
- Asking first: `ask_owner` texts you, YES continues, another answer is passed on, 30 minutes cancels, "stop" cancels.
- Owner-only and one task at a time.
- Drivers: the Windows and Mac command builders produce the right PowerShell and JXA for each action (unit tests).
- Live: can't run here (this computer is Fedora). First real run on your Windows PC or a Mac: "open Notepad and type
  hello", then a web task with a YES step.
