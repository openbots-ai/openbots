import { DatabaseSync } from 'node:sqlite'
import { handleKey } from '../../convex/lib/handles'
import type { Vault } from './crypto'
import type { Channel } from './transports/types'

// Contacts, conversations and messages, kept only on the engine's machine. Names, numbers, notes and message
// text are encrypted with the Vault; numbers are found through a keyed fingerprint.

export type Contact = { id: number; handle: string; name: string; tags: string[]; notes: string }
export type Conversation = {
    id: number
    contactId: number
    agentId: string
    // The number the contact texted and its channel, so replies go out the same way
    number: string
    channel: Channel
    // Group chats: the channel's thread id and the group's name
    threadKey?: string
    title?: string
    lastAt: number
    // The contact message a reply is queued for, and when it's due
    pendingId: number | null
    dueAt: number | null
    // After a handoff the agent stays out until then
    pausedUntil: number | null
    needsYou: boolean
}
// `senderId` is the contact who wrote it, which matters in group chats
export type Message = { id: number; conversationId: number; from: 'contact' | 'agent'; senderId?: number; body: string; at: number; model?: string }

// A reminder or watch the owner asked for by text. `to` is the owner's handle; `number`/`channel` are what to text from.
export type Job = { id: number; kind: 'reminder' | 'watch'; agentId: string; to: string; number: string; channel: Channel; dueAt: number; everyMin: number | null; until: number | null; text: string; last: string | null; failures: number; createdAt: number }
type JobRow = { id: number; kind: Job['kind']; agent_id: string; recipient: string; number: string; channel: Channel; due_at: number; every_min: number | null; until: number | null; text: string; last: string | null; failures: number; created_at: number }

type ConversationRow = {
    id: number
    contact_id: number
    agent_id: string
    number: string
    channel: Channel
    thread_key: string | null
    title: string | null
    last_at: number
    pending_id: number | null
    due_at: number | null
    paused_until: number | null
    needs_you: number
}

export class Store {
    private db: DatabaseSync

