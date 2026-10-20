import { createRequire } from 'node:module'
import type { DatabaseSync, DatabaseSyncOptions } from 'node:sqlite'

export type { DatabaseSync }

// node:sqlite is loaded when a database is first opened instead of imported, so on a Node.js that lacks it the engine
// gets to say which version it needs (see nodeVersion.ts) instead of failing to load
export function openDatabase(path: string, options?: DatabaseSyncOptions): DatabaseSync {
    const sqlite = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    // DatabaseSync refuses an options argument that is undefined
    return options ? new sqlite.DatabaseSync(path, options) : new sqlite.DatabaseSync(path)
}
