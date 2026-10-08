import Anthropic from '@anthropic-ai/sdk'
import { env } from '../_generated/server'
import { demoReply } from './demo'
import type { ModelOption, Provider } from './models'

export type Turn = { role: 'user' | 'assistant'; content: string }
export type Prompt = { system: string; turns: Turn[]; temperature?: number; maxTokens: number }

// The env var that unlocks each provider that writes text
export const PROVIDER_KEYS: Partial<Record<Provider, 'ANTHROPIC_API_KEY' | 'OPENAI_API_KEY' | 'GEMINI_API_KEY' | 'XAI_API_KEY'>> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GEMINI_API_KEY',
    xai: 'XAI_API_KEY',
}

export const keyFor = (provider: Provider) => {
    const name = PROVIDER_KEYS[provider]
    return name ? env[name] || undefined : undefined
}

// Demo deployments answer with sample replies when a provider has no key (see convex.config.ts)
export const demoMode = () => env.DEMO_MODE === 'true'

// A failure worth showing the operator as-is ("OPENAI_API_KEY isn't set")
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

// Writes one reply with the given model. Throws ReplyError for problems the operator should fix.
export async function complete(option: ModelOption, p: Prompt): Promise<string> {
    const keyName = PROVIDER_KEYS[option.provider]
    if (!keyName || !option.api) throw new ReplyError(`${option.label} can't write replies`)
    const key = keyFor(option.provider)
    if (!key) {
        if (demoMode()) return demoReply(p.turns.at(-1)?.content ?? '')
        throw new ReplyError(`${keyName} isn't set on the Convex deployment, so ${option.label} can't reply`)
    }
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
