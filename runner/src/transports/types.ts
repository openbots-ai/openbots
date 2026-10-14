import type { Doc } from '../../../convex/_generated/dataModel'

// How the engine talks to people. Plain text exists only here and on their phones.

export type Channel = Doc<'numbers'>['channel']

export type Incoming = {
    channel: Channel
    // Which of your numbers it was sent to, when the channel says (a BlueBubbles Mac has just one address)
    to?: string
    from: string
    body: string
    name?: string
    // Group chats: the channel's thread id and the group's name
    thread?: { key: string; title?: string }
}

// `threadKey` sends to a group instead of to one person
export type Outgoing = { from: string; to: string; body: string; threadKey?: string }

// An address a channel answers on, offered when adding a number in the dashboard
export type Line = { channel: Channel; handle: string; externalId?: string }

export type OnText = (text: Incoming) => Promise<{ markRead: boolean }>

export interface Transport {
    channel: Channel
    // Starts listening; for webhook channels this registers routes on the engine's server
    start(onText: OnText): Promise<void>
    send(message: Outgoing): Promise<void>
    // Shows the typing bubble, where the channel can
    typing?(target: Omit<Outgoing, 'body'>): Promise<void>
    // The addresses this channel answers on
    lines?(): Promise<Line[]>
    stop(): Promise<void>
}
