import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ArrowLeft, BookOpen, MessageCircle } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { AVATARS, pickAgentFields, type AgentFields, type AgentStatus } from '../lib/draft'
import { useNav } from '../nav'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, ConfirmDelete, Content, Field, inputCls, NotFound, Scroll, StatusBadge, Toolbar } from '../ui'

export function AgentDetail({ id }: { id: string }) {
    const go = useNav()
    const agent = useQuery(api.agents.get, { id })
    if (agent === undefined) return <Content><Toolbar title="Loading…" /></Content>
    if (agent === null) return <NotFound what="agent" onBack={() => go('agents')} />
    return <AgentEditor agent={agent} />
}

function AgentEditor({ agent }: { agent: Doc<'agents'> }) {
    const go = useNav()
    const run = useRun()
    const update = useMutation(api.agents.update)
    const remove = useMutation(api.agents.remove)
    const agents = useQuery(api.agents.list)
    const numbers = useQuery(api.numbers.list)
    const knowledge = useQuery(api.knowledge.list)
    const [form, setForm] = useState(() => pickAgentFields(agent))

    const set = <K extends keyof AgentFields>(key: K, value: AgentFields[K]) => setForm((f) => ({ ...f, [key]: value }))
    const dirty = JSON.stringify(form) !== JSON.stringify(pickAgentFields(agent))
    const folders = [...new Set((agents ?? []).flatMap((a) => (a.folder ? [a.folder] : [])))]
    const myNumbers = numbers?.filter((n) => n.agentId === agent._id) ?? []
    const myDocs = knowledge?.filter((k) => k.agentId === agent._id) ?? []

    const save = () => run(update({ id: agent._id, ...form, name: form.name.trim(), folder: form.folder?.trim() || undefined }))
    const destroy = async () => {
        const res = await run(remove({ id: agent._id }))
        if (res.ok) go('agents')
    }

    return (
        <Content>
            <Toolbar
                title={
                    <>
                        <button type="button" aria-label="Back to agents" onClick={() => go('agents')} className="grid size-7 cursor-pointer place-items-center rounded-md text-neutral-500 hover:bg-neutral-100">
                            <ArrowLeft className="size-4" />
                        </button>
                        <AgentAvatar agent={form} size={24} />
                        <span className="truncate">{agent.name}</span>
                        <StatusBadge status={agent.status} />
                    </>
                }
            >
                <ConfirmDelete onConfirm={destroy} />
                <Btn variant="primary" disabled={!dirty || !form.name.trim()} onClick={save}>
                    {dirty ? 'Save changes' : 'Saved'}
                </Btn>
            </Toolbar>
            <Scroll>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label="Name">
                                <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
                            </Field>
                            <Field label="Role">
                                <input className={inputCls} value={form.role} onChange={(e) => set('role', e.target.value)} />
                            </Field>
                            <Field label="Status">
                                <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value as AgentStatus)}>
                                    <option value="draft">Draft</option>
                                    <option value="live">Live</option>
                                    <option value="paused">Paused</option>
                                </select>
                            </Field>
                            <Field label="Folder">
                                <input className={inputCls} list="agent-folders" value={form.folder ?? ''} onChange={(e) => set('folder', e.target.value || undefined)} placeholder="None" />
                                <datalist id="agent-folders">
                                    {folders.map((f) => (
                                        <option key={f} value={f} />
                                    ))}
                                </datalist>
                            </Field>
                        </div>
                        <div className="space-y-1.5">
                            <span className="block text-xs font-medium text-neutral-600">Avatar</span>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" aria-label="No avatar" onClick={() => set('avatar', undefined)} className={cn('cursor-pointer rounded-full ring-2 ring-offset-2', !form.avatar ? 'ring-neutral-900' : 'ring-transparent')}>
                                    <AgentAvatar agent={{ ...form, avatar: undefined }} size={36} />
                                </button>
                                {AVATARS.map((src) => (
                                    <button key={src} type="button" aria-label={`Use ${src.split('/').pop()?.replace('.webp', '')}`} onClick={() => set('avatar', src)} className={cn('cursor-pointer rounded-full ring-2 ring-offset-2', form.avatar === src ? 'ring-neutral-900' : 'ring-transparent')}>
                                        <img src={src} alt="" className="size-9 rounded-full bg-neutral-100 object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <Field label="Personality & instructions" hint="How it talks, what it handles, and what it should hand back to you.">
                            <textarea className={cn(inputCls, 'h-auto min-h-40 py-2 leading-relaxed')} value={form.prompt} onChange={(e) => set('prompt', e.target.value)} />
                        </Field>
                        <Field label="First message" hint="Sent when someone texts this agent for the first time.">
                            <input className={inputCls} value={form.greeting} onChange={(e) => set('greeting', e.target.value)} />
                        </Field>
                    </div>

                    <div className="space-y-4">
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><MessageCircle className="size-4 text-neutral-500" />iMessage</h2>
                            {myNumbers.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myNumbers.map((n) => <li key={n._id}>{n.handle}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No number yet. People can't text this agent until it has one.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('numbers')}>Manage numbers</Btn>
                        </section>
                        <section className="rounded-lg border border-neutral-200 p-4">
                            <h2 className="mb-2 flex items-center gap-2 text-[13px] font-medium"><BookOpen className="size-4 text-neutral-500" />Knowledge</h2>
                            {myDocs.length ? (
                                <ul className="space-y-1 text-[13px] text-neutral-700">{myDocs.map((k) => <li key={k._id} className="truncate">{k.title}</li>)}</ul>
                            ) : (
                                <p className="text-[13px] text-neutral-500">No documents. Add some so it knows your rules.</p>
                            )}
                            <Btn className="mt-3" onClick={() => go('knowledge')}>Manage knowledge</Btn>
                        </section>
                    </div>
                </div>
            </Scroll>
        </Content>
    )
}
