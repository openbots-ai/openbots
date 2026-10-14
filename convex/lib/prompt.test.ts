import { describe, expect, it } from 'vitest'
import type { Doc, Id } from '../_generated/dataModel'
import { systemPrompt } from './prompt'

const agent = { _id: 'a' as Id<'agents'>, _creationTime: 0, workspaceId: 'w' as Id<'workspace'>, name: 'Iris', role: 'Assistant', hue: 0, prompt: '', greeting: 'hi', status: 'live', updatedAt: 0 } satisfies Doc<'agents'>
const base = { agent, workspace: { ownerName: 'Sam', timezone: 'UTC' }, contact: { name: 'Dana', handle: '+16395550100', tags: [], notes: '' }, knowledge: [], now: 0 }

describe('agent instructions', () => {
    it('mentions web search only when the model can search', () => {
        expect(systemPrompt({ ...base, canSearch: true })).toMatch(/search the web/)
        expect(systemPrompt(base)).not.toMatch(/search the web/)
    })

    it('keeps replies sent as SMS short, emoji and all', () => {
        expect(systemPrompt({ ...base, sms: true })).toMatch(/under 300 characters/)
        expect(systemPrompt({ ...base, sms: true })).not.toMatch(/emoji/)
        expect(systemPrompt(base)).not.toMatch(/under 300 characters/)
    })

    it('tells the agent about its scheduling tools only when it has them', () => {
        expect(systemPrompt({ ...base, canSchedule: true })).toMatch(/set reminders/)
        expect(systemPrompt(base)).not.toMatch(/set reminders/)
    })
})
