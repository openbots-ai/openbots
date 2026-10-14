// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelOption } from '../../convex/lib/models'
import { complete, plainCitations } from './brain'

const prompt = { system: 'Be brief.', turns: [{ role: 'user' as const, content: 'weather in Saskatoon tomorrow?' }], maxTokens: 1000 }
const brains = { keys: { openai: 'sk-1', google: 'g-1' }, demo: false }
const option = (provider: 'openai' | 'google', api: string): ModelOption => ({ id: api, label: api, provider, api })

// Records the request and answers with `body`
function fakeFetch(body: unknown) {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string) })
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('looking things up on the web', () => {
    it('asks OpenAI with web search on, and reads the answer from its message', async () => {
        const calls = fakeFetch({
            output: [
                { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'Saskatoon weather' } },
                { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Sunny, high of 12°C ([weather.gc.ca](https://weather.gc.ca/sk))', annotations: [] }] },
            ],
        })
        expect(await complete(brains, option('openai', 'gpt-5.1'), prompt)).toBe('Sunny, high of 12°C')
        expect(calls[0].url).toBe('https://api.openai.com/v1/responses')
        expect(calls[0].body).toMatchObject({ model: 'gpt-5.1', instructions: 'Be brief.', input: prompt.turns, tools: [{ type: 'web_search' }] })
    })

    it('asks Gemini with Google Search on', async () => {
        const calls = fakeFetch({ candidates: [{ content: { parts: [{ text: 'Cloudy, 8°C' }] } }] })
        expect(await complete(brains, option('google', 'gemini-2.5-flash'), prompt)).toBe('Cloudy, 8°C')
        expect(calls[0].body.tools).toEqual([{ google_search: {} }])
    })

    it('turns Markdown citations into plain text for a text message', () => {
        expect(plainCitations('High of 12 ([weather.gc.ca](https://weather.gc.ca)). See [the forecast](https://x.y) too.')).toBe('High of 12. See the forecast too.')
    })
})
