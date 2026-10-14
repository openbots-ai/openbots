import { spawn } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { parseCombo, type Button, type Direction, type Driver, type Mod, type Point, type Shot, type Size } from './driver'

// Windows: one PowerShell process stays open with a small C# helper loaded (screenshots through .NET, mouse and
// keyboard through SendInput), so each action is a single line instead of a new process. Nothing to install.

// The helper. Reads "<id> <command>" lines and answers "@@OB <id> ok <output>" or "@@OB <id> err <message>".
export const HELPER_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Threading;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class OB {
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X; public int Y; }

    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern short VkKeyScan(char c);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    static void Send(params INPUT[] inputs) {
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length) throw new Exception("Windows blocked the input");
    }
    static INPUT Mouse(uint flags, uint data) { var i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; return i; }
    // Navigation keys and the Windows keys need the extended-key flag, or they act as their numpad twins
    static INPUT Key(ushort vk, bool up) {
        var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        uint flags = up ? 2u : 0u;
        if ((vk >= 33 && vk <= 40) || vk == 45 || vk == 46 || vk == 91 || vk == 92 || vk == 93 || vk == 111 || vk == 144) flags |= 1u;
        i.u.ki.dwFlags = flags;
        return i;
    }
    static INPUT Unicode(char c, bool up) { var i = new INPUT(); i.type = 1; i.u.ki.wScan = c; i.u.ki.dwFlags = up ? 6u : 4u; return i; }

    public static string Size() { var b = Screen.PrimaryScreen.Bounds; return "{\"width\":" + b.Width + ",\"height\":" + b.Height + "}"; }
    public static string Cursor() { POINT p; GetCursorPos(out p); return "{\"x\":" + p.X + ",\"y\":" + p.Y + "}"; }
    public static void Move(int x, int y) { SetCursorPos(x, y); }
    // Runs body with the modifier keys held, and always lets them go again
    static void With(ushort[] mods, Action body) {
        try { Hold(mods, false); body(); } finally { Hold(mods, true); }
    }
    // 0 left, 1 right, 2 middle
    public static void Click(int button, int count, ushort[] mods) {
        uint down = button == 1 ? 0x0008u : button == 2 ? 0x0020u : 0x0002u;
        uint up = button == 1 ? 0x0010u : button == 2 ? 0x0040u : 0x0004u;
        With(mods, () => { for (int i = 0; i < count; i++) Send(Mouse(down, 0), Mouse(up, 0)); });
    }
    // Presses at the start, moves in small steps so apps see a real drag, lets go at the end
    public static void Drag(int x1, int y1, int x2, int y2, ushort[] mods) {
        SetCursorPos(x1, y1);
        With(mods, () => {
            Send(Mouse(0x0002, 0));
            try {
                for (int i = 1; i <= 10; i++) { SetCursorPos(x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10); Thread.Sleep(10); }
            } finally { Send(Mouse(0x0004, 0)); }
        });
    }
    // Wheel notches: dy > 0 scrolls up, dx > 0 scrolls right
    public static void Scroll(int dx, int dy, ushort[] mods) {
        With(mods, () => {
            if (dy != 0) Send(Mouse(0x0800, unchecked((uint)(dy * 120))));
            if (dx != 0) Send(Mouse(0x1000, unchecked((uint)(dx * 120))));
        });
    }
    // Presses (or releases, in reverse order) the modifier keys
    public static void Hold(ushort[] mods, bool up) {
        var keys = (ushort[])mods.Clone();
        if (up) Array.Reverse(keys);
        foreach (var k in keys) Send(Key(k, up));
    }
    // vk may carry VkKeyScan's shift state in its high byte (1 shift, 2 ctrl, 4 alt), so "?" or "{" press correctly
    public static void Combo(ushort[] mods, int vk) {
        var all = new List<ushort>(mods);
        int state = (vk >> 8) & 0xff;
        if ((state & 1) != 0 && !all.Contains(16)) all.Add(16);
        if ((state & 2) != 0 && !all.Contains(17)) all.Add(17);
        if ((state & 4) != 0 && !all.Contains(18)) all.Add(18);
        ushort code = (ushort)(vk & 0xff);
        With(all.ToArray(), () => Send(Key(code, false), Key(code, true)));
    }
    public static int VkFull(char c) { short s = VkKeyScan(c); if (s == -1) throw new Exception("There's no key for " + c); return s & 0xffff; }
    // Each character as itself (any language), newlines as Enter
    public static void Type(string text) {
        foreach (char c in text) {
            if (c == '\r') continue;
            if (c == '\n') Send(Key(0x0D, false), Key(0x0D, true));
            else Send(Unicode(c, false), Unicode(c, true));
        }
    }
    public static string Shot(int width, int height) {
        var b = Screen.PrimaryScreen.Bounds;
        using (var full = new Bitmap(b.Width, b.Height))
        using (var g = Graphics.FromImage(full)) {
            g.CopyFromScreen(b.Left, b.Top, 0, 0, full.Size);
            using (var small = new Bitmap(width, height))
            using (var g2 = Graphics.FromImage(small))
            using (var ms = new MemoryStream()) {
                g2.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g2.DrawImage(full, 0, 0, width, height);
                small.Save(ms, ImageFormat.Png);
                return "{\"base64\":\"" + Convert.ToBase64String(ms.ToArray()) + "\",\"width\":" + width + ",\"height\":" + height + "}";
            }
        }
    }
}
'@
[void][OB]::SetProcessDPIAware()
[Console]::Out.WriteLine('@@OB ready')
while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $id, $command = $line -split ' ', 2
    try {
        $out = Invoke-Expression $command
        [Console]::Out.WriteLine("@@OB $id ok $out")
    } catch {
        $e = $_.Exception
        if ($e.InnerException) { $e = $e.InnerException }
        [Console]::Out.WriteLine("@@OB $id err " + ($e.Message -replace "\r?\n", ' '))
    }
}
`

// Windows virtual-key codes
const MOD_VK: Record<Mod, number> = { ctrl: 17, shift: 16, alt: 18, super: 91 }
const KEY_VK: Record<string, number> = {
    enter: 13, escape: 27, tab: 9, backspace: 8, delete: 46, space: 32, insert: 45,
    ctrl: 17, shift: 16, alt: 18, super: 91,
    left: 37, up: 38, right: 39, down: 40, home: 36, end: 35, pageup: 33, pagedown: 34,
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, 112 + i])),
}
const BUTTON: Record<Button, number> = { left: 0, right: 1, middle: 2 }

// Numbers reach PowerShell as plain integers, never NaN or text
const num = (n: number) => {
    if (!Number.isFinite(n) || Math.abs(n) >= 1e6) throw new Error('Bad number')
    return Math.round(n)
}
const within = (n: number, lo: number, hi: number) => Math.min(Math.max(num(n), lo), hi)
const mods = (list: Mod[]) => `[uint16[]]@(${list.map((m) => MOD_VK[m]).join(',')})`
const move = (p: Point) => `[OB]::Move(${num(p.x)}, ${num(p.y)})`

export type WinOp =
    | { op: 'size' }
    | { op: 'cursor' }
    | { op: 'shot'; target: Size }
    | { op: 'move'; at: Point }
    | { op: 'click'; at?: Point; button: Button; count: number; mods: Mod[] }
    | { op: 'drag'; from: Point; to: Point; mods: Mod[] }
    | { op: 'scroll'; at?: Point; direction: Direction; amount: number; mods: Mod[] }
    | { op: 'type'; text: string }
    | { op: 'key'; combo: string; repeat: number }

// One action as one PowerShell line. Text from Claude only ever reaches PowerShell base64-encoded.
export function winCommand(o: WinOp): string {
    switch (o.op) {
        case 'size':
            return '[OB]::Size()'
        case 'cursor':
            return '[OB]::Cursor()'
        case 'shot':
            return `[OB]::Shot(${num(o.target.width)}, ${num(o.target.height)})`
        case 'move':
            return move(o.at)
        case 'click':
            return [...(o.at ? [move(o.at)] : []), `[OB]::Click(${BUTTON[o.button]}, ${within(o.count, 1, 3)}, ${mods(o.mods)})`].join('; ')
        case 'drag':
            return `[OB]::Drag(${num(o.from.x)}, ${num(o.from.y)}, ${num(o.to.x)}, ${num(o.to.y)}, ${mods(o.mods)})`
        case 'scroll': {
            const n = within(o.amount, 1, 50)
            const [dx, dy] = o.direction === 'up' ? [0, n] : o.direction === 'down' ? [0, -n] : o.direction === 'left' ? [-n, 0] : [n, 0]
            return [...(o.at ? [move(o.at)] : []), `[OB]::Scroll(${dx}, ${dy}, ${mods(o.mods)})`].join('; ')
        }
        case 'type':
            return `[OB]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(o.text, 'utf8').toString('base64')}')))`
        case 'key': {
            const { mods: held, key } = parseCombo(o.combo)
            const vk = KEY_VK[key] ?? `[OB]::VkFull([char]${key.codePointAt(0)})`
            const one = `[OB]::Combo(${mods(held)}, ${vk})`
            const repeat = within(o.repeat, 1, 100)
            return repeat > 1 ? `for ($i = 0; $i -lt ${repeat}; $i++) { ${one} }` : one
        }
    }
}

