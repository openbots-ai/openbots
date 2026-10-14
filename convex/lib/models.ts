// Every part of an agent ("slot") can run on a different model. This is the single list of slots and the
// models offered for each, shared by the backend (to validate choices), the engine and the UI.
// Brain and Backup offer the models your own AI keys can use, as your engine reports them; a choice is stored as
// "provider:model", e.g. "openai:gpt-5.1". The fixed lists below are what the landing page shows.

// 'local' is any OpenAI-compatible server the engine can reach (Ollama, LM Studio, vLLM…), so nothing leaves your machines
export type Provider = 'openai' | 'anthropic' | 'google' | 'xai' | 'local' | 'elevenlabs' | 'deepgram' | 'cartesia' | 'typesafe' | 'none'

// `api` is the provider's own model name, for the slots that call a provider (Brain, Backup and Computer use)
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
    // Offers the models your keys can use (see keyModels) instead of `options`, which is then only a showcase
    fromKeys?: boolean
}

export const BRAIN_MODELS: ModelOption[] = [
    { id: 'gpt-5.1', label: 'GPT 5.1', provider: 'openai', api: 'gpt-5.1' },
    { id: 'gpt-5.1-mini', label: 'GPT 5.1 mini', provider: 'openai', api: 'gpt-5.1-mini' },
    { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5', provider: 'anthropic', api: 'claude-sonnet-5-5' },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'anthropic', api: 'claude-haiku-4-5' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', api: 'gemini-2.5-flash' },
    { id: 'grok-4', label: 'Grok 4', provider: 'xai', api: 'grok-4' },
]

const brain = (...ids: string[]) => BRAIN_MODELS.filter((m) => ids.includes(m.id))

export const SAME_AS_BRAIN = 'same-as-brain'
export const NONE = 'none'
// Picker value meaning "no override, use the workspace's choice"
export const INHERIT = 'inherit'

export const SLOTS: Slot[] = [
    { id: 'brain', label: 'Brain', blurb: 'Reads your texts, plans the work and writes the replies.', options: BRAIN_MODELS, default: 'gpt-5.1', runs: true, fromKeys: true },
    {
        id: 'computer',
        label: 'Computer use',
        blurb: 'Does tasks on your Windows or Mac computer: looks at the screen, clicks and types.',
        options: [
            { id: 'claude-sonnet-5.5-computer-use', label: 'Claude Sonnet 5.5', provider: 'anthropic', api: 'claude-sonnet-5-5' },
            { id: 'claude-opus-5.5-computer-use', label: 'Claude Opus 5.5', provider: 'anthropic', api: 'claude-opus-5-5' },
        ],
        default: 'claude-sonnet-5.5-computer-use',
        runs: true,
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
        options: [...brain('claude-sonnet-5.5', 'gpt-5.1', 'gemini-2.5-flash'), { id: NONE, label: 'None', provider: 'none' }],
        default: 'claude-sonnet-5.5',
        runs: true,
        fromKeys: true,
    },
]

export const slotOf = (id: string) => SLOTS.find((s) => s.id === id)

// The slots agents use today; the dashboard only offers these, so nothing it shows is just for show
export const LIVE_SLOTS = SLOTS.filter((s) => s.runs)

// The providers that write replies, in the order the pickers group them. 'local' is the engine's own model server.
export const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'xai', 'local'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export const PROVIDER_NAMES: Record<AiProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', xai: 'xAI', local: 'local model' }
const isAiProvider = (p: string): p is AiProvider => (AI_PROVIDERS as readonly string[]).includes(p)

// A model a key can use, as the engine reports it (see convex/runner.ts)
export type KeyModel = { provider: string; id: string; label: string }

const NO_KEY: ModelOption = { id: NONE, label: 'Connect an AI key', provider: 'none' }
const NO_BACKUP: ModelOption = { id: NONE, label: 'None', provider: 'none' }

// "openai:gpt-5.1" → { provider, model }. Older choices saved as a catalog id ("gpt-5.1") still read.
export function parseModel(id: string): { provider: AiProvider; model: string } | null {
    const at = id.indexOf(':')
    if (at > 0) {
        const provider = id.slice(0, at)
        const model = id.slice(at + 1)
        return isAiProvider(provider) && /^[\w.\-/:@]{1,128}$/.test(model) ? { provider, model } : null
    }
    const known = BRAIN_MODELS.find((m) => m.id === id)
    return known?.api && isAiProvider(known.provider) ? { provider: known.provider, model: known.api } : null
}

