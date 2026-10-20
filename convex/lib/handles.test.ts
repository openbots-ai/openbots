// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { handleKey } from './handles'

describe('handle keys', () => {
    it('spells a US number the same however it was typed', () => {
        for (const raw of ['+1 (415) 555-0101', '+14155550101', '14155550101', '(415) 555-0101', '415.555.0101', '001 415 555 0101']) expect(handleKey(raw), raw).toBe('14155550101')
    })

    it('keeps the country code a number was given, so other countries never collide with US numbers', () => {
        // Norway's +47 9xxxxxxx has the digits of a US number in area code 479
        expect(handleKey('+47 912 34 567')).toBe('4791234567')
        expect(handleKey('+1 479 123 4567')).toBe('14791234567')
        expect(handleKey('479 123 4567')).toBe('14791234567')
        expect(handleKey('+47 912 34 567')).not.toBe(handleKey('+1 479 123 4567'))
        expect(handleKey('0047 912 34 567')).toBe(handleKey('+47 912 34 567'))
        expect(handleKey('+44 20 7946 0958')).toBe('442079460958')
    })

    it('lowercases emails and refuses anything else', () => {
        expect(handleKey(' Pip@iCloud.com ')).toBe('pip@icloud.com')
        expect(handleKey('hello')).toBeNull()
        expect(handleKey('123')).toBeNull()
    })
})
