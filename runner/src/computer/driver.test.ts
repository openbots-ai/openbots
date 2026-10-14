// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fitted, parseCombo, parseMods, toScreen, toShot } from './driver'

describe('screen scaling', () => {
    it('shrinks a big screen to fit Claude’s image limit and keeps small ones', () => {
        expect(fitted({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 })
        const big = fitted({ width: 2560, height: 1440 })
        expect(Math.max(big.width, big.height)).toBeLessThanOrEqual(1568)
        expect(big.width * big.height).toBeLessThanOrEqual(1_150_000)
        expect(big.width / big.height).toBeCloseTo(2560 / 1440, 2)
    })

    it('maps Claude’s screenshot coordinates to the screen and back, Retina Macs included', () => {
        // A Retina Mac's input space is points (1512×982); the screenshot is resized to fit that
        const screen = { width: 1512, height: 982 }
        const shot = fitted(screen)
        expect(toScreen({ x: shot.width / 2, y: shot.height / 2 }, shot, screen)).toEqual({ x: 756, y: 491 })
        const wide = { width: 2560, height: 1440 }
        const small = fitted(wide)
        expect(toScreen({ x: small.width, y: small.height }, small, wide)).toEqual({ x: 2559, y: 1439 })
        expect(toShot({ x: 1280, y: 720 }, small, wide)).toEqual({ x: Math.round(1280 * (small.width / 2560)), y: Math.round(720 * (small.height / 1440)) })
    })
})

describe('key names', () => {
    it('reads key combinations the way Claude writes them', () => {
        expect(parseCombo('ctrl+s')).toEqual({ mods: ['ctrl'], key: 's' })
        expect(parseCombo('Return')).toEqual({ mods: [], key: 'enter' })
        expect(parseCombo('cmd+shift+T')).toEqual({ mods: ['super', 'shift'], key: 't' })
        expect(parseCombo('Page_Down')).toEqual({ mods: [], key: 'pagedown' })
        expect(parseCombo('alt+F4')).toEqual({ mods: ['alt'], key: 'f4' })
        expect(parseCombo('Escape')).toEqual({ mods: [], key: 'escape' })
        expect(parseCombo('plus')).toEqual({ mods: [], key: '+' })
        expect(() => parseCombo('ctrl+')).toThrow(/key/)
    })

    it('reads modifiers held during a click', () => {
        expect(parseMods(undefined)).toEqual([])
        expect(parseMods('shift')).toEqual(['shift'])
        expect(parseMods('ctrl+shift')).toEqual(['ctrl', 'shift'])
    })
})
