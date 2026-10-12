import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { AlertTriangle, ArrowLeft, ArrowUp, FlaskConical, MessagesSquare } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { BRAIN_MODELS } from '@convex/lib/models'
import { DAY } from '@convex/lib/stats'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useNav } from '../nav'
import { TestTextDialog } from '../test-text'
import { useRun } from '../use-run'
import { AgentAvatar, Btn, ConfirmDelete, EmptyState, Initials, NotFound, SearchInput } from '../ui'
import { useNow } from '../use-now'

type Filter = 'all' | 'needsYou'

// Shared by Conversations (everything) and Live (activity in the last 24h)
export function ConversationsView({ id, live = false }: { id?: string; live?: boolean }) {
    const go = useNav()
    const now = useNow()
    const [since] = useState(() => (live ? Date.now() - DAY : undefined))
    const [filter, setFilter] = useState<Filter>('all')
    const conversations = useQuery(api.conversations.list, { since, needsYou: filter === 'needsYou' || undefined })
    const waiting = useQuery(api.conversations.needsYouCount)
    const [q, setQ] = useState('')
    const [testing, setTesting] = useState(false)
    const view = live ? 'live' : 'conversations'
    const shown = conversations?.filter((c) => matches(q, c.contactName, c.agentName, c.lastMessage))

    return (
        <>
            <aside className={cn('w-full shrink-0 flex-col border-r border-neutral-200/70 md:flex md:w-80', id ? 'hidden' : 'flex')}>
                <div className="flex h-14 items-center justify-between gap-2 border-b border-neutral-200/70 px-4">
                    <h1 className="text-[15px] font-semibold">{live ? 'Live' : 'Conversations'}</h1>
                    <span className="flex items-center gap-1.5">
                        {live && (
                            <Badge variant="outline" className="gap-1.5 border-emerald-600/15 bg-emerald-50 text-[11px] font-normal text-emerald-700">
                                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                Last 24 hours
                            </Badge>
                        )}
                        <Btn variant="ghost" size="icon-sm" aria-label="Test a text" title="Test a text" onClick={() => setTesting(true)} className="text-neutral-500">
                            <FlaskConical />
                        </Btn>
                    </span>
                </div>
                <div className="space-y-2 p-2">
                    {!live && (
                        <ToggleGroup value={[filter]} onValueChange={(v: string[]) => v[0] && setFilter(v[0] as Filter)} variant="outline" size="sm" className="w-full">
                            <ToggleGroupItem value="all" className="flex-1 text-[12px]">
                                All
                            </ToggleGroupItem>
                            <ToggleGroupItem value="needsYou" className="flex-1 text-[12px]">
                                Needs you{waiting ? ` (${waiting > 99 ? '99+' : waiting})` : ''}
                            </ToggleGroupItem>
                        </ToggleGroup>
                    )}
                    <SearchInput value={q} onChange={setQ} className="w-full" />
                </div>
                <ul className="flex-1 overflow-y-auto">
                    {shown === undefined ? (
                        Array.from({ length: 6 }, (_, i) => <li key={i} className="mx-3 my-3"><Skeleton className="h-9" /></li>)
                    ) : shown.length === 0 ? (
                        <li className="px-4 py-10 text-center text-[13px] text-neutral-400">
                            {q ? 'No matches.' : filter === 'needsYou' ? 'Nothing is waiting on you.' : live ? 'Nothing in the last 24 hours.' : 'No conversations yet. Texts to your iMessage numbers show up here.'}
                        </li>
                    ) : (
                        shown.map((c) => (
                            <li key={c._id}>
                                <Button
                                    variant="ghost"
                                    onClick={() => go(view, c._id)}
                                    aria-current={c._id === id ? 'true' : undefined}
                                    className={cn('h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal whitespace-normal active:scale-100', c._id === id && 'bg-neutral-100 hover:bg-neutral-100')}
                                >
                                    <Initials name={c.title ?? c.contactName} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <span className="truncate text-[13px] font-medium">{c.title ?? c.contactName}</span>
                                                {c.test && <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">Test</Badge>}
                                                {c.needsYou && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Needs you" />}
                                            </span>
                                            <span className="shrink-0 text-[11px] text-neutral-400">{relativeTime(c.lastAt, now)}</span>
                                        </span>
                                        <span className="block truncate text-[12px] text-neutral-500">
                                            {c.replying ? <span className="text-primary">{c.agentName} is typing…</span> : `${c.agentName}: ${c.lastMessage}`}
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
                    <EmptyState
                        icon={MessagesSquare}
                        title="Pick a conversation"
                        body="Messages between your agents and the people texting them show up here."
                        action={<Btn onClick={() => setTesting(true)}><FlaskConical />Test a text</Btn>}
                    />
                )}
            </section>
            {testing && <TestTextDialog onClose={() => setTesting(false)} />}
        </>
    )
}

const modelLabel = (id?: string) => BRAIN_MODELS.find((m) => m.id === id)?.label ?? id

function MessageMeta({ m }: { m: Doc<'messages'> }) {
    if (m.from !== 'agent') return null
    const who = m.by === 'you' ? 'You' : m.by === 'ai' ? modelLabel(m.model) : null
    const delivery = m.delivery === 'queued' ? 'Sending…' : m.delivery === 'sent' ? 'Delivered' : null
    return (
        <span className="mt-0.5 block text-right text-[10px] text-neutral-400">
            {[who, delivery].filter(Boolean).join(' · ')}
            {m.delivery === 'failed' && (
                <span className="text-destructive" title={m.deliveryError}>
                    {who ? ' · ' : ''}Not delivered
                </span>
            )}
        </span>
    )
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
    const run = useRun()
    const data = useQuery(api.conversations.thread, { id })
    const send = useMutation(api.conversations.send)
    const resolve = useMutation(api.conversations.resolve)
    const retry = useMutation(api.conversations.retry)
    const remove = useMutation(api.conversations.remove)
    const [text, setText] = useState('')
    const endRef = useRef<HTMLDivElement>(null)
    const count = data?.messages.length
    const replying = data?.conversation.replying

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' })
    }, [count, replying])

    if (data === undefined) return <div className="flex-1 animate-pulse bg-neutral-50/50" />
    if (data === null) return <NotFound what="conversation" onBack={onBack} />
    const { conversation, contact, agent, number, messages, senders } = data
    const group = !!conversation.threadKey
    const lastFromContact = messages.at(-1)?.from === 'contact'

    const submit = async () => {
        const body = text.trim()
        if (!body) return
        setText('')
        const res = await run(send({ id: conversation._id, body }))
        if (!res.ok) setText(body)
    }
    const destroy = async () => {
        const res = await run(remove({ id: conversation._id }))
        if (res.ok) onBack()
    }

    return (
        <>
            <div className="flex h-14 items-center gap-3 border-b border-neutral-200/70 px-4">
                <Btn variant="ghost" size="icon-sm" aria-label="Back" onClick={onBack} className="text-neutral-500 md:hidden">
                    <ArrowLeft />
                </Btn>
                <Initials name={conversation.title ?? contact.name} />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
                        {group ? (conversation.title ?? 'Group chat') : contact.name}
                        {conversation.test && <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] font-normal">Test</Badge>}
                    </p>
                    <p className="truncate text-[11px] text-neutral-500">
                        {group ? `Group · ${Object.keys(senders).length === 1 ? '1 person' : `${Object.keys(senders).length} people`} here so far` : contact.handle}
                        {number && ` → ${number.handle}`}
                    </p>
                </div>
                <span className="hidden items-center gap-2 text-[12px] text-neutral-500 sm:flex">
                    <AgentAvatar agent={agent} size={22} />
                    {agent.name}
                </span>
                <ConfirmDelete onConfirm={destroy} what="this conversation" />
            </div>
            {conversation.problem && (
                <div className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[12px]', conversation.needsYou ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>
                    <AlertTriangle className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{conversation.problem}</span>
                    {conversation.needsYou && lastFromContact && (
                        <Btn className="h-7 bg-white" onClick={() => run(retry({ id: conversation._id }))}>
                            Try again
                        </Btn>
                    )}
                    {conversation.needsYou && (
                        <Btn className="h-7 bg-white" onClick={() => run(resolve({ id: conversation._id }))}>
                            Mark handled
                        </Btn>
                    )}
                </div>
            )}
            <div className="flex-1 overflow-y-auto bg-neutral-50/60 px-4 py-4">
                <div className="mx-auto max-w-2xl space-y-1.5">
                    {messages.map((m) => (
                        <div key={m._id} className={cn('flex', m.from === 'agent' ? 'justify-end' : 'justify-start')}>
                            <div className="max-w-[75%]">
                                {group && m.from === 'contact' && m.senderId && <span className="mb-0.5 ml-3 block text-[10px] text-neutral-500">{senders[m.senderId]}</span>}
                                <div title={new Date(m.at).toLocaleString()} className={cn('rounded-2xl px-3.5 py-2 text-[14px] leading-snug whitespace-pre-wrap', m.from === 'agent' ? 'bg-[#0a84ff] text-white' : 'bg-neutral-200/80 text-neutral-900')}>
                                    {m.body}
                                </div>
                                <MessageMeta m={m} />
                            </div>
                        </div>
                    ))}
                    {replying && !conversation.problem && (
                        <div className="flex justify-end" aria-label={`${agent.name} is typing`}>
                            <div className="flex gap-1 rounded-2xl bg-[#0a84ff]/15 px-3.5 py-3">
                                {[0, 150, 300].map((d) => (
                                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-[#0a84ff]" style={{ animationDelay: `${d}ms` }} />
                                ))}
                            </div>
                        </div>
                    )}
                    <div ref={endRef} />
                </div>
            </div>
            <div className="border-t border-neutral-200/70 p-3">
                {(conversation.test || !number) && (
                    <p className="mx-auto mb-2 max-w-2xl text-[11px] text-neutral-500">
                        {conversation.test ? 'Test conversation: replies are written for real but never sent to a phone.' : 'Its number was removed, so replies stay here until it texts a connected number again.'}
                    </p>
                )}
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
