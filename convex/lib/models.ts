// Every part of an agent ("slot") can run on a different model. This is the single list of slots and the
// models offered for each, shared by the backend (to validate choices) and the UI (to show them).
// Model names are display labels for the picker; your agent (runner/) is what calls the providers.

// 'local' is any OpenAI-compatible server the agent can reach (Ollama, LM Studio, vLLM…), so nothing leaves your machines
export type Provider = 'openai' | 'anthropic' | 'google' | 'xai' | 'local' | 'elevenlabs' | 'deepgram' | 'cartesia' | 'typesafe' | 'none'

// `api` is the provider's own model name, for the slots that call a provider (Brain and Backup today)
export type ModelOption = { id: string; label: string; provider: Provider; api?: string }

export type SlotId = 'brain' | 'computer' | 'voice' | 'listening' | 'calls' | 'vision' | 'decisions' | 'router' | 'backup'

export type Slot = {
    id: SlotId
    label: string
    // What the slot does, in one line, for the cards and tooltips
    blurb: string
    options: ModelOption[]
    default: string
    // Shown as a "New" badge
    isNew?: boolean
    // True for the slots the reply pipeline uses today; the others are saved choices that don't run yet
    runs?: boolean
}

export const BRAIN_MODELS: ModelOption[] = [
    { id: 'gpt-5.1', label: 'GPT 5.1', provider: 'openai', api: 'gpt-5.1' },
    { id: 'gpt-5.1-mini', label: 'GPT 5.1 mini', provider: 'openai', api: 'gpt-5.1-mini' },
    { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5', provider: 'anthropic', api: 'claude-sonnet-5-5' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'anthropic', api: 'claude-haiku-4-5' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', api: 'gemini-2.5-flash' },
    { id: 'grok-4', label: 'Grok 4', provider: 'xai', api: 'grok-4' },
    // The agent's OPENBOTS_LOCAL_MODEL decides which model this is
    { id: 'local', label: 'Local model', provider: 'local', api: 'local' },
]

const brain = (...ids: string[]) => BRAIN_MODELS.filter((m) => ids.includes(m.id))

export const SAME_AS_BRAIN = 'same-as-brain'
export const NONE = 'none'
// Picker value meaning "no override, use the workspace's choice"
export const INHERIT = 'inherit'

export const SLOTS: Slot[] = [
    { id: 'brain', label: 'Brain', blurb: 'Reads your texts, plans the work and writes the replies.', options: BRAIN_MODELS, default: 'gpt-5.1', runs: true },
    {
        id: 'computer',
        label: 'Computer use',
        blurb: 'Drives the agent’s own computer: clicks, types and logs into your apps.',
        options: [
            { id: 'gpt-5.1-computer-use', label: 'GPT 5.1 Computer Use', provider: 'openai' },
            { id: 'claude-sonnet-5.5-computer-use', label: 'Claude Computer Use', provider: 'anthropic' },
            { id: 'gemini-2.5-computer-use', label: 'Gemini Computer Use', provider: 'google' },
        ],
        default: 'gpt-5.1-computer-use',
    },
    {
        id: 'voice',
        label: 'Voice notes',
        blurb: 'Speaks the voice notes your agent sends you.',
        options: [
            { id: 'elevenlabs', label: 'ElevenLabs', provider: 'elevenlabs' },
            { id: 'openai-tts', label: 'OpenAI TTS', provider: 'openai' },
            { id: 'cartesia-sonic', label: 'Cartesia Sonic', provider: 'cartesia' },
        ],
        default: 'elevenlabs',
    },
    {
        id: 'listening',
        label: 'Listening',
        blurb: 'Understands the voice notes you send.',
        options: [
            { id: 'deepgram-nova', label: 'Deepgram Nova', provider: 'deepgram' },
            { id: 'whisper', label: 'OpenAI Whisper', provider: 'openai' },
        ],
        default: 'deepgram-nova',
    },
    {
        id: 'calls',
        label: 'Calls',
        blurb: 'Talks live when your agent calls you.',
        options: [
            { id: 'gpt-realtime', label: 'GPT Realtime', provider: 'openai' },
            { id: 'gemini-live', label: 'Gemini Live', provider: 'google' },
        ],
        default: 'gpt-realtime',
    },
    {
        id: 'vision',
        label: 'Vision',
        blurb: 'Reads the photos and screenshots you text it.',
        options: [{ id: SAME_AS_BRAIN, label: 'Same as Brain', provider: 'none' }, ...brain('gpt-5.1', 'claude-sonnet-5.5', 'gemini-2.5-flash')],
        default: SAME_AS_BRAIN,
    },
    {
        id: 'decisions',
        label: 'Decisions',
        blurb: 'Quick calls with a confidence score: urgent? which agent? needs your yes?',
        options: [{ id: 'jev', label: 'Jev', provider: 'typesafe' }, ...brain('gpt-5.1-mini', 'claude-haiku-4.5')],
        default: 'jev',
        isNew: true,
    },
    {
        id: 'router',
        label: 'Router',
        blurb: 'Picks which of your models handles each task.',
        options: [
            { id: 'jev-router', label: 'Jev Router', provider: 'typesafe' },
            { id: NONE, label: 'Off', provider: 'none' },
        ],
        default: 'jev-router',
        isNew: true,
    },
    {
        id: 'backup',
        label: 'Backup',
        blurb: 'Takes over if a provider is down, so your agent never goes quiet.',
        options: [...brain('claude-sonnet-5.5', 'gpt-5.1', 'gemini-2.5-flash', 'local'), { id: NONE, label: 'None', provider: 'none' }],
        default: 'claude-sonnet-5.5',
        runs: true,
    },
]

export const slotOf = (id: string) => SLOTS.find((s) => s.id === id)

export const isValidChoice = (slot: string, model: string) => !!slotOf(slot)?.options.some((o) => o.id === model)

export type ModelChoices = Partial<Record<string, string>>

// The model an agent actually uses for each slot: its own override, else the workspace's choice, else the
// slot's default. `legacyBrain` is the single `model` field agents had before slots existed.
export function resolveModels(workspace: ModelChoices | undefined, agent: ModelChoices | undefined, legacyBrain?: string) {
    const pick = (slot: Slot) => {
        const own = agent?.[slot.id] ?? (slot.id === 'brain' ? legacyBrain : undefined)
        const id = [own, workspace?.[slot.id], slot.default].find((m) => m !== undefined && isValidChoice(slot.id, m)) ?? slot.default
        return { slot, option: slot.options.find((o) => o.id === id)!, overridden: own !== undefined && own === id }
    }
    const resolved = Object.fromEntries(SLOTS.map((s) => [s.id, pick(s)])) as Record<SlotId, ReturnType<typeof pick>>
    // "Same as Brain" shows the brain's model, so the grid reads as real models
    if (resolved.vision.option.id === SAME_AS_BRAIN) resolved.vision = { ...resolved.vision, option: { ...resolved.brain.option } }
    return resolved
}
