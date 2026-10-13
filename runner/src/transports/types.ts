// How the agent talks to iMessage. Plain text exists only here and on the contact's phone (iMessage itself is
// end-to-end encrypted between them).
export type Incoming = { to: string; from: string; body: string; name?: string }
// `from` is which of your numbers to send from (null lets the transport pick)
export type Outgoing = { from: string | null; to: string; body: string }

export interface Transport {
    name: 'mac' | 'relay'
    // Calls `onText` for each new text; its answer says whether to send a read receipt (where supported)
    start(onText: (text: Incoming) => Promise<{ markRead: boolean }>): Promise<void>
    send(message: Outgoing): Promise<void>
    // Shows the typing bubble, where the transport can
    typing?(target: Omit<Outgoing, 'body'>): Promise<void>
    stop(): Promise<void>
}
