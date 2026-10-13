import { DatabaseSync } from 'node:sqlite'
import type { Vault } from './crypto'

// Contacts, conversations and messages, kept only on the agent's machine. Names, numbers, notes and message
// text are encrypted with the Vault; numbers are found through a keyed fingerprint.

export type Contact = { id: number; handle: string; name: string; tags: string[]; notes: string }
export type Conversation = {
    id: number
    contactId: number
    agentId: string
    // The iMessage number the contact texted, so replies go out from the same one
    number: string
    lastAt: number
    // The contact message a reply is queued for, and when it's due
    pendingId: number | null
    dueAt: number | null
    // After a handoff the agent stays out until then
    pausedUntil: number | null
    needsYou: boolean
}
export type Message = { id: number; conversationId: number; from: 'contact' | 'agent'; body: string; at: number; model?: string }

type ConversationRow = { id: number; contact_id: number; agent_id: string; number: string; last_at: number; pending_id: number | null; due_at: number | null; paused_until: number | null; needs_you: number }

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
            CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, contact_id INTEGER NOT NULL, agent_id TEXT NOT NULL, number TEXT NOT NULL, last_at INTEGER NOT NULL,
                pending_id INTEGER, due_at INTEGER, paused_until INTEGER, needs_you INTEGER NOT NULL DEFAULT 0, UNIQUE (contact_id, agent_id));
            CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL, at INTEGER NOT NULL, model TEXT);
            CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, id);
            -- Which conversations were already counted as active on a day, for the daily counts sent to Convex
            CREATE TABLE IF NOT EXISTS counted (day TEXT NOT NULL, conversation_id INTEGER NOT NULL, PRIMARY KEY (day, conversation_id));
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        `)
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

    conversation(contactId: number, agentId: string, number: string, at: number): { conversation: Conversation; isNew: boolean } {
        const row = this.db.prepare('SELECT id FROM conversations WHERE contact_id = ? AND agent_id = ?').get(contactId, agentId) as { id: number } | undefined
        if (row) return { conversation: this.getConversation(row.id)!, isNew: false }
        const id = Number(this.db.prepare('INSERT INTO conversations (contact_id, agent_id, number, last_at) VALUES (?, ?, ?, ?)').run(contactId, agentId, number, at).lastInsertRowid)
        return { conversation: this.getConversation(id)!, isNew: true }
    }

    getConversation(id: number): Conversation | null {
        const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
        return r
            ? { id: r.id, contactId: r.contact_id, agentId: r.agent_id, number: r.number, lastAt: r.last_at, pendingId: r.pending_id, dueAt: r.due_at, pausedUntil: r.paused_until, needsYou: !!r.needs_you }
            : null
    }

    updateConversation(id: number, patch: Partial<Pick<Conversation, 'number' | 'lastAt' | 'pendingId' | 'dueAt' | 'pausedUntil' | 'needsYou'>>) {
        const columns: Record<string, string> = { number: 'number', lastAt: 'last_at', pendingId: 'pending_id', dueAt: 'due_at', pausedUntil: 'paused_until', needsYou: 'needs_you' }
        for (const [k, v] of Object.entries(patch)) {
            this.db.prepare(`UPDATE conversations SET ${columns[k]} = ? WHERE id = ?`).run(typeof v === 'boolean' ? Number(v) : (v ?? null), id)
        }
    }

    // Replies that were queued when the agent stopped, to pick back up on start
    pending(): Conversation[] {
        const rows = this.db.prepare('SELECT id FROM conversations WHERE pending_id IS NOT NULL').all() as { id: number }[]
        return rows.map((r) => this.getConversation(r.id)!)
    }

    addMessage(conversationId: number, from: Message['from'], body: string, at: number, model?: string) {
        const id = Number(this.db.prepare('INSERT INTO messages (conversation_id, sender, body, at, model) VALUES (?, ?, ?, ?, ?)').run(conversationId, from, '', at, model ?? null).lastInsertRowid)
        this.db.prepare('UPDATE messages SET body = ? WHERE id = ?').run(this.vault.seal(body, `message:${id}:${conversationId}:${from}`), id)
        return id
    }

    // The latest `limit` messages, oldest first
    history(conversationId: number, limit: number): Message[] {
        const rows = this.db.prepare('SELECT id, sender, body, at, model FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').all(conversationId, limit) as {
            id: number
            sender: Message['from']
            body: string
            at: number
            model: string | null
        }[]
        return rows.reverse().map((r) => ({ id: r.id, conversationId, from: r.sender, body: this.vault.open(r.body, `message:${r.id}:${conversationId}:${r.sender}`), at: r.at, model: r.model ?? undefined }))
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
}
