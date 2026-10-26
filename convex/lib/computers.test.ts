import { describe, expect, it } from 'vitest'
import { canComputerUse, kindOf } from './computers'

const vm = { orgo: { computerId: 'c1', workspaceId: 'w1' } }

describe('computer kinds', () => {
    it('tells your own computers from Orgo ones', () => {
        expect(kindOf({})).toBe('own')
        expect(kindOf(vm)).toBe('orgo')
        expect(kindOf({ setup: { step: 1 } })).toBe('orgo')
    })

    it('allows computer use on your own Windows, Mac or Linux computer only', () => {
        expect(canComputerUse({ os: 'windows' })).toBe(true)
        expect(canComputerUse({ os: 'mac' })).toBe(true)
        expect(canComputerUse({ os: 'linux' })).toBe(true)
        expect(canComputerUse({ os: 'other' })).toBe(false)
        expect(canComputerUse({})).toBe(false)
        expect(canComputerUse({ ...vm, os: 'linux' })).toBe(false)
        expect(canComputerUse({ ...vm, os: 'windows' })).toBe(false)
    })
})