export type ChildLike = {
    stdin: Writable
    stdout: Readable
    stderr?: Readable
    on(event: 'exit' | 'close' | 'error', cb: (e?: unknown) => void): void
    kill(): void
}
export type SpawnFn = (scriptFile: string) => ChildLike

const realSpawn: SpawnFn = (file) => spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true }) as ChildLike

// A command that hasn't answered by then is treated as failed
const COMMAND_TIMEOUT_MS = 30_000

type Pending = { resolve: (out: string) => void; reject: (e: Error) => void }
// One run of the helper process and the commands waiting on it
type Session = { child: ChildLike; ready: Promise<void>; waiting: Map<number, Pending>; stderr: string; over: boolean; cleanup: () => void; rejectReady: (e: Error) => void }

// The helper process, started on first use and again if it exits, fails or hangs
export class PowerShell {
    private session: Session | null = null
    private next = 1
    private chain: Promise<unknown> = Promise.resolve()

    constructor(
        private spawnFn: SpawnFn = realSpawn,
        private timeoutMs = COMMAND_TIMEOUT_MS,
    ) {}

    // Ends a session once: startup and everything waiting on it fail, the process is killed, the script file goes
    private drop(s: Session, err: Error) {
        if (s.over) return
        s.over = true
        if (this.session === s) this.session = null
        s.cleanup()
        s.rejectReady(err)
        for (const p of s.waiting.values()) p.reject(err)
        s.waiting.clear()
        try {
            s.child.kill()
        } catch {
            // already gone
        }
    }

