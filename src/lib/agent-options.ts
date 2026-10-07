// Model, voice and language choices for an agent, shared by the CRM editor and the landing demo

export type Provider = 'openai' | 'anthropic' | 'google'
export type ReplyLength = 'short' | 'medium' | 'long'

// Prices are US$ per million tokens (input, output). PLACEHOLDERS for usage estimates: check each
// provider's current pricing before showing these to customers or billing on them.
export const MODELS: { id: string; label: string; provider: Provider; price: { input: number; output: number } }[] = [
    { id: 'gpt-5.1', label: 'GPT 5.1', provider: 'openai', price: { input: 1.25, output: 10 } },
    { id: 'gpt-5.1-mini', label: 'GPT 5.1 mini', provider: 'openai', price: { input: 0.25, output: 2 } },
    { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5', provider: 'anthropic', price: { input: 3, output: 15 } },
    { id: 'claude-haiku-4.5', label: 'Claude Haiku 4.5', provider: 'anthropic', price: { input: 1, output: 5 } },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', price: { input: 0.3, output: 2.5 } },
]

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

// Estimated spend for a token count on a model
export const costOf = (model: string | undefined, input: number, output: number) => {
    const { price } = modelOf(model)
    return (input * price.input + output * price.output) / 1_000_000
}

// Monthly allowances on the Personal plan, shown as usage meters. Placeholders until pricing is set.
export const PLAN_LIMITS = { messages: 2_000, tokens: 1_000_000, agents: 10 }
