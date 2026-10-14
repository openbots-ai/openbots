import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
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
    [DllImport("user32.dll")] static extern short VkKeyScan(char c);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();

    static void Send(params INPUT[] inputs) {
        if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length) throw new Exception("Windows blocked the input");
    }
    static INPUT Mouse(uint flags, uint data) { var i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; return i; }
    static INPUT Key(ushort vk, bool up) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.dwFlags = up ? 2u : 0u; return i; }
    static INPUT Unicode(char c, bool up) { var i = new INPUT(); i.type = 1; i.u.ki.wScan = c; i.u.ki.dwFlags = up ? 6u : 4u; return i; }

    public static string Size() { var b = Screen.PrimaryScreen.Bounds; return "{\"width\":" + b.Width + ",\"height\":" + b.Height + "}"; }
    public static string Cursor() { POINT p; GetCursorPos(out p); return "{\"x\":" + p.X + ",\"y\":" + p.Y + "}"; }
    public static void Move(int x, int y) { SetCursorPos(x, y); }
    // 0 left, 1 right, 2 middle
    public static void Click(int button, int count) {
        uint down = button == 1 ? 0x0008u : button == 2 ? 0x0020u : 0x0002u;
        uint up = button == 1 ? 0x0010u : button == 2 ? 0x0040u : 0x0004u;
        for (int i = 0; i < count; i++) Send(Mouse(down, 0), Mouse(up, 0));
    }
    public static void Down() { Send(Mouse(0x0002, 0)); }
    public static void Up() { Send(Mouse(0x0004, 0)); }
    // Wheel notches: dy > 0 scrolls up, dx > 0 scrolls right
    public static void Scroll(int dx, int dy) {
        if (dy != 0) Send(Mouse(0x0800, unchecked((uint)(dy * 120))));
        if (dx != 0) Send(Mouse(0x1000, unchecked((uint)(dx * 120))));
    }
    // Presses (or releases, in reverse order) the modifier keys
    public static void Hold(ushort[] mods, bool up) {
        var keys = (ushort[])mods.Clone();
        if (up) Array.Reverse(keys);
        foreach (var k in keys) Send(Key(k, up));
    }
    public static void Combo(ushort[] mods, ushort vk) { Hold(mods, false); Send(Key(vk, false), Key(vk, true)); Hold(mods, true); }
    public static ushort Vk(char c) { short s = VkKeyScan(c); if (s == -1) throw new Exception("There's no key for " + c); return (ushort)(s & 0xff); }
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
        [Console]::Out.WriteLine("@@OB $id err " + ($_.Exception.Message -replace "\r?\n", ' '))
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

const mods = (list: Mod[]) => `[uint16[]]@(${list.map((m) => MOD_VK[m]).join(',')})`
const move = (p: Point) => `[OB]::Move(${Math.round(p.x)}, ${Math.round(p.y)})`
// Runs `body` with the modifiers held
const holding = (list: Mod[], body: string[]) => (list.length ? [`[OB]::Hold(${mods(list)}, $false)`, ...body, `[OB]::Hold(${mods(list)}, $true)`] : body)

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
            return `[OB]::Shot(${o.target.width}, ${o.target.height})`
        case 'move':
            return move(o.at)
        case 'click':
            return [...(o.at ? [move(o.at)] : []), ...holding(o.mods, [`[OB]::Click(${BUTTON[o.button]}, ${o.count})`])].join('; ')
        case 'drag':
            return [move(o.from), ...holding(o.mods, ['[OB]::Down()', move(o.to), '[OB]::Up()'])].join('; ')
        case 'scroll': {
            const n = Math.round(o.amount)
            const [dx, dy] = o.direction === 'up' ? [0, n] : o.direction === 'down' ? [0, -n] : o.direction === 'left' ? [-n, 0] : [n, 0]
            return [...(o.at ? [move(o.at)] : []), ...holding(o.mods, [`[OB]::Scroll(${dx}, ${dy})`])].join('; ')
        }
        case 'type':
            return `[OB]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(o.text, 'utf8').toString('base64')}')))`
        case 'key': {
            const { mods: held, key } = parseCombo(o.combo)
            const vk = KEY_VK[key] ?? `[OB]::Vk([char]${key.codePointAt(0)})`
            const one = `[OB]::Combo(${mods(held)}, ${vk})`
            return o.repeat > 1 ? `for ($i = 0; $i -lt ${o.repeat}; $i++) { ${one} }` : one
        }
    }
}

export type ChildLike = { stdin: Writable; stdout: Readable; on(event: 'exit', cb: () => void): void; kill(): void }
export type SpawnFn = (scriptFile: string) => ChildLike

const realSpawn: SpawnFn = (file) => spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true }) as ChildLike

// A command that hasn't answered by then is treated as failed
const COMMAND_TIMEOUT_MS = 30_000

// The helper process, started on first use and again if it exits
export class PowerShell {
    private child: ChildLike | null = null
    private ready: Promise<void> | null = null
    private waiting = new Map<number, { resolve: (out: string) => void; reject: (e: Error) => void }>()
    private next = 1
    private chain: Promise<unknown> = Promise.resolve()

    constructor(private spawnFn: SpawnFn = realSpawn) {}

    private start() {
        const file = join(tmpdir(), `openbots-computer-${process.pid}.ps1`)
        writeFileSync(file, HELPER_SCRIPT)
        const child = this.spawnFn(file)
        this.child = child
        this.ready = new Promise((resolve, reject) => {
            const lines = createInterface({ input: child.stdout })
            lines.on('line', (raw) => {
                const line = raw.trimEnd()
                if (line === '@@OB ready') return resolve()
                const m = line.match(/^@@OB (\d+) (ok|err) ?(.*)$/)
                if (!m) return
                const pending = this.waiting.get(Number(m[1]))
                if (!pending) return
                this.waiting.delete(Number(m[1]))
                if (m[2] === 'ok') pending.resolve(m[3])
                else pending.reject(new Error(m[3] || 'The command failed'))
            })
            child.on('exit', () => {
                reject(new Error('PowerShell closed'))
                for (const p of this.waiting.values()) p.reject(new Error('PowerShell closed'))
                this.waiting.clear()
                this.child = null
                this.ready = null
            })
        })
    }

    // Runs one line; calls queue so actions happen in order
    run(command: string): Promise<string> {
        const result = this.chain.then(async () => {
            if (!this.child) this.start()
            await this.ready
            const id = this.next++
            return new Promise<string>((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.waiting.delete(id)
                    reject(new Error('Windows didn’t answer in time'))
                }, COMMAND_TIMEOUT_MS)
                this.waiting.set(id, {
                    resolve: (out) => (clearTimeout(timer), resolve(out)),
                    reject: (e) => (clearTimeout(timer), reject(e)),
                })
                this.child!.stdin.write(`${id} ${command}\n`)
            })
        })
        this.chain = result.catch(() => {})
        return result
    }

    close() {
        this.child?.kill()
        this.child = null
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
