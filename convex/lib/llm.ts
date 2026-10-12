import Anthropic from '@anthropic-ai/sdk'
import type { ModelOption, Provider } from './models'

export type Turn = { role: 'user' | 'assistant'; content: string }
export type Prompt = { system: string; turns: Turn[]; temperature?: number; maxTokens: number }

// The model providers that write replies; each workspace connects its own key for them
export const TEXT_PROVIDERS = ['openai', 'anthropic', 'google', 'xai'] as const
export type TextProvider = (typeof TEXT_PROVIDERS)[number]
export const isTextProvider = (p: Provider): p is TextProvider => (TEXT_PROVIDERS as readonly string[]).includes(p)

export const PROVIDER_NAMES: Record<TextProvider, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google Gemini', xai: 'xAI' }

// A failure worth showing the operator as-is ("connect your OpenAI key")
export class ReplyError extends Error {}

// Claude 5.x models reject sampling parameters and take effort instead
const CLAUDE_5 = new Set(['claude-sonnet-5-5'])

async function anthropic(model: string, key: string, p: Prompt) {
    const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 })
    const modern = CLAUDE_5.has(model)
    const res = await client.beta.messages.create({
        model,
        max_tokens: p.maxTokens,
        system: p.system,
        messages: p.turns,
        ...(modern
            ? // Short chat replies: low effort; on a safety decline the API re-runs the request on a fallback model
              { output_config: { effort: 'low' as const }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : { temperature: p.temperature }),
    })
    if (res.stop_reason === 'refusal') throw new ReplyError('The model declined to answer this one')
    return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

// OpenAI and xAI share the chat completions shape
async function chatCompletions(url: string, model: string, key: string, p: Prompt) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: p.system }, ...p.turns], max_completion_tokens: p.maxTokens }),
    })
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
    return data?.choices?.[0]?.message?.content ?? ''
}

async function gemini(model: string, key: string, p: Prompt) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: p.system }] },
            contents: p.turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
            generationConfig: { temperature: p.temperature, maxOutputTokens: p.maxTokens },
        }),
    })
    const data = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null
    if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`)
    return (data?.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('')
}

// Writes one reply with the given model, using the workspace's own key for its provider (undefined when not connected).
// Throws ReplyError for problems the operator should fix.
export async function complete(option: ModelOption, p: Prompt, key: string | undefined): Promise<string> {
    if (!isTextProvider(option.provider) || !option.api) throw new ReplyError(`${option.label} can't write replies`)
    if (!key) throw new ReplyError(`Connect your ${PROVIDER_NAMES[option.provider]} key in Connections so ${option.label} can reply`)
    let text: string
    switch (option.provider) {
        case 'anthropic':
            text = await anthropic(option.api, key, p)
            break
        case 'openai':
            text = await chatCompletions('https://api.openai.com/v1/chat/completions', option.api, key, p)
            break
        case 'xai':
            text = await chatCompletions('https://api.x.ai/v1/chat/completions', option.api, key, p)
            break
        default:
            text = await gemini(option.api, key, p)
    }
    if (!text.trim()) throw new Error('The model sent back an empty reply')
    return text.trim()
}
