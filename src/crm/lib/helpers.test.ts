import { describe, expect, it } from 'vitest'
import { handleKind } from '@convex/lib/handles'
import { bucketByDay } from '@convex/lib/stats'
import { blankAgent, draftFromPrompt } from './draft'
import { isCrmPath } from './route'
import { matches, parseTags } from './text'
import { greetingFor, relativeTime } from './time'
import { parseView, viewHref } from './view'

describe('isCrmPath', () => {
    it('matches only /crm with optional trailing slashes', () => {
        expect(isCrmPath('/crm')).toBe(true)
        expect(isCrmPath('/crm/')).toBe(true)
        expect(isCrmPath('/crm//')).toBe(true)
        expect(isCrmPath('/crm/agents')).toBe(false)
        expect(isCrmPath('/CRM')).toBe(false)
        expect(isCrmPath('/crmx')).toBe(false)
        expect(isCrmPath('/')).toBe(false)
    })
})

describe('parseView / viewHref', () => {
    it('falls back to home for missing or unknown views', () => {
        expect(parseView('')).toEqual({ view: 'home', id: undefined })
        expect(parseView('?view=admin')).toEqual({ view: 'home', id: undefined })
    })
    it('reads view and id', () => {
        expect(parseView('?view=agents&id=abc')).toEqual({ view: 'agents', id: 'abc' })
    })
    it('round-trips through viewHref and stays on /crm', () => {
        expect(viewHref('home')).toBe('/crm')
        expect(viewHref('contacts')).toBe('/crm?view=contacts')
        const href = viewHref('agents', 'k57 x&y')
        expect(href.startsWith('/crm?')).toBe(true)
        expect(parseView(href.slice(4))).toEqual({ view: 'agents', id: 'k57 x&y' })
    })
})

describe('draftFromPrompt', () => {
    it('returns null for blank input', () => {
        expect(draftFromPrompt('   ')).toBeNull()
    })
    it('uses a name given with "named"/"called" and infers a role', () => {
        const d = draftFromPrompt('An agent named iris who books my meetings')!
        expect(d.name).toBe('Iris')
        expect(d.role).toBe('Scheduling')
        expect(d.status).toBe('draft')
        expect(d.prompt).toBe('An agent named iris who books my meetings')
    })
    it('picks a stable name and falls back to Assistant', () => {
        const a = draftFromPrompt('help me out with stuff')!
        expect(a.name).toBe(draftFromPrompt('help me out with stuff')!.name)
        expect(a.role).toBe('Assistant')
    })
    it('blankAgent defaults the role', () => {
        expect(blankAgent('Rex', '').role).toBe('Assistant')
    })
})

describe('text helpers', () => {
    it('matches case-insensitively and treats blank queries as match-all', () => {
        expect(matches('', 'x')).toBe(true)
        expect(matches('  ', 'x')).toBe(true)
        expect(matches('AVA', 'Ava', undefined)).toBe(true)
        expect(matches('zz', 'Ava', 'Assistant')).toBe(false)
    })
    it('parses tags', () => {
        expect(parseTags(' Client, vip,,client , ')).toEqual(['client', 'vip'])
    })
    it('classifies handles', () => {
        expect(handleKind('+1 (415) 555-0101')).toBe('phone')
        expect(handleKind('a@b.co')).toBe('email')
        expect(handleKind('123')).toBeNull()
        expect(handleKind('   ')).toBeNull()
        expect(handleKind('hello')).toBeNull()
    })
})

describe('time helpers', () => {
    const now = Date.UTC(2026, 9, 6, 12)
    it('formats relative times', () => {
        expect(relativeTime(now - 10_000, now)).toBe('just now')
        expect(relativeTime(now + 10_000, now)).toBe('just now')
        expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
        expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
        expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')
    })
    it('greets by hour', () => {
        expect(greetingFor(8)).toBe('Good morning')
        expect(greetingFor(14)).toBe('Good afternoon')
        expect(greetingFor(21)).toBe('Good evening')
        expect(greetingFor(2)).toBe('Good evening')
    })
    it('buckets by UTC day, ignoring out-of-range times', () => {
        const day = 86_400_000
        const out = bucketByDay([now, now - 1000, now - day, now - 20 * day, now + 2 * day], 3, now)
        expect(out).toEqual([
            { day: '2026-10-04', count: 0 },
            { day: '2026-10-05', count: 1 },
            { day: '2026-10-06', count: 2 },
        ])
    })
})
