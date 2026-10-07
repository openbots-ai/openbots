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
}

export const AVATARS = ['ava', 'emily', 'jason', 'kai', 'leo', 'marcus', 'nora', 'sam'].map((n) => `/avatars/${n}.webp`)

export const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export const blankAgent = (name: string, role: string): AgentFields => ({
    name,
    role: role || 'Assistant',
    hue: hueFor(name),
    prompt: '',
    greeting: `hey, it's ${name.toLowerCase()}. what can I help with?`,
    status: 'draft',
})

export const pickAgentFields = ({ name, role, avatar, hue, prompt, greeting, status, folder }: AgentFields): AgentFields => ({ name, role, avatar, hue, prompt, greeting, status, folder })
