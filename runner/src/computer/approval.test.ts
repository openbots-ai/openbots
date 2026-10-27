// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { approvalText, gated, verdict, visible } from './approval'

describe('approval', () => {
    it('reads YES, YES ALL and everything else as no', () => {
        expect(['YES', 'yes.', ' Ok ', 'go ahead!', 'y'].map(verdict)).toEqual(['yes', 'yes', 'yes', 'yes', 'yes'])
        expect(['YES ALL', 'yes to all', 'Yes, all'].map(verdict)).toEqual(['all', 'all', 'all'])
        expect(['no', 'NO', '', 'yes but not that', 'maybe', 'yesterday'].map(verdict)).toEqual(['no', 'no', 'no', 'no', 'no', 'no'])
    })

    it('describes only the actions that type or send', () => {
        expect(gated('type', { text: 'hi "there"' })).toBe('type “hi "there"”')
        expect(gated('type', { text: '' })).toBeNull()
        expect(gated('key', { text: 'Return', repeat: 3 })).toBe('press Return ×3')
        expect(gated('key', { text: 'cmd+v' })).toBe('press cmd+v (pastes whatever is on the clipboard)')
        expect(gated('key', { text: 'Tab' })).toBeNull()
        expect(gated('key', { text: 'nonsense+key' })).toBeNull()
        expect(gated('left_click', { coordinate: [1, 1], text: 'shift' })).toBeNull()
    })

    it('makes invisible characters visible', () => {
        expect(visible('a\\b\n\t  ‍')).toBe('a\\\\b\\n\\t\\u{A0}\\u{2028}\\u{200D}')
        expect(visible('héllo 👋')).toBe('héllo 👋')
    })

    it('words the request with the window when known', () => {
        expect(approvalText(['type “x”'], null)).toBe('Allow this on your computer?\n• type “x”\nReply YES to allow it, YES ALL to stop asking me, or NO.')
        expect(approvalText(['press Return'], 'Mail')).toBe('Allow this on your computer? In Mail:\n• press Return\nReply YES to allow it, YES ALL to stop asking me, or NO.')
    })
})
