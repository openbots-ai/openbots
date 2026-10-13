import Anthropic from '@anthropic-ai/sdk'
import type { KeyModel } from '../../convex/lib/models'
import type { Brains, CloudProvider } from './brain'

// Asks each AI provider which models this agent's key can use, so the dashboard offers exactly those. Only model
// ids and names leave the agent; the keys never do.

const CAP = 80

// Not chat models, so never offered for Brain or Backup
const NOT_CHAT = /audio|realtime|tts|transcribe|image|dall-e|embedding|moderation|search|instruct|whisper|live|computer-use|codex|babbage|davinci|aqa|veo|imagen|lyria|robotics/i

// A problem with the key the owner can fix ("OpenAI rejected this key"); shown in Connections as-is
export class KeyError extends Error {}

type Found = { id: string; label: string; created?: number }

async function getJson(url: string, headers: Record<string, string>, who: string) {
    let res: Response
    try {
        res = await fetch(url, { headers })
    } catch (e) {
        throw new KeyError(`Couldn't reach ${who}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (res.status === 401 || res.status === 403) throw new KeyError(`${who} rejected this key`)
    if (!res.ok) throw new KeyError(`${who} answered ${res.status}`)
    return (await res.json()) as Record<string, unknown>
}

// Newest first where the provider says when a model was made, keeping the provider's order otherwise; capped
const tidy = (found: Found[]) => {
    const seen = new Set<string>()
    return found
        .filter((m) => !NOT_CHAT.test(m.id) && !seen.has(m.id) && seen.add(m.id))
        .map((m, i) => ({ ...m, i }))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || a.i - b.i)
        .slice(0, CAP)
        .map(({ id, label }) => ({ id, label }))
}

// OpenAI-style GET /models: OpenAI itself, xAI and local model servers
async function openAiStyle(url: string, key: string, who: string, keep: RegExp) {
    const data = await getJson(url, { Authorization: `Bearer ${key}` }, who)
    const rows = (data.data as { id?: string; created?: number }[] | undefined) ?? []
    return tidy(rows.filter((m): m is { id: string; created?: number } => typeof m.id === 'string' && keep.test(m.id)).map((m) => ({ id: m.id, label: m.id, created: m.created })))
}

export async function listModels(provider: CloudProvider | 'local', key: string, localUrl?: string): Promise<{ id: string; label: string }[]> {
    switch (provider) {
        case 'openai':
            return openAiStyle('https://api.openai.com/v1/models', key, 'OpenAI', /^(gpt-|o\d|chatgpt-)/)
        case 'xai':
            return openAiStyle('https://api.x.ai/v1/models', key, 'xAI', /^grok/)
        case 'local':
            return openAiStyle(`${localUrl!.replace(/\/+$/, '')}/models`, key, 'your local model server', /./)
        case 'anthropic': {
            const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20_000 })
            const found: Found[] = []
            try {
                for await (const m of client.models.list({ limit: 100 })) found.push({ id: m.id, label: m.display_name || m.id, created: Date.parse(m.created_at) || undefined })
            } catch (e) {
                if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new KeyError('Anthropic rejected this key')
                if (e instanceof Anthropic.APIError) throw new KeyError(`Anthropic answered ${e.status}`)
                throw new KeyError(`Couldn't reach Anthropic: ${e instanceof Error ? e.message : String(e)}`)
            }
            return tidy(found)
        }
        case 'google': {
            const data = await getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': key }, 'Google')
            const rows = (data.models as { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[] | undefined) ?? []
            return tidy(
                rows
                    .map((m) => ({ id: (m.name ?? '').replace(/^models\//, ''), label: m.displayName || '', methods: m.supportedGenerationMethods ?? [] }))
                    .filter((m) => m.id.startsWith('gemini') && m.methods.includes('generateContent'))
                    .map((m) => ({ id: m.id, label: m.label || m.id })),
            )
        }
    }
}

// Every AI key the agent has, checked: the models each can use, or why it couldn't be checked
export async function checkKeys(brains: Brains): Promise<{ models: KeyModel[]; results: { provider: CloudProvider | 'local'; error?: string; count: number }[] }> {
    const jobs: [CloudProvider | 'local', string][] = Object.entries(brains.keys).map(([p, k]) => [p as CloudProvider, k!])
    if (brains.local) jobs.push(['local', brains.local.key ?? 'local'])
    const settled = await Promise.all(
        jobs.map(async ([provider, key]) => {
            try {
                const found = await listModels(provider, key, brains.local?.url)
                if (!found.length) return { provider, models: [], error: "This key can't use any chat models" }
                return { provider, models: found.map((m) => ({ provider, ...m })) }
            } catch (e) {
                return { provider, models: [], error: e instanceof KeyError ? e.message : `Couldn't list models: ${e instanceof Error ? e.message : String(e)}` }
            }
        }),
    )
    return { models: settled.flatMap((s) => s.models), results: settled.map((s) => ({ provider: s.provider, error: s.error, count: s.models.length })) }
}
