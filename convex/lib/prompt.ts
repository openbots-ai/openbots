import type { Doc } from '../_generated/dataModel'

export type Turn = { role: 'user' | 'assistant'; content: string }
// The engine keeps contacts and messages on its own machine; these are the parts the prompt uses
export type PromptContact = { name: string; handle: string; tags: string[]; notes: string }
export type PromptMessage = { from: 'contact' | 'agent'; body: string }

// The agent ends a reply with this when it wants you to step in; it's stripped before sending
export const HANDOFF = '[[handoff]]'

const LENGTHS = {
    short: 'Keep replies to one or two short lines, like a text from a friend.',
    medium: 'Keep replies to a few sentences.',
    long: 'Replies can run to a short paragraph when the question needs it.',
}

export const MAX_TOKENS = { short: 1_000, medium: 2_000, long: 4_000 }

const LANGUAGE_NAMES: Record<string, string> = {
    'en-US': 'American English',
    'en-GB': 'British English',
    'es-ES': 'Spanish',
    'fr-FR': 'French',
    'de-DE': 'German',
    'pt-BR': 'Brazilian Portuguese',
    'it-IT': 'Italian',
    'hi-IN': 'Hindi',
    'ja-JP': 'Japanese',
}

// The offset from UTC in `timeZone` at `ms`, e.g. "UTC-06:00", from Intl's long offset name ("GMT-06:00", or "GMT" for zero)
export function utcOffset(ms: number, timeZone: string) {
    try {
        const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
        return name === 'GMT' ? 'UTC+00:00' : name.replace('GMT', 'UTC')
    } catch {
        return 'UTC+00:00'
    }
}

// A moment as the owner reads it, e.g. "Wed, Oct 14, 5:00 PM (UTC-06:00)"
export function localTime(ms: number, timeZone: string) {
    try {
        const when = new Date(ms).toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        return `${when} (${utcOffset(ms, timeZone)})`
    } catch {
        return new Date(ms).toISOString()
    }
}

export function systemPrompt(args: {
    agent: Doc<'agents'>
    workspace: Pick<Doc<'workspace'>, 'ownerName' | 'timezone'> | null
    contact: PromptContact
    knowledge: Pick<Doc<'knowledge'>, 'title' | 'body'>[]
    now: number
    // The group chat's name, when the conversation is a group
    group?: string
    // The person texting is the owner, from the phone in Settings: help them directly, never hand off to them
    withOwner?: boolean
    // The reply goes out as a regular text message (Twilio), where long messages cost more and can fail to deliver
    sms?: boolean
    // The model writing the reply can search the web (OpenAI, Anthropic and Gemini models can; see runner/src/brain.ts)
    canSearch?: boolean
    // Owner chats get tools to set reminders and watches (see runner/src/tools.ts)
    canSchedule?: boolean
    // Owner chats get use_computer when this engine runs on their Windows or Mac computer (see runner/src/computer/tasks.ts)
    canUseComputer?: boolean
    // The computer task already running, shortened, so the agent says it's in progress instead of starting another
    computerBusy?: string
    // A computer task is running from another of the owner's chats
    computerBusyElsewhere?: boolean
    // What's stopping computer use on this engine right now (a Mac permission), so the agent can say so if asked
    computerProblem?: string
}) {
    const { agent, workspace, contact, knowledge, now, group, withOwner, sms, canSearch, canSchedule, canUseComputer, computerBusy, computerBusyElsewhere, computerProblem } = args
    const owner = workspace?.ownerName ?? 'the owner'
    const timeZone = workspace?.timezone ?? 'UTC'
    let date: string
    let zone = timeZone
    try {
        date = new Date(now).toLocaleString('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' })
        zone = `${timeZone}, ${utcOffset(now, timeZone)}`
    } catch {
        date = new Date(now).toUTCString()
    }
    const language = agent.language && agent.language !== 'multi' ? LANGUAGE_NAMES[agent.language] : undefined

    const lines = [
        `You are ${agent.name}, ${agent.role ? `${owner}'s ${agent.role.toLowerCase()}` : `an assistant for ${owner}`}. You talk with people over iMessage.`,
        agent.prompt.trim() && `How you work:\n${agent.prompt.trim()}`,
        withOwner
            ? `You're texting ${owner}, the person you work for. Help them directly, like a capable personal assistant.`
            : group
            ? `You're in a group chat (${group}). Each message starts with who sent it. Reply to the group, briefly, and only about what you were asked.`
            : `You're texting ${contact.name} (${contact.handle}).${contact.tags.length ? ` Tags: ${contact.tags.join(', ')}.` : ''}${contact.notes.trim() ? ` Notes from ${owner}: ${contact.notes.trim()}` : ''}`,
        knowledge.length && `What you know:\n${knowledge.map((k) => `## ${k.title}\n${k.body.trim()}`).join('\n\n')}`,
        `It is ${date} (${zone}).`,
        canSearch &&
            'You can search the web for current information such as weather, news, opening hours and prices. Use it when a question needs something current, and give the answer itself, not a list of links.',
        canSchedule &&
            `You have tools to set reminders, watch something for changes, and list or cancel what you've scheduled. Times are in ${timeZone}; give tools times as ISO 8601 with the UTC offset that applies on that date (it can differ from today's across daylight saving).`,
        withOwner &&
            canUseComputer &&
            "You can do tasks on their computer with use_computer (opening apps and websites, clicking, typing). It runs in the background: say you're on it, and it texts them when it's done or needs their YES. Only one task runs at a time.",
        withOwner && computerBusy && `You're already doing a task on their computer (“${computerBusy}”). Tell them it's in progress; they can text stop to cancel it.`,
        withOwner && computerProblem && `Computer use isn't available yet: ${computerProblem}`,
        withOwner && computerBusyElsewhere && "You're already doing a task on their computer from another chat; only one runs at a time.",
        `Write plain text only: no markdown, no lists with symbols, no signatures. ${LENGTHS[agent.replyLength ?? 'short']}`,
        sms && 'This goes out as a regular text message (SMS), so keep the whole reply under 300 characters.',
        language ? `Reply in ${language}.` : 'Reply in the language the person writes in.',
        withOwner
            ? 'If you can’t do something yet or aren’t sure, say so plainly. Never make up facts, prices or commitments.'
            : `If you can't help, aren't sure, or they ask for a person, say briefly that you'll check with ${owner}, then end your reply with ${HANDOFF}. Never make up facts, prices or commitments.`,
    ]
    return lines.filter(Boolean).join('\n\n')
}

// Conversation history as model turns: must open with the contact, and same-speaker runs are merged
export function toTurns(messages: PromptMessage[]): Turn[] {
    const turns: Turn[] = []
    for (const m of messages) {
        const role = m.from === 'contact' ? 'user' : 'assistant'
        if (!turns.length && role === 'assistant') continue
        const last = turns[turns.length - 1]
        if (last?.role === role) last.content += `\n${m.body}`
        else turns.push({ role, content: m.body })
    }
    return turns
}

// Splits the handoff marker off a model reply
export function parseReply(raw: string) {
    const handoff = raw.includes(HANDOFF)
    return { body: raw.replaceAll(HANDOFF, '').trim(), handoff }
}
