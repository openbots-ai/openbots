// @vitest-environment node
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { PowerShell, winCommand } from './windows'

describe('Windows commands', () => {
    it('clicks, double-clicks with modifiers held, and releases them in reverse', () => {
        expect(winCommand({ op: 'click', at: { x: 10, y: 20 }, button: 'left', count: 1, mods: [] })).toBe('[OB]::Move(10, 20); [OB]::Click(0, 1)')
        expect(winCommand({ op: 'click', at: { x: 5, y: 6 }, button: 'right', count: 2, mods: ['ctrl', 'shift'] })).toBe(
            '[OB]::Move(5, 6); [OB]::Hold([uint16[]]@(17,16), $false); [OB]::Click(1, 2); [OB]::Hold([uint16[]]@(17,16), $true)',
        )
        expect(winCommand({ op: 'click', button: 'middle', count: 1, mods: [] })).toBe('[OB]::Click(2, 1)')
    })

    it('types any text literally, never as code', () => {
        const text = 'Say "hi" $env:USERNAME `whoami`\nnext line'
        const line = winCommand({ op: 'type', text })
        expect(line).toBe(`[OB]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(text, 'utf8').toString('base64')}')))`)
        expect(line).not.toContain('$env')
    })

    it('presses named keys, characters and combinations, repeated', () => {
        expect(winCommand({ op: 'key', combo: 'ctrl+s', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(17), [OB]::Vk([char]115))')
        expect(winCommand({ op: 'key', combo: 'Return', repeat: 3 })).toBe('for ($i = 0; $i -lt 3; $i++) { [OB]::Combo([uint16[]]@(), 13) }')
        expect(winCommand({ op: 'key', combo: 'super+e', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(91), [OB]::Vk([char]101))')
        expect(winCommand({ op: 'key', combo: 'alt+F4', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(18), 115)')
        expect(winCommand({ op: 'key', combo: 'Super_L', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(), 91)')
        expect(winCommand({ op: 'key', combo: 'Insert', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(), 45)')
        expect(winCommand({ op: 'key', combo: 'ctrl+equal', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(17), [OB]::Vk([char]61))')
    })

    it('scrolls, drags, moves, and reads the screen', () => {
        expect(winCommand({ op: 'scroll', at: { x: 1, y: 2 }, direction: 'down', amount: 3, mods: [] })).toBe('[OB]::Move(1, 2); [OB]::Scroll(0, -3)')
        expect(winCommand({ op: 'scroll', direction: 'right', amount: 2, mods: [] })).toBe('[OB]::Scroll(2, 0)')
        expect(winCommand({ op: 'drag', from: { x: 1, y: 1 }, to: { x: 9, y: 9 }, mods: [] })).toBe('[OB]::Move(1, 1); [OB]::Down(); [OB]::Move(9, 9); [OB]::Up()')
        expect(winCommand({ op: 'move', at: { x: 3, y: 4 } })).toBe('[OB]::Move(3, 4)')
        expect(winCommand({ op: 'shot', target: { width: 1280, height: 720 } })).toBe('[OB]::Shot(1280, 720)')
        expect(winCommand({ op: 'size' })).toBe('[OB]::Size()')
        expect(winCommand({ op: 'cursor' })).toBe('[OB]::Cursor()')
    })
})

// A stand-in for powershell.exe running the helper: answers each command line the way the helper does
function fakeShell(answer: (command: string) => string) {
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    let buffered = ''
    stdin.on('data', (chunk) => {
        buffered += chunk.toString()
        let nl
        while ((nl = buffered.indexOf('\n')) >= 0) {
            const line = buffered.slice(0, nl)
            buffered = buffered.slice(nl + 1)
            const [id, ...rest] = line.split(' ')
            const command = rest.join(' ')
            const out = answer(command)
            stdout.write(out.startsWith('!') ? `@@OB ${id} err ${out.slice(1)}\r\n` : `@@OB ${id} ok ${out}\r\n`)
        }
    })
    setTimeout(() => stdout.write('Loading…\r\n@@OB ready\r\n'))
    return { stdin, stdout, on: () => {}, kill: () => {} }
}

describe('the PowerShell helper process', () => {
    it('runs commands one at a time and returns their output or error', async () => {
        const shell = new PowerShell(() => fakeShell((c) => (c === '[OB]::Size()' ? '{"width":1920,"height":1080}' : c === 'bad' ? '!Windows blocked the input' : '')))
        expect(await shell.run('[OB]::Size()')).toBe('{"width":1920,"height":1080}')
        await expect(shell.run('bad')).rejects.toThrow('Windows blocked the input')
        expect(await shell.run('[OB]::Move(1, 1)')).toBe('')
        shell.close()
    })
})