    private start(): Session {
        const file = join(tmpdir(), `openbots-computer-${process.pid}.ps1`)
        writeFileSync(file, HELPER_SCRIPT)
        const child = this.spawnFn(file)
        let resolveReady!: () => void
        let rejectReady!: (e: Error) => void
        const ready = new Promise<void>((resolve, reject) => {
            resolveReady = resolve
            rejectReady = reject
        })
        ready.catch(() => {})
        const cleanup = () => {
            clearTimeout(startTimer)
            try {
                unlinkSync(file)
            } catch {
                // already gone
            }
        }
        const s: Session = { child, ready, waiting: new Map(), stderr: '', over: false, cleanup, rejectReady }
        this.session = s
        const startTimer = setTimeout(() => closed('Windows didn’t start PowerShell in time'), this.timeoutMs)

        // A late event from a helper that's already over does nothing
        const closed = (why: string) => {
            const tail = s.stderr.trim()
            this.drop(s, new Error(`${why}${tail ? `: ${tail}` : ''}`))
        }
        child.stderr?.on('data', (chunk) => (s.stderr = (s.stderr + chunk.toString()).slice(-2048)))
        // 'exit' can come before the last output is read, so give 'close' a moment to arrive first
        child.on('exit', () => void setTimeout(() => closed('PowerShell closed'), 50))
        child.on('close', () => closed('PowerShell closed'))
        child.on('error', (e) => closed(`PowerShell closed (${e instanceof Error ? e.message : 'it failed to run'})`))
        child.stdin.on('error', (e) => closed(`PowerShell closed (${e instanceof Error ? e.message : 'it stopped listening'})`))

        const lines = createInterface({ input: child.stdout })
        lines.on('line', (raw) => {
            const line = raw.trimEnd()
            if (line === '@@OB ready') {
                cleanup()
                return resolveReady()
            }
            const m = line.match(/^@@OB (\d+) (ok|err) ?(.*)$/)
            if (!m) return
            const pending = s.waiting.get(Number(m[1]))
            if (!pending) return
            s.waiting.delete(Number(m[1]))
            if (m[2] === 'ok') pending.resolve(m[3])
            else pending.reject(new Error(m[3] || 'The command failed'))
        })
        return s
    }

    // Runs one line; calls queue so actions happen in order
    run(command: string): Promise<string> {
        const result = this.chain.then(async () => {
            const s = this.session ?? this.start()
            await s.ready
            const id = this.next++
            return new Promise<string>((resolve, reject) => {
                // A helper that stops answering is thrown away so the next command starts a fresh one
                const timer = setTimeout(() => this.drop(s, new Error('Windows didn’t answer in time')), this.timeoutMs)
                s.waiting.set(id, {
                    resolve: (out) => (clearTimeout(timer), resolve(out)),
                    reject: (e) => (clearTimeout(timer), reject(e)),
                })
                s.child.stdin.write(`${id} ${command}\n`)
            })
        })
        this.chain = result.catch(() => {})
        return result
    }

    close() {
        if (this.session) this.drop(this.session, new Error('PowerShell closed'))
    }
}

export class WindowsDriver implements Driver {
    constructor(private shell = new PowerShell()) {}
    private run = (o: WinOp) => this.shell.run(winCommand(o))
    async size() {
        return JSON.parse(await this.run({ op: 'size' })) as Size
    }
    async screenshot(target: Size) {
        return JSON.parse(await this.run({ op: 'shot', target })) as Shot
    }
    async click(at: Point | undefined, button: Button, count: number, held: Mod[]) {
        await this.run({ op: 'click', at, button, count, mods: held })
    }
    async move(at: Point) {
        await this.run({ op: 'move', at })
    }
    async drag(from: Point, to: Point, held: Mod[]) {
        await this.run({ op: 'drag', from, to, mods: held })
    }
    async scroll(at: Point | undefined, direction: Direction, amount: number, held: Mod[]) {
        await this.run({ op: 'scroll', at, direction, amount, mods: held })
    }
    async type(text: string) {
        await this.run({ op: 'type', text })
    }
    async key(combo: string, repeat: number) {
        await this.run({ op: 'key', combo, repeat })
    }
    async cursor() {
        return JSON.parse(await this.run({ op: 'cursor' })) as Point
    }
    // Windows needs no permission to see the screen or use the mouse
    async ready() {
        return null
    }
    close() {
        this.shell.close()
    }
}
