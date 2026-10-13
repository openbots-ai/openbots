import { describe, expect, it } from 'vitest'
import { handleKind } from '@convex/lib/handles'
import { blankAgent } from './draft'
import { isCrmPath } from './route'
import { matches, parseTags } from './text'
import { relativeTime } from './time'
import { parseView, viewHref } from './view'

describe('isCrmPath', () => {
    it('matches only /dashboard with optional trailing slashes', () => {
        expect(isCrmPath('/dashboard')).toBe(true)
        expect(isCrmPath('/dashboard/')).toBe(true)
        expect(isCrmPath('/dashboard//')).toBe(true)
        expect(isCrmPath('/dashboard/agents')).toBe(false)
        expect(isCrmPath('/DASHBOARD')).toBe(false)
        expect(isCrmPath('/dashboardx')).toBe(false)
        expect(isCrmPath('/crm')).toBe(false)
        expect(isCrmPath('/')).toBe(false)
    })
})

describe('parseView / viewHref', () => {
    it('falls back to agents for missing or unknown views', () => {
        expect(parseView('')).toEqual({ view: 'agents', id: undefined })
        expect(parseView('?view=admin')).toEqual({ view: 'agents', id: undefined })
    })
    it('reads view and id', () => {
        expect(parseView('?view=agents&id=abc')).toEqual({ view: 'agents', id: 'abc' })
    })
    it('round-trips through viewHref and stays on /dashboard', () => {
        expect(viewHref('agents')).toBe('/dashboard')
        expect(viewHref('analytics')).toBe('/dashboard?view=analytics')
        const href = viewHref('agents', 'k57 x&y')
        expect(href.startsWith('/dashboard?')).toBe(true)
        expect(parseView(href.slice('/dashboard'.length))).toEqual({ view: 'agents', id: 'k57 x&y' })
    })
})

describe('blankAgent', () => {
    it('defaults the role', () => {
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
})
