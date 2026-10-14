import Anthropic from '@anthropic-ai/sdk'
import { PROVIDER_NAMES, type AiProvider, type ModelOption } from '../../convex/lib/models'
import type { Turn } from '../../convex/lib/prompt'
import { demoReply } from './demo'

export type Prompt = { system: string; turns: Turn[]; temperature?: number; maxTokens: number }

// The env var that unlocks each cloud provider that writes text. Keys are set here or saved in Connections for the whole account.
export const PROVIDER_KEYS = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GEMINI_API_KEY',
    xai: 'XAI_API_KEY',
} as const satisfies Partial<Record<AiProvider, string>>
export type CloudProvider = keyof typeof PROVIDER_KEYS

// What the engine was started with (see config.ts)
export type Brains = {
    keys: Partial<Record<CloudProvider, string>>
    // An OpenAI-compatible model server (Ollama, LM Studio, vLLM…), e.g. http://localhost:11434/v1
    local?: { url: string; key?: string }
    // Answer with sample replies when no AI key is set up, so a demo works without one
    demo: boolean
}

// A failure worth showing the owner as-is ("Add your OpenAI key in Connections or on your engine …")
export class ReplyError extends Error {}

// Claude 5 models (claude-sonnet-5-5, claude-opus-5-…) reject sampling parameters and take effort instead
const isClaude5 = (model: string) => /^claude-[a-z]+-5/.test(model)

async function anthropic(model: string, key: string, p: Prompt) {
    const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 })
    const res = await client.beta.messages.create({
        model,
        max_tokens: p.maxTokens,
        system: p.system,
        messages: p.turns,
        ...(isClaude5(model)
            ? // Short chat replies: low effort; on a safety decline the API re-runs the request on a fallback model
              { output_config: { effort: 'low' as const }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : { temperature: p.temperature }),
    })
    if (res.stop_reason === 'refusal') throw new ReplyError('The model declined to answer this one')
    return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

// OpenAI, xAI and local model servers share the chat completions shape
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

// Writes one reply with the given model and this agent's own key for it. Throws ReplyError for problems the owner
// should fix.
export async function complete(brains: Brains, option: ModelOption, p: Prompt): Promise<string> {
    const demo = () => demoReply(p.turns.at(-1)?.content ?? '')
    if (option.provider === 'none') {
        if (brains.demo) return demo()
        throw new ReplyError('Add an AI key in Connections or on your engine, then pick a model on the Models page')
    }
    if (!option.api) throw new ReplyError(`${option.label} can't write replies`)
    let text: string
    if (option.provider === 'local') {
        if (!brains.local) throw new ReplyError(`Set OPENBOTS_LOCAL_URL in Connections or on your engine so ${option.label} can reply`)
        text = await chatCompletions(`${brains.local.url.replace(/\/+$/, '')}/chat/completions`, option.api, brains.local.key ?? 'local', p)
    } else {
        if (!(option.provider in PROVIDER_KEYS)) throw new ReplyError(`${option.label} can't write replies`)
        const provider = option.provider as CloudProvider
        const key = brains.keys[provider]
        if (!key) {
            if (brains.demo) return demo()
            throw new ReplyError(`Add your ${PROVIDER_NAMES[provider]} key in Connections or on your engine so ${option.label} can reply`)
        }
        if (provider === 'anthropic') text = await anthropic(option.api, key, p)
        else if (provider === 'openai') text = await chatCompletions('https://api.openai.com/v1/chat/completions', option.api, key, p)
        else if (provider === 'xai') text = await chatCompletions('https://api.x.ai/v1/chat/completions', option.api, key, p)
        else text = await gemini(option.api, key, p)
    }
    if (!text.trim()) throw new Error('The model sent back an empty reply')
    return text.trim()
}
