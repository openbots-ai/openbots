import type { Doc } from '../_generated/dataModel'

export type Turn = { role: 'user' | 'assistant'; content: string }
// The agent keeps contacts and messages on its own machine; these are the parts the prompt uses
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

export function systemPrompt(args: {
    agent: Doc<'agents'>
    workspace: Pick<Doc<'workspace'>, 'ownerName' | 'timezone'> | null
    contact: PromptContact
    knowledge: Pick<Doc<'knowledge'>, 'title' | 'body'>[]
    now: number
}) {
    const { agent, workspace, contact, knowledge, now } = args
    const owner = workspace?.ownerName ?? 'the owner'
    const timeZone = workspace?.timezone ?? 'UTC'
    let date: string
    try {
        date = new Date(now).toLocaleString('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' })
    } catch {
        date = new Date(now).toUTCString()
    }
    const language = agent.language && agent.language !== 'multi' ? LANGUAGE_NAMES[agent.language] : undefined

    const lines = [
        `You are ${agent.name}, ${agent.role ? `${owner}'s ${agent.role.toLowerCase()}` : `an assistant for ${owner}`}. You talk with people over iMessage.`,
        agent.prompt.trim() && `How you work:\n${agent.prompt.trim()}`,
        `You're texting ${contact.name} (${contact.handle}).${contact.tags.length ? ` Tags: ${contact.tags.join(', ')}.` : ''}${contact.notes.trim() ? ` Notes from ${owner}: ${contact.notes.trim()}` : ''}`,
        knowledge.length && `What you know:\n${knowledge.map((k) => `## ${k.title}\n${k.body.trim()}`).join('\n\n')}`,
        `It is ${date} (${timeZone}).`,
        `Write plain text only: no markdown, no lists with symbols, no signatures. ${LENGTHS[agent.replyLength ?? 'short']}`,
        language ? `Reply in ${language}.` : 'Reply in the language the person writes in.',
        `If you can't help, aren't sure, or they ask for a person, say briefly that you'll check with ${owner}, then end your reply with ${HANDOFF}. Never make up facts, prices or commitments.`,
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
