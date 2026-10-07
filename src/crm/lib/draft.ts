import type { ReplyLength } from '@/lib/agent-options'

export type AgentStatus = 'draft' | 'live' | 'paused'

export type AgentFields = {
    name: string
    role: string
    avatar?: string
    hue: number
    prompt: string
    greeting: string
    status: AgentStatus
    folder?: string
    model?: string
    voice?: string
    language?: string
    temperature?: number
    replyLength?: ReplyLength
    // Per-slot model overrides (slot id → model id)
    models?: Record<string, string>
}

export const AVATARS = ['pip', 'mochi', 'biscuit', 'pebble', 'penny', 'waffles', 'honey', 'sprout'].map((n) => `/avatars/${n}.webp`)

export const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export const blankAgent = (name: string, role: string): AgentFields => ({
    name,
    role: role || 'Assistant',
    hue: hueFor(name),
    prompt: '',
    greeting: `hey, it's ${name.toLowerCase()}. what can I help with?`,
    status: 'draft',
})

// Picks just the editable fields. Model overrides are key-sorted so two copies compare equal whatever order
// the slots were set in.
export const pickAgentFields = ({ name, role, avatar, hue, prompt, greeting, status, folder, model, voice, language, temperature, replyLength, models }: AgentFields): AgentFields => ({
    name,
    role,
    avatar,
    hue,
    prompt,
    greeting,
    status,
    folder,
    model,
    voice,
    language,
    temperature,
    replyLength,
    models: models && Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b))),
})
