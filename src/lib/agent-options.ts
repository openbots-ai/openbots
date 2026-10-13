// Model, voice and language choices for an agent, shared by the CRM editor and the landing demo
import { AI_PROVIDERS, BRAIN_MODELS, modelLabel, parseModel, PROVIDER_NAMES, type ModelOption, type Provider } from '@convex/lib/models'

export type { Provider }

export type ReplyLength = 'short' | 'medium' | 'long'

// The Brain slot's models double as the model picker in the agent's config bar
export const MODELS = BRAIN_MODELS

// Voices are used for voice notes; pitch and rate shape the browser's speech preview
export const VOICES: { id: string; name: string; accent: string; hue: number; pitch: number; rate: number }[] = [
    { id: 'susan', name: 'Susan', accent: 'American', hue: 24, pitch: 1.1, rate: 1 },
    { id: 'nia', name: 'Nia', accent: 'American', hue: 300, pitch: 1.25, rate: 1.05 },
    { id: 'theo', name: 'Theo', accent: 'British', hue: 210, pitch: 0.85, rate: 0.95 },
    { id: 'grace', name: 'Grace', accent: 'Australian', hue: 150, pitch: 1, rate: 1 },
    { id: 'omar', name: 'Omar', accent: 'American', hue: 36, pitch: 0.75, rate: 0.95 },
    { id: 'mei', name: 'Mei', accent: 'Canadian', hue: 340, pitch: 1.3, rate: 1.1 },
]

export const LANGUAGES: { id: string; label: string; region?: string; flag: string }[] = [
    { id: 'en-US', label: 'English', region: 'US', flag: '🇺🇸' },
    { id: 'en-GB', label: 'English', region: 'UK', flag: '🇬🇧' },
    { id: 'es-ES', label: 'Spanish', flag: '🇪🇸' },
    { id: 'fr-FR', label: 'French', flag: '🇫🇷' },
    { id: 'de-DE', label: 'German', flag: '🇩🇪' },
    { id: 'pt-BR', label: 'Portuguese', region: 'BR', flag: '🇧🇷' },
    { id: 'it-IT', label: 'Italian', flag: '🇮🇹' },
    { id: 'hi-IN', label: 'Hindi', flag: '🇮🇳' },
    { id: 'ja-JP', label: 'Japanese', flag: '🇯🇵' },
    { id: 'multi', label: 'Multilingual', flag: '🌐' },
]

export const REPLY_LENGTHS: { id: ReplyLength; label: string }[] = [
    { id: 'short', label: 'Short' },
    { id: 'medium', label: 'Medium' },
    { id: 'long', label: 'Long' },
]

export const DEFAULT_CONFIG = { model: 'gpt-5.1', voice: 'susan', language: 'en-US', temperature: 0.7, replyLength: 'short' as ReplyLength }

// Unknown ids (e.g. a model that was retired) fall back to the first option rather than breaking the UI
export const modelOf = (id?: string) => MODELS.find((m) => m.id === id) ?? MODELS[0]
export const voiceOf = (id?: string) => VOICES.find((v) => v.id === id) ?? VOICES[0]
export const languageOf = (id?: string) => LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0]

// Model options grouped under their provider's name, in the pickers' provider order; options with no provider
// (None) come last, ungrouped
export function groupOptions(options: ModelOption[]) {
    const groups = AI_PROVIDERS.map((p) => ({ label: p === 'local' ? 'Local models' : PROVIDER_NAMES[p], options: options.filter((o) => o.provider === p) })).filter((g) => g.options.length)
    const rest = options.filter((o) => !(AI_PROVIDERS as readonly string[]).includes(o.provider))
    return rest.length ? [...groups, { label: '', options: rest }] : groups
}

// The option for a "provider:model" id when a list doesn't have it (a saved choice the keys no longer offer)
export const optionFromId = (id: string): ModelOption | undefined => {
    const parsed = parseModel(id)
    return parsed ? { id: `${parsed.provider}:${parsed.model}`, label: modelLabel(id), provider: parsed.provider, api: parsed.model } : undefined
}