    constructor(
        path: string,
        private vault: Vault,
    ) {
        this.db = new DatabaseSync(path)
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY, tag TEXT NOT NULL UNIQUE, handle TEXT NOT NULL, name TEXT NOT NULL, tags TEXT NOT NULL, notes TEXT NOT NULL, created_at INTEGER NOT NULL);
            -- thread_tag finds a group chat by a keyed fingerprint of its id; thread_key and title are sealed
            CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, contact_id INTEGER NOT NULL, agent_id TEXT NOT NULL, number TEXT NOT NULL, channel TEXT NOT NULL,
                thread_tag TEXT UNIQUE, thread_key TEXT, title TEXT, last_at INTEGER NOT NULL,
                pending_id INTEGER, due_at INTEGER, paused_until INTEGER, needs_you INTEGER NOT NULL DEFAULT 0);
            CREATE INDEX IF NOT EXISTS conversations_by_contact ON conversations (contact_id, agent_id);
            CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, sender TEXT NOT NULL, sender_id INTEGER, body TEXT NOT NULL, at INTEGER NOT NULL, model TEXT);
            CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, id);
            -- Which conversations were already counted as active on a day, for the daily counts sent to Convex
            CREATE TABLE IF NOT EXISTS counted (day TEXT NOT NULL, conversation_id INTEGER NOT NULL, PRIMARY KEY (day, conversation_id));
            -- Reminders and watches the owner asked for by text; recipient, text and last result are sealed
            CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, agent_id TEXT NOT NULL, recipient TEXT NOT NULL, number TEXT NOT NULL, channel TEXT NOT NULL,
                due_at INTEGER NOT NULL, every_min INTEGER, until INTEGER, text TEXT NOT NULL, last TEXT, failures INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS jobs_due ON jobs (active, due_at);
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `)
        // Contacts found by a key from before handleKey kept country codes are keyed again, once
        if (this.getMeta('contacts.keys') !== '2') {
            this.rekeyContacts()
            this.setMeta('contacts.keys', '2')
        }
    }

    private rekeyContacts() {
        for (const { id } of this.db.prepare('SELECT id FROM contacts').all() as { id: number }[]) {
            const key = handleKey(this.getContact(id)!.handle)
            if (!key) continue
            try {
                this.db.prepare('UPDATE contacts SET tag = ? WHERE id = ?').run(this.vault.tag(`contact:${key}`), id)
            } catch {
                // Another contact already has that key: keep this one as it was
            }
        }
    }

    close() {
        this.db.close()
    }

    // Finds a contact by their handle key (see convex/lib/handles), or makes one
    contact(key: string, make: () => { handle: string; name: string; tags: string[] }): { contact: Contact; isNew: boolean } {
        const tag = this.vault.tag(`contact:${key}`)
        const row = this.db.prepare('SELECT id FROM contacts WHERE tag = ?').get(tag) as { id: number } | undefined
        if (row) return { contact: this.getContact(row.id)!, isNew: false }
        const fresh = make()
        const id = Number(
            this.db.prepare('INSERT INTO contacts (tag, handle, name, tags, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(tag, '', '', '', '', Date.now()).lastInsertRowid,
        )
        this.saveContact({ id, notes: '', ...fresh })
        return { contact: this.getContact(id)!, isNew: true }
    }

    getContact(id: number): Contact | null {
        const row = this.db.prepare('SELECT handle, name, tags, notes FROM contacts WHERE id = ?').get(id) as { handle: string; name: string; tags: string; notes: string } | undefined
        if (!row) return null
        const open = (field: string, value: string) => this.vault.open(value, `contact:${id}:${field}`)
        return { id, handle: open('handle', row.handle), name: open('name', row.name), tags: JSON.parse(open('tags', row.tags)), notes: open('notes', row.notes) }
    }

    saveContact(c: Contact) {
        const seal = (field: string, value: string) => this.vault.seal(value, `contact:${c.id}:${field}`)
        this.db.prepare('UPDATE contacts SET handle = ?, name = ?, tags = ?, notes = ? WHERE id = ?').run(seal('handle', c.handle), seal('name', c.name), seal('tags', JSON.stringify(c.tags)), seal('notes', c.notes), c.id)
    }

    // Finds or starts the conversation: one per group chat, else one per contact and agent
    conversation(c: { contactId: number; agentId: string; number: string; channel: Channel; at: number; thread?: { key: string; title?: string } }): { conversation: Conversation; isNew: boolean } {
        const tag = c.thread ? this.vault.tag(`thread:${c.channel}:${c.thread.key}`) : null
        const row = (
            tag
                ? this.db.prepare('SELECT id FROM conversations WHERE thread_tag = ?').get(tag)
                : this.db.prepare('SELECT id FROM conversations WHERE contact_id = ? AND agent_id = ? AND thread_tag IS NULL').get(c.contactId, c.agentId)
        ) as { id: number } | undefined
        if (row) return { conversation: this.getConversation(row.id)!, isNew: false }
        const id = Number(
            this.db.prepare('INSERT INTO conversations (contact_id, agent_id, number, channel, thread_tag, last_at) VALUES (?, ?, ?, ?, ?, ?)').run(c.contactId, c.agentId, c.number, c.channel, tag, c.at).lastInsertRowid,
        )
        if (c.thread) {
            this.db.prepare('UPDATE conversations SET thread_key = ?, title = ? WHERE id = ?').run(this.vault.seal(c.thread.key, `conversation:${id}:thread`), c.thread.title ? this.vault.seal(c.thread.title, `conversation:${id}:title`) : null, id)
        }
        return { conversation: this.getConversation(id)!, isNew: true }
    }

    getConversation(id: number): Conversation | null {
        const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
        if (!r) return null
        return {
            id: r.id,
            contactId: r.contact_id,
            agentId: r.agent_id,
            number: r.number,
            channel: r.channel,
            threadKey: r.thread_key ? this.vault.open(r.thread_key, `conversation:${id}:thread`) : undefined,
            title: r.title ? this.vault.open(r.title, `conversation:${id}:title`) : undefined,
            lastAt: r.last_at,
            pendingId: r.pending_id,
            dueAt: r.due_at,
            pausedUntil: r.paused_until,
            needsYou: !!r.needs_you,
        }
    }

    updateConversation(id: number, patch: Partial<Pick<Conversation, 'number' | 'channel' | 'lastAt' | 'pendingId' | 'dueAt' | 'pausedUntil' | 'needsYou'>>) {
        const columns: Record<string, string> = { number: 'number', channel: 'channel', lastAt: 'last_at', pendingId: 'pending_id', dueAt: 'due_at', pausedUntil: 'paused_until', needsYou: 'needs_you' }
        for (const [k, v] of Object.entries(patch)) {
            this.db.prepare(`UPDATE conversations SET ${columns[k]} = ? WHERE id = ?`).run(typeof v === 'boolean' ? Number(v) : (v ?? null), id)
        }
    }

    // Replies that were queued when the engine stopped, to pick back up on start
    pending(): Conversation[] {
        const rows = this.db.prepare('SELECT id FROM conversations WHERE pending_id IS NOT NULL').all() as { id: number }[]
        return rows.map((r) => this.getConversation(r.id)!)
    }

    addMessage(conversationId: number, from: Message['from'], body: string, at: number, extra: { model?: string; senderId?: number } = {}) {
        const id = Number(
            this.db.prepare('INSERT INTO messages (conversation_id, sender, sender_id, body, at, model) VALUES (?, ?, ?, ?, ?, ?)').run(conversationId, from, extra.senderId ?? null, '', at, extra.model ?? null).lastInsertRowid,
        )
        this.db.prepare('UPDATE messages SET body = ? WHERE id = ?').run(this.vault.seal(body, `message:${id}:${conversationId}:${from}`), id)
        return id
    }

    // The latest `limit` messages, oldest first
    history(conversationId: number, limit: number): Message[] {
        const rows = this.db.prepare('SELECT id, sender, sender_id, body, at, model FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').all(conversationId, limit) as {
            id: number
            sender: Message['from']
            sender_id: number | null
            body: string
            at: number
            model: string | null
        }[]
        return rows.reverse().map((r) => ({
            id: r.id,
            conversationId,
            from: r.sender,
            senderId: r.sender_id ?? undefined,
            body: this.vault.open(r.body, `message:${r.id}:${conversationId}:${r.sender}`),
            at: r.at,
            model: r.model ?? undefined,
        }))
    }

    // True the first time a conversation is seen on `day`
    countOnce(day: string, conversationId: number) {
        return this.db.prepare('INSERT OR IGNORE INTO counted (day, conversation_id) VALUES (?, ?)').run(day, conversationId).changes > 0
    }

    getMeta(key: string) {
        return (this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value
    }

    setMeta(key: string, value: string) {
        this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    }

    // For values that are yours to keep private, like a computer task's text
    getSealedMeta(key: string) {
        const value = this.getMeta(key)
        return value === undefined ? undefined : this.vault.open(value, `meta:${key}`)
    }

    setSealedMeta(key: string, value: string) {
        this.setMeta(key, this.vault.seal(value, `meta:${key}`))
    }

    deleteMeta(key: string) {
        this.db.prepare('DELETE FROM meta WHERE key = ?').run(key)
    }

    // Watches check at most every 30 minutes. The row stays inactive until its text is sealed, so a crash can't leave a blank job running.
    addJob(j: Omit<Job, 'id' | 'last' | 'failures' | 'createdAt'>) {
        const everyMin = j.kind === 'watch' && j.everyMin !== null ? Math.max(j.everyMin, 30) : j.everyMin
        const id = Number(
            this.db
                .prepare('INSERT INTO jobs (kind, agent_id, recipient, number, channel, due_at, every_min, until, text, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
                .run(j.kind, j.agentId, '', j.number, j.channel, j.dueAt, everyMin, j.until, '', Date.now()).lastInsertRowid,
        )
        this.db.prepare('UPDATE jobs SET recipient = ?, text = ?, active = 1 WHERE id = ?').run(this.vault.seal(j.to, `job:${id}:to`), this.vault.seal(j.text, `job:${id}:text`), id)
        return id
    }

    private toJob(r: JobRow): Job {
        return {
            id: r.id,
            kind: r.kind,
            agentId: r.agent_id,
            to: this.vault.open(r.recipient, `job:${r.id}:to`),
            number: r.number,
            channel: r.channel,
            dueAt: r.due_at,
            everyMin: r.every_min,
            until: r.until,
            text: this.vault.open(r.text, `job:${r.id}:text`),
            last: r.last ? this.vault.open(r.last, `job:${r.id}:last`) : null,
            failures: r.failures,
            createdAt: r.created_at,
        }
    }

    // A row that can't be opened is skipped (and noted by id only) so one bad job can't block the rest
    private openJobs(rows: JobRow[]): Job[] {
        const jobs: Job[] = []
        for (const r of rows) {
            try {
                jobs.push(this.toJob(r))
            } catch {
                console.error(`Skipping job ${r.id}: it could not be opened`)
            }
        }
        return jobs
    }

    // Reminders first, since they're quick and were asked for at a time; then watches
    dueJobs(now: number): Job[] {
        return this.openJobs(this.db.prepare("SELECT * FROM jobs WHERE active = 1 AND due_at <= ? ORDER BY kind = 'watch', due_at LIMIT 20").all(now) as JobRow[])
    }

    jobsFor(agentId: string): Job[] {
        return this.openJobs(this.db.prepare('SELECT * FROM jobs WHERE active = 1 AND agent_id = ? ORDER BY due_at').all(agentId) as JobRow[])
    }

    updateJob(id: number, patch: { dueAt?: number; until?: number; last?: string; failures?: number; active?: boolean }) {
        if (patch.dueAt !== undefined) this.db.prepare('UPDATE jobs SET due_at = ? WHERE id = ?').run(patch.dueAt, id)
        if (patch.until !== undefined) this.db.prepare('UPDATE jobs SET until = ? WHERE id = ?').run(patch.until, id)
        if (patch.last !== undefined) this.db.prepare('UPDATE jobs SET last = ? WHERE id = ?').run(this.vault.seal(patch.last, `job:${id}:last`), id)
        if (patch.failures !== undefined) this.db.prepare('UPDATE jobs SET failures = ? WHERE id = ?').run(patch.failures, id)
        if (patch.active !== undefined) this.db.prepare('UPDATE jobs SET active = ? WHERE id = ?').run(patch.active ? 1 : 0, id)
    }

    // Only the agent that owns it can cancel it
    cancelJob(id: number, agentId: string) {
        return this.db.prepare('UPDATE jobs SET active = 0 WHERE id = ? AND agent_id = ? AND active = 1').run(id, agentId).changes > 0
    }

    // Which agents have jobs due on which channels (no text), so the heartbeat can report ones stuck waiting for a channel
    dueChannels(now: number) {
        const rows = this.db.prepare('SELECT DISTINCT agent_id, channel FROM jobs WHERE active = 1 AND due_at <= ?').all(now) as { agent_id: string; channel: Channel }[]
        return rows.map((r) => ({ agentId: r.agent_id, channel: r.channel }))
    }

    jobCounts() {
        const rows = this.db.prepare("SELECT agent_id, SUM(kind = 'reminder') AS reminders, SUM(kind = 'watch') AS watches FROM jobs WHERE active = 1 GROUP BY agent_id").all() as { agent_id: string; reminders: number; watches: number }[]
        return rows.map((r) => ({ agentId: r.agent_id, reminders: Number(r.reminders), watches: Number(r.watches) }))
    }
}
