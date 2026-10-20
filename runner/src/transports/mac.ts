import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { openDatabase, type DatabaseSync } from '../sqlite'
import type { Store } from '../store'
import type { OnText, Outgoing, Transport } from './types'

const run = promisify(execFile)

// Runs on the Mac signed in to iMessage: reads new texts from the Messages database and sends replies through
// the Messages app. Needs Full Disk Access (to read ~/Library/Messages) and permission to control Messages.
// One-to-one chats only; group chats are left alone. No typing bubble or read receipts: Messages can't script them.

type Row = { id: number; text: string | null; body: Uint8Array | null; sender: string; dest: string | null; service: string | null }

const POLL_MS = 2_000

// Newer macOS versions keep the text only in `attributedBody`, an archived NSAttributedString. The string follows
// the NSString class marker as a length-prefixed UTF-8 run.
export function textFromAttributedBody(blob: Uint8Array): string | null {
    const buf = Buffer.from(blob)
    const marker = buf.indexOf('NSString')
    if (marker < 0) return null
    let p = buf.indexOf(0x2b, marker) // '+' starts the string
    if (p < 0) return null
    p++
    let length = buf[p++]
    if (length === 0x81) {
        length = buf.readUInt16LE(p)
        p += 2
    } else if (length === 0x82) {
        length = buf.readUInt32LE(p)
        p += 4
    }
    return buf.subarray(p, p + length).toString('utf8') || null
}

// Messages records which of your addresses a text went to as e.g. "+14155550101" or "e:you@icloud.com"
const cleanAddress = (dest: string | null) => dest?.replace(/^[ep]:/, '') || null

export class MacTransport implements Transport {
    readonly channel = 'mac'
    private db?: DatabaseSync
    private timer?: NodeJS.Timeout
    private stopped = false
    // The poll under way, so stop can wait for a text still being answered
    private polling?: Promise<void>

    constructor(
        private store: Store,
        private path = join(homedir(), 'Library/Messages/chat.db'),
    ) {}

    async start(onText: OnText) {
        try {
            this.db = openDatabase(this.path, { readOnly: true })
        } catch {
            throw new Error(`Can't open ${this.path}. Give the app running the engine Full Disk Access in System Settings → Privacy & Security.`)
        }
        // First run starts from now, so old history isn't answered
        if (!this.store.getMeta('mac.lastRowId')) {
            const { max } = this.db.prepare('SELECT COALESCE(MAX(ROWID), 0) AS max FROM message').get() as { max: number }
            this.store.setMeta('mac.lastRowId', String(max))
        }
        const poll = async () => {
            for (const row of this.newTexts()) {
                if (this.stopped) return
                const body = row.text ?? (row.body ? textFromAttributedBody(row.body) : null)
                if (body?.trim()) await onText({ channel: 'mac', to: cleanAddress(row.dest) ?? undefined, from: row.sender, body, ...(row.service === 'iMessage' ? {} : { sms: true }) }).catch((e) => console.error(`Skipped a text: ${e instanceof Error ? e.message : e}`))
                this.store.setMeta('mac.lastRowId', String(row.id))
            }
        }
        // One poll at a time, the next armed only while running; the first one's error reaches start
        const tick = () => {
            this.polling = poll().finally(() => {
                this.polling = undefined
                if (!this.stopped) this.timer = setTimeout(() => void tick().catch((e) => console.error(`Couldn't read Messages: ${e instanceof Error ? e.message : e}`)), POLL_MS)
            })
            return this.polling
        }
        await tick()
    }

    private newTexts(): Row[] {
        // style 45 is a one-to-one chat; item_type 0 is a normal message (not a tapback, rename or the like). `service`
        // says iMessage or SMS (texts your iPhone forwards to this Mac): only iMessage vouches for who sent it.
        return this.db!.prepare(
            `SELECT m.ROWID AS id, m.text AS text, m.attributedBody AS body, h.id AS sender, m.destination_caller_id AS dest, m.service AS service
             FROM message m
             JOIN handle h ON h.ROWID = m.handle_id
             JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
             JOIN chat c ON c.ROWID = cmj.chat_id
             WHERE m.ROWID > ? AND m.is_from_me = 0 AND m.item_type = 0 AND c.style = 45
             ORDER BY m.ROWID LIMIT 50`,
        ).all(Number(this.store.getMeta('mac.lastRowId') ?? 0)) as Row[]
    }

    // Arguments go to AppleScript as argv, never spliced into the script, so a text can't run commands
    async send({ to, body }: Outgoing) {
        await run('osascript', [
            '-e',
            'on run argv',
            '-e',
            'tell application "Messages" to send (item 2 of argv) to participant (item 1 of argv) of (1st account whose service type = iMessage)',
            '-e',
            'end run',
            '--',
            to,
            body,
        ], { timeout: 60_000 })
    }

    // Waits for a text still being answered, so its place is saved and nothing reads the database once it's closed
    async stop() {
        this.stopped = true
        clearTimeout(this.timer)
        await this.polling?.catch(() => {})
        this.db?.close()
        this.db = undefined
    }
}
