// @vitest-environment node
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startTunnel, tunnelAddress } from './tunnel'

// A stand-in for the cloudflared process
function fakeProcess() {
    const child = new EventEmitter() as ChildProcess & EventEmitter
    Object.assign(child, { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() })
    return child
}

afterEach(() => vi.useRealTimers())

describe('tunnel', () => {
    it('finds the address in cloudflared’s output', () => {
        expect(tunnelAddress('INF |  https://quiet-river-ab12.trycloudflare.com  |')).toBe('https://quiet-river-ab12.trycloudflare.com')
        expect(tunnelAddress('INF Starting tunnel')).toBeUndefined()
    })

    it('reports each new address, and restarts the tunnel when it stops', () => {
        vi.useFakeTimers()
        const children: ReturnType<typeof fakeProcess>[] = []
        const run = vi.fn((_c: string, args: string[]) => {
            expect(args).toEqual(['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8787'])
            const child = fakeProcess()
            children.push(child)
            return child
        })
        const addresses: string[] = []
        const stop = startTunnel('/opt/openbots/cloudflared', 8787, (u) => addresses.push(u), () => {}, run)

        children[0].stderr!.emit('data', 'Your quick Tunnel has been created! Visit it at: https://one-two.trycloudflare.com\n')
        children[0].stderr!.emit('data', 'still https://one-two.trycloudflare.com\n')
        expect(addresses).toEqual(['https://one-two.trycloudflare.com'])

        children[0].emit('exit', 1)
        vi.advanceTimersByTime(5_000)
        expect(run).toHaveBeenCalledTimes(2)
        children[1].stderr!.emit('data', 'https://three-four.trycloudflare.com')
        expect(addresses).toEqual(['https://one-two.trycloudflare.com', 'https://three-four.trycloudflare.com'])

        stop()
        children[1].emit('exit', 0)
        vi.advanceTimersByTime(10_000)
        expect(run).toHaveBeenCalledTimes(2)
    })
})
