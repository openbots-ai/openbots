import { describe, expect, it } from 'vitest'
import type { Doc, Id } from '../_generated/dataModel'
import { localTime, systemPrompt, utcOffset } from './prompt'

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

    it('tells the agent it can use your computer only when it can, and in your own chat', () => {
        expect(systemPrompt({ ...base, withOwner: true, canUseComputer: true })).toMatch(/do tasks on their computer/)
        expect(systemPrompt({ ...base, withOwner: true })).not.toMatch(/do tasks on their computer/)
        expect(systemPrompt({ ...base, canUseComputer: true })).not.toMatch(/do tasks on their computer/)
    })

    it('says a computer task is already running, in your own chat only', () => {
        const busy = "You're already doing a task on their computer (“book Nopa”). Tell them it's in progress; they can text stop to cancel it."
        expect(systemPrompt({ ...base, withOwner: true, computerBusy: 'book Nopa' })).toContain(busy)
        expect(systemPrompt({ ...base, computerBusy: 'book Nopa' })).not.toContain('book Nopa')
        expect(systemPrompt({ ...base, withOwner: true })).not.toMatch(/already doing a task/)
    })

    it('gives the UTC offset with the timezone, and asks for the offset on the target date', () => {
        const regina = { ...base, workspace: { ownerName: 'Sam', timezone: 'America/Regina' }, now: Date.parse('2026-10-14T20:00:00Z') }
        expect(systemPrompt(regina)).toContain('(America/Regina, UTC-06:00)')
        expect(systemPrompt(base)).toContain('(UTC, UTC+00:00)')
        expect(systemPrompt({ ...regina, canSchedule: true })).toMatch(/offset that applies on that date/)
    })

    it('works out offsets across daylight saving, and shows times in your timezone', () => {
        expect(utcOffset(Date.parse('2026-07-01T12:00:00Z'), 'America/New_York')).toBe('UTC-04:00')
        expect(utcOffset(Date.parse('2026-01-01T12:00:00Z'), 'America/New_York')).toBe('UTC-05:00')
        expect(utcOffset(Date.parse('2026-07-01T12:00:00Z'), 'Asia/Kolkata')).toBe('UTC+05:30')
        expect(localTime(Date.parse('2026-10-14T23:00:00Z'), 'America/Regina')).toBe('Wed, Oct 14, 5:00 PM (UTC-06:00)')
    })
})
