import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, ArrowUp, MessagesSquare } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { DAY } from '@convex/lib/stats'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { useRun } from '../use-run'
import { AgentAvatar, Btn, EmptyState, Initials, NotFound, SearchInput } from '../ui'
import { useNow } from '../use-now'

// Shared by Conversations (everything) and Live (activity in the last 24h)
export function ConversationsView({ id, live = false }: { id?: string; live?: boolean }) {
    const go = useNav()
    const now = useNow()
    const [since] = useState(() => (live ? Date.now() - DAY : undefined))
    const conversations = useQuery(api.conversations.list, { since })
    const [q, setQ] = useState('')
    const view = live ? 'live' : 'conversations'
    const shown = conversations?.filter((c) => matches(q, c.contactName, c.agentName, c.lastMessage))

    return (
        <>
            <aside className={cn('w-full shrink-0 flex-col border-r border-neutral-200/70 md:flex md:w-80', id ? 'hidden' : 'flex')}>
                <div className="flex h-14 items-center justify-between gap-2 border-b border-neutral-200/70 px-4">
                    <h1 className="text-[15px] font-semibold">{live ? 'Live' : 'Conversations'}</h1>
                    {live && (
                        <Badge variant="outline" className="gap-1.5 border-emerald-600/15 bg-emerald-50 text-[11px] font-normal text-emerald-700">
                            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Last 24 hours
                        </Badge>
                    )}
                </div>
                <div className="p-2">
                    <SearchInput value={q} onChange={setQ} className="w-full" />
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {shown === undefined ? (
                        Array.from({ length: 6 }, (_, i) => <li key={i} className="mx-3 my-3"><Skeleton className="h-9" /></li>)
                    ) : shown.length === 0 ? (
                        <li className="px-4 py-10 text-center text-[13px] text-neutral-400">{q ? 'No matches.' : live ? 'Nothing in the last 24 hours.' : 'No conversations yet.'}</li>
                    ) : (
                        shown.map((c) => (
                            <li key={c._id}>
                                <Button
                                    variant="ghost"
                                    onClick={() => go(view, c._id)}
                                    aria-current={c._id === id ? 'true' : undefined}
                                    className={cn('h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal whitespace-normal active:scale-100', c._id === id && 'bg-neutral-100 hover:bg-neutral-100')}
                                >
                                    <Initials name={c.contactName} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex justify-between gap-2">
                                            <span className="truncate text-[13px] font-medium">{c.contactName}</span>
                                            <span className="shrink-0 text-[11px] text-neutral-400">{relativeTime(c.lastAt, now)}</span>
                                        </span>
                                        <span className="block truncate text-[12px] text-neutral-500">
                                            {c.agentName}: {c.lastMessage}
                                        </span>
                                    </span>
                                </Button>
                            </li>
                        ))
                    )}
                </ul>
            </aside>
            <section className={cn('min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden md:flex')}>
                {id ? (
                    <Thread key={id} id={id} onBack={() => go(view)} />
                ) : (
                    <EmptyState icon={MessagesSquare} title="Pick a conversation" body="Messages between your agents and the people texting them show up here." />
                )}
            </section>
        </>
    )
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
    const run = useRun()
    const data = useQuery(api.conversations.thread, { id })
    const send = useMutation(api.conversations.send)
    const [text, setText] = useState('')
    const endRef = useRef<HTMLDivElement>(null)
    const count = data?.messages.length

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [count])

    if (data === undefined) return <div className="flex-1 animate-pulse bg-neutral-50/50" />
    if (data === null) return <NotFound what="conversation" onBack={onBack} />
    const { conversation, contact, agent, messages } = data

    const submit = async () => {
        const body = text.trim()
        if (!body) return
        setText('')
        const res = await run(send({ id: conversation._id, body }))
        if (!res.ok) setText(body)
    }

    return (
        <>
            <div className="flex h-14 items-center gap-3 border-b border-neutral-200/70 px-4">
                <Btn variant="ghost" size="icon-sm" aria-label="Back" onClick={onBack} className="text-neutral-500 md:hidden">
                    <ArrowLeft />
                </Btn>
                <Initials name={contact.name} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{contact.name}</p>
                    <p className="truncate text-[11px] text-neutral-500">{contact.handle}</p>
                </div>
                <span className="flex items-center gap-2 text-[12px] text-neutral-500">
                    <AgentAvatar agent={agent} size={22} />
                    {agent.name}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto bg-neutral-50/60 px-4 py-4">
                <div className="mx-auto max-w-2xl space-y-1.5">
                    {messages.map((m) => (
                        <div key={m._id} className={cn('flex', m.from === 'agent' ? 'justify-end' : 'justify-start')}>
                            <div title={new Date(m.at).toLocaleString()} className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug', m.from === 'agent' ? 'bg-[#0a84ff] text-white' : 'bg-neutral-200/80 text-neutral-900')}>
                                {m.body}
                            </div>
                        </div>
                    ))}
                    <div ref={endRef} />
                </div>
            </div>
            <div className="border-t border-neutral-200/70 p-3">
                <div className="mx-auto flex max-w-2xl items-end gap-2">
                    <Textarea
                        rows={1}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void submit()
                            }
                        }}
                        aria-label={`Reply as ${agent.name}`}
                        placeholder={`Reply as ${agent.name}`}
                        className="max-h-32 min-h-9 flex-1 resize-none rounded-2xl px-3.5 py-2 text-[14px] md:text-[14px]"
                    />
                    <Button size="icon" aria-label="Send" disabled={!text.trim()} onClick={submit} className="disabled:bg-neutral-200 disabled:opacity-100">
                        <ArrowUp />
                    </Button>
                </div>
            </div>
        </>
    )
}
