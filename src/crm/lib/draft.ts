import type { ReplyLength } from '@/lib/agent-options'

export type AgentStatus = 'draft' | 'live' | 'paused'

export type AgentFields = {
    name: string
    role: string
    avatar?: string
    hue: number
    prompt: string
    status: AgentStatus
    folder?: string
    model?: string
    language?: string
    temperature?: number
    replyLength?: ReplyLength
    // Per-slot model overrides (slot id → model id)
    models?: Record<string, string>
}

export const AVATARS = [
    '/avatars/tofu.png',
    '/avatars/lulu.png',
    '/avatars/rishi.png',
    ...['pip', 'mochi', 'biscuit', 'pebble', 'penny', 'waffles', 'honey', 'sprout'].map((n) => `/avatars/${n}.webp`),
]

export const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export const blankAgent = (name: string, role: string): AgentFields => ({
    name,
    role: role || 'Assistant',
    hue: hueFor(name),
    prompt: '',
    status: 'draft',
})

// Picks just the editable fields. Fields the engine doesn't use (an old greeting or voice) aren't among them, so
// saving an agent clears them. Model overrides are key-sorted so two copies compare equal whatever order
// the slots were set in.
export const pickAgentFields = ({ name, role, avatar, hue, prompt, status, folder, model, language, temperature, replyLength, models }: AgentFields): AgentFields => ({
    name,
    role,
    avatar,
    hue,
    prompt,
    status,
    folder,
    model,
    language,
    temperature,
    replyLength,
    models: models && Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b))),
})
