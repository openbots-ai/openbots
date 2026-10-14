// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelOption } from '../../convex/lib/models'
import { complete, plainCitations, type Tool } from './brain'

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

describe('tools', () => {
    const remind: Tool = {
        name: 'set_reminder',
        description: 'Set a reminder',
        parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        run: vi.fn(async (input) => `Reminder set: ${input.text}`),
    }

    it('runs OpenAI function calls and sends the results back until there is an answer', async () => {
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { output: [{ type: 'function_call', call_id: 'c1', name: 'set_reminder', arguments: '{"text":"stretch"}' }] },
            { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done, I will remind you.' }] }] },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200 })
        })
        expect(await complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [remind] })).toBe('Done, I will remind you.')
        expect(remind.run).toHaveBeenCalledWith({ text: 'stretch' })
        expect(bodies[0].tools).toEqual([{ type: 'web_search', search_context_size: 'low' }, { type: 'function', name: 'set_reminder', description: 'Set a reminder', parameters: remind.parameters }])
        expect(bodies[1].input).toEqual(expect.arrayContaining([{ type: 'function_call_output', call_id: 'c1', output: 'Reminder set: stretch' }]))
    })

    it('gives a failing tool’s error to the model instead of failing the reply', async () => {
        const broken: Tool = { ...remind, run: async () => { throw new Error('that time has passed') } }
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { output: [{ type: 'function_call', call_id: 'c1', name: 'set_reminder', arguments: '{"text":"x"}' }] },
            { output: [{ type: 'message', content: [{ type: 'output_text', text: 'That time has passed.' }] }] },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200 })
        })
        expect(await complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [broken] })).toBe('That time has passed.')
        expect(bodies[1].input).toEqual(expect.arrayContaining([{ type: 'function_call_output', call_id: 'c1', output: 'Error: that time has passed' }]))
    })

    it('stops after 6 rounds of tool calls', async () => {
        vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'c', name: 'set_reminder', arguments: '{"text":"x"}' }] }), { status: 200 }))
        await expect(complete(brains, option('openai', 'gpt-5.1'), { ...prompt, tools: [remind] })).rejects.toThrow(/kept using tools/)
    })

    it('runs Claude tool calls and returns their results as tool_result blocks', async () => {
        const bodies: Record<string, unknown>[] = []
        const answers = [
            { id: 'm1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'set_reminder', input: { text: 'stretch' } }], usage: { input_tokens: 1, output_tokens: 1 } },
            { id: 'm2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Reminder set.' }], usage: { input_tokens: 1, output_tokens: 1 } },
        ]
        vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
            bodies.push(JSON.parse(init.body as string))
            return new Response(JSON.stringify(answers.shift()), { status: 200, headers: { 'Content-Type': 'application/json' } })
        })
        const claude: ModelOption = { id: 'claude-sonnet-5-5', label: 'Claude', provider: 'anthropic', api: 'claude-sonnet-5-5' }
        expect(await complete({ keys: { anthropic: 'k' }, demo: false }, claude, { ...prompt, tools: [remind] })).toBe('Reminder set.')
        const second = bodies[1].messages as { role: string; content: unknown }[]
        expect(second.at(-1)).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Reminder set: stretch' }] })
    })
})
