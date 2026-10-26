import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { parseCombo } from './driver'
import { charSym, keySym, resize } from './linux'

describe('Linux keys', () => {
    it('types characters as their keysyms', () => {
        expect(charSym('a')).toBe(0x61)
        expect(charSym('A')).toBe(0x41)
        expect(charSym('@')).toBe(0x40)
        expect(charSym('é')).toBe(0xe9)
        expect(charSym('€')).toBe(0x010020ac)
        expect(charSym('😀')).toBe(0x0101f600)
        expect(charSym('\n')).toBe(0xff0d)
    })

    it('presses named keys, function keys and shortcuts', () => {
        expect(keySym(parseCombo('Return').key)).toBe(0xff0d)
        expect(keySym(parseCombo('ctrl+l').key)).toBe(0x6c)
        expect(keySym(parseCombo('Page_Down').key)).toBe(0xff56)
        expect(keySym(parseCombo('F5').key)).toBe(0xffc2)
        expect(keySym(parseCombo('F12').key)).toBe(0xffc9)
        expect(keySym(parseCombo('super').key)).toBe(0xffeb)
    })
})

describe('Linux screenshots', () => {
    it('are resized to exactly the size Claude sees', () => {
        const src = new PNG({ width: 4, height: 2 })
        // Left half black, right half white
        for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) src.data.set(x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * 4 + x) * 4)
        const out = resize(src, { width: 2, height: 1 })
        expect([out.width, out.height]).toEqual([2, 1])
        expect(out.data[0]).toBeLessThan(64)
        expect(out.data[4]).toBeGreaterThan(192)
        expect(out.data[3]).toBe(255)
    })
})
