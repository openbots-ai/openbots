// @vitest-environment node
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { PowerShell, winCommand, WindowsDriver } from './windows'

describe('Windows commands', () => {
    it('clicks, double-clicks with modifiers held, and releases them in reverse', () => {
        expect(winCommand({ op: 'click', at: { x: 10, y: 20 }, button: 'left', count: 1, mods: [] })).toBe('[OB]::Move(10, 20); [OB]::Click(0, 1, [uint16[]]@())')
        expect(winCommand({ op: 'click', at: { x: 5, y: 6 }, button: 'right', count: 2, mods: ['ctrl', 'shift'] })).toBe(
            '[OB]::Move(5, 6); [OB]::Click(1, 2, [uint16[]]@(17,16))',
        )
        expect(winCommand({ op: 'click', button: 'middle', count: 1, mods: [] })).toBe('[OB]::Click(2, 1, [uint16[]]@())')
    })

    it('types any text literally, never as code', () => {
        const text = 'Say "hi" $env:USERNAME `whoami`\nnext line'
        const line = winCommand({ op: 'type', text })
        expect(line).toBe(`[OB]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(text, 'utf8').toString('base64')}')))`)
        expect(line).not.toContain('$env')
    })

    it('presses named keys, characters and combinations, repeated', () => {
        expect(winCommand({ op: 'key', combo: 'ctrl+s', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(17), [OB]::VkFull([char]115))')
        expect(winCommand({ op: 'key', combo: 'Return', repeat: 3 })).toBe('for ($i = 0; $i -lt 3; $i++) { [OB]::Combo([uint16[]]@(), 13) }')
        expect(winCommand({ op: 'key', combo: 'super+e', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(91), [OB]::VkFull([char]101))')
        expect(winCommand({ op: 'key', combo: 'alt+F4', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(18), 115)')
        expect(winCommand({ op: 'key', combo: 'Super_L', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(), 91)')
        expect(winCommand({ op: 'key', combo: 'Insert', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(), 45)')
        expect(winCommand({ op: 'key', combo: 'ctrl+equal', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(17), [OB]::VkFull([char]61))')
        // A bare capital is shift and the letter, as on a Mac; with other modifiers it's the plain key
        expect(winCommand({ op: 'key', combo: 'A', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(16), [OB]::VkFull([char]97))')
        expect(winCommand({ op: 'key', combo: 'a', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(), [OB]::VkFull([char]97))')
        expect(winCommand({ op: 'key', combo: 'ctrl+C', repeat: 1 })).toBe('[OB]::Combo([uint16[]]@(17), [OB]::VkFull([char]99))')
    })

    it('scrolls, drags, moves, and reads the screen', () => {
        expect(winCommand({ op: 'scroll', at: { x: 1, y: 2 }, direction: 'down', amount: 3, mods: [] })).toBe('[OB]::Move(1, 2); [OB]::Scroll(0, -3, [uint16[]]@())')
        expect(winCommand({ op: 'scroll', direction: 'right', amount: 2, mods: [] })).toBe('[OB]::Scroll(2, 0, [uint16[]]@())')
        expect(winCommand({ op: 'drag', from: { x: 1, y: 1 }, to: { x: 9, y: 9 }, mods: [] })).toBe('[OB]::Drag(1, 1, 9, 9, [uint16[]]@())')
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

describe('limits', () => {
    it('keeps counts in range and never sends a bad number', () => {
        expect(winCommand({ op: 'key', combo: 'Return', repeat: 9999 })).toContain('$i -lt 100')
        expect(winCommand({ op: 'scroll', direction: 'down', amount: 500, mods: [] })).toBe('[OB]::Scroll(0, -50, [uint16[]]@())')
        expect(() => winCommand({ op: 'move', at: { x: 1e9, y: 0 } })).toThrow('Bad number')
        expect(winCommand({ op: 'click', button: 'left', count: 50, mods: [] })).toBe('[OB]::Click(0, 3, [uint16[]]@())')
        expect(winCommand({ op: 'click', button: 'left', count: 0, mods: [] })).toBe('[OB]::Click(0, 1, [uint16[]]@())')
        expect(() => winCommand({ op: 'move', at: { x: NaN, y: 1 } })).toThrow('Bad number')
        expect(() => winCommand({ op: 'scroll', direction: 'up', amount: Infinity, mods: [] })).toThrow('Bad number')
    })
})

describe('the window with the keyboard', () => {
    it('reads the app and title from the helper, base64 so any title fits', async () => {
        const reply = Buffer.from('chrome\nInbox — “you” @ mail', 'utf8').toString('base64')
        const driver = new WindowsDriver(new PowerShell(() => fakeShell((c) => (c === '[OB]::Window()' ? reply : '!unexpected')) as never))
        expect(await driver.window()).toBe('chrome — “Inbox — “you” @ mail”')
        driver.close()
    })
})

// A helper that starts fine and then says nothing, until the test speaks for it
function quietChild() {
    const events = new EventEmitter()
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const child = {
        stdin,
        stdout,
        events,
        stderr: new PassThrough(),
        killed: false,
        on: (event: string, cb: (e?: unknown) => void) => void events.on(event, cb),
        kill: () => void (child.killed = true),
        say: (text: string) => void stdout.write(`${text}\r\n`),
    }
    setTimeout(() => child.say('@@OB ready'))
    return child
}
const pause = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

describe('a helper that breaks', () => {
    it('fails the command instead of crashing when PowerShell can’t start', async () => {
        const broken = quietChild()
        const shell = new PowerShell(() => broken)
        const run = shell.run('x')
        await pause(1)
        broken.events.emit('error', new Error('spawn powershell.exe ENOENT'))
        await expect(run).rejects.toThrow('ENOENT')
    })

    it('fails the command instead of crashing when it can’t be written to', async () => {
        const stuck = quietChild()
        const shell = new PowerShell(() => stuck)
        const run = shell.run('x')
        await pause()
        stuck.stdin.emit('error', new Error('write EPIPE'))
        await expect(run).rejects.toThrow('EPIPE')
    })

    it('includes what PowerShell printed to stderr', async () => {
        const dying = quietChild()
        const shell = new PowerShell(() => dying)
        const run = shell.run('x')
        await pause(1)
        dying.stderr.write('Add-Type : compile failed')
        dying.events.emit('exit')
        dying.events.emit('close')
        await expect(run).rejects.toThrow('compile failed')
    })

    it('stops waiting when closed during startup, and works again afterwards', async () => {
        const first = quietChild()
        const children = [first, fakeShell(() => 'fine')]
        let spawned = 0
        const shell = new PowerShell(() => children[spawned++] as never)
        const run = shell.run('x')
        await pause(0)
        shell.close()
        first.events.emit('exit')
        await expect(run).rejects.toThrow('closed')
        expect(await shell.run('y')).toBe('fine')
    })

    it('ignores a late error from an old helper', async () => {
        const first = quietChild()
        const second = quietChild()
        const children = [first, second]
        let spawned = 0
        const shell = new PowerShell(() => children[spawned++] as never)
        const a = shell.run('a')
        await pause()
        shell.close()
        await expect(a).rejects.toThrow('closed')
        const b = shell.run('b')
        await pause()
        first.events.emit('error', new Error('late'))
        second.say('@@OB 2 ok done')
        expect(await b).toBe('done')
    })

    it('throws the stuck helper away so the next command gets a fresh one', async () => {
        const children = [quietChild(), fakeShell(() => 'fine')]
        let spawned = 0
        const shell = new PowerShell(() => children[spawned++] as never, 1000)
        await expect(shell.run('hangs')).rejects.toThrow('in time')
        expect((children[0] as ReturnType<typeof quietChild>).killed).toBe(true)
        expect(await shell.run('next')).toBe('fine')
        expect(spawned).toBe(2)
    })

    it('ignores a late exit from a closed helper', async () => {
        const first = quietChild()
        const second = quietChild()
        const children = [first, second]
        let spawned = 0
        const shell = new PowerShell(() => children[spawned++] as never)
        const a = shell.run('a')
        await pause()
        shell.close()
        await expect(a).rejects.toThrow('closed')
        const b = shell.run('b')
        await pause()
        first.events.emit('exit')
        second.say('@@OB 2 ok done')
        expect(await b).toBe('done')
    })
})

describe('the PowerShell helper process', () => {
    it('runs commands one at a time and returns their output or error', async () => {
        const shell = new PowerShell(() => fakeShell((c) => (c === '[OB]::Size()' ? '{"width":1920,"height":1080}' : c === 'bad' ? '!Windows blocked the input' : '')))
        expect(await shell.run('[OB]::Size()')).toBe('{"width":1920,"height":1080}')
        await expect(shell.run('bad')).rejects.toThrow('Windows blocked the input')
        expect(await shell.run('[OB]::Move(1, 1)')).toBe('')
        shell.close()
    })
})
