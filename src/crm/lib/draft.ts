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

const NAMES = ['Iris', 'Milo', 'June', 'Otis', 'Pia', 'Rex', 'Tess', 'Wren', 'Arlo', 'Nell']

const ROLES: [RegExp, string][] = [
    [/invoice|bill|pay|financ|expense|book ?keep/i, 'Finance'],
    [/sale|lead|crm|pipeline|deal|prospect/i, 'Sales'],
    [/schedul|calendar|meeting|book/i, 'Scheduling'],
    [/support|customer|help ?desk|ticket/i, 'Support'],
    [/research|brief|news|find out|digest/i, 'Research'],
    [/writ|copy|caption|post|email|newsletter/i, 'Writing'],
    [/fitness|workout|gym|health|coach/i, 'Coach'],
]

export const hueFor = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export const blankAgent = (name: string, role: string): AgentFields => ({
    name,
    role: role || 'Assistant',
    hue: hueFor(name),
    prompt: '',
    greeting: `hey, it's ${name.toLowerCase()}. what can I help with?`,
    status: 'draft',
})

// No LLM: pull a name if one was given, guess a role from keywords, keep the text as the prompt
export function draftFromPrompt(text: string): AgentFields | null {
    const prompt = text.trim()
    if (!prompt) return null
    const named = prompt.match(/\b(?:named|called)\s+([a-z][a-z'-]*)/i)?.[1]
    const name = named ? named[0].toUpperCase() + named.slice(1).toLowerCase() : NAMES[hueFor(prompt) % NAMES.length]
    const role = ROLES.find(([re]) => re.test(prompt))?.[1] ?? 'Assistant'
    return { ...blankAgent(name, role), prompt }
}

export const pickAgentFields = ({ name, role, avatar, hue, prompt, greeting, status, folder }: AgentFields): AgentFields => ({ name, role, avatar, hue, prompt, greeting, status, folder })