// The stored form of a choice, so a catalog id and its "provider:model" twin compare equal
const normalize = (id: string) => {
    const parsed = parseModel(id)
    return parsed ? `${parsed.provider}:${parsed.model}` : id
}

// A readable name for a choice: the catalog's label for well-known models, else the provider's model name
export function modelLabel(id: string) {
    const parsed = parseModel(id)
    if (!parsed) return id
    return BRAIN_MODELS.find((m) => m.provider === parsed.provider && m.api === parsed.model)?.label ?? parsed.model
}

// What the keys can use, as picker options: grouped by provider, each provider in its own (newest first) order
export function keyModels(models: KeyModel[]): ModelOption[] {
    const seen = new Set<string>()
    return AI_PROVIDERS.flatMap((provider) =>
        models
            .filter((m) => m.provider === provider)
            .flatMap((m) => {
                const id = `${provider}:${m.id}`
                if (seen.has(id)) return []
                seen.add(id)
                return [{ id, label: m.label || m.id, provider, api: m.id }]
            }),
    )
}

// The options a slot offers: your keys' models for Brain and Backup (Backup can also be off), else its fixed list
export function slotOptions(slot: Slot, available: ModelOption[]) {
    if (!slot.fromKeys) return slot.options
    return slot.id === 'backup' ? [...available, NO_BACKUP] : available
}

export const isValidChoice = (slot: string, model: string) => {
    const s = slotOf(slot)
    if (!s) return false
    if (s.fromKeys) return (s.id === 'backup' && model === NONE) || parseModel(model) !== null
    return s.options.some((o) => o.id === model)
}

// The option for a saved choice: the key's own entry when it still offers it, else one built from the id
function optionFor(id: string, available: ModelOption[]): ModelOption {
    if (id === NONE) return NO_BACKUP
    const key = normalize(id)
    const offered = available.find((o) => o.id === key)
    if (offered) return offered
    const parsed = parseModel(id)!
    return { id: key, label: modelLabel(id), provider: parsed.provider, api: parsed.model }
}

// The first well-known model the keys offer, else the first they offer at all
const firstOf = (offered: ModelOption[]) => BRAIN_MODELS.map((m) => offered.find((o) => o.provider === m.provider && o.api === m.api)).find(Boolean) ?? offered[0]

export type ModelChoices = Partial<Record<string, string>>

// The model an agent actually uses for each slot: its own override, else the workspace's choice, else a default.
// `legacyBrain` is the single `model` field agents had before slots existed. Pass `available` (keyModels of the
// workspace's keys) for real agents: Brain then defaults to a model the keys offer, and Backup to one from another
// provider. Without it (the landing page), the fixed lists are used.
export function resolveModels(workspace: ModelChoices | undefined, agent: ModelChoices | undefined, legacyBrain?: string, available?: ModelOption[]) {
    const pick = (slot: Slot, fallback?: () => ModelOption) => {
        const own = agent?.[slot.id] ?? (slot.id === 'brain' ? legacyBrain : undefined)
        if (available && slot.fromKeys) {
            const id = [own, workspace?.[slot.id]].find((m) => m !== undefined && isValidChoice(slot.id, m))
            return { slot, option: id !== undefined ? optionFor(id, available) : fallback!(), overridden: own !== undefined && own === id }
        }
        const id = [own, workspace?.[slot.id], slot.default].find((m) => m !== undefined && isValidChoice(slot.id, m)) ?? slot.default
        return { slot, option: slot.options.find((o) => o.id === id) ?? optionFor(id, []), overridden: own !== undefined && own === id }
    }
    const brain = pick(slotOf('brain')!, () => firstOf(available ?? []) ?? NO_KEY)
    const resolved = Object.fromEntries(
        SLOTS.map((s) => [s.id, s.id === 'brain' ? brain : pick(s, () => firstOf((available ?? []).filter((o) => o.provider !== brain.option.provider)) ?? NO_BACKUP)]),
    ) as Record<SlotId, ReturnType<typeof pick>>
    // "Same as Brain" shows the brain's model, so the grid reads as real models
    if (resolved.vision.option.id === SAME_AS_BRAIN) resolved.vision = { ...resolved.vision, option: { ...resolved.brain.option } }
    return resolved
}
