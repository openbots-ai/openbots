import { describe, expect, it } from 'vitest'
import { canComputerUse, kindOf, resolveComputer } from './computers'

const laptop = { _id: 'r1' }
const vm = { _id: 'r2', orgo: { computerId: 'c1', workspaceId: 'w1' } }

describe('which computer an agent uses', () => {
    it('takes the agent’s own pick, then the workspace’s', () => {
        expect(resolveComputer([laptop, vm], 'r1', 'r2')).toEqual({ computer: vm, inherited: false })
        expect(resolveComputer([laptop, vm], 'r1')).toEqual({ computer: laptop, inherited: true })
    })

    it('uses the only computer when nothing is picked, and none when there are several', () => {
        expect(resolveComputer([vm]).computer).toBe(vm)
        expect(resolveComputer([laptop, vm]).computer).toBeUndefined()
        expect(resolveComputer([]).computer).toBeUndefined()
    })

    it('skips a pick whose computer was deleted', () => {
        expect(resolveComputer([vm], 'gone', 'also-gone')).toEqual({ computer: vm, inherited: true })
    })

    it('leaves your own Linux computers out of computer use, but not Orgo ones', () => {
        const fedora = { _id: 'r4', os: 'linux' }
        expect(canComputerUse(fedora)).toBe(false)
        expect(canComputerUse({ _id: 'r5', os: 'windows' })).toBe(true)
        expect(canComputerUse({ ...vm, os: 'linux' })).toBe(true)
        // A Linux computer is never the automatic default, nor a pick
        expect(resolveComputer([fedora]).computer).toBeUndefined()
        expect(resolveComputer([fedora, laptop], 'r4').computer).toBe(laptop)
    })

    it('tells your own computers from cloud ones', () => {
        expect(kindOf(laptop)).toBe('own')
        expect(kindOf(vm)).toBe('orgo')
        expect(kindOf({ _id: 'r3', setup: { status: 'failed' } })).toBe('orgo')
    })
})
