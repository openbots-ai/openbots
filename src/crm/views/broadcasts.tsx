import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Megaphone, Plus, Send, Trash2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { formatWhen } from '../lib/time'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, Content, Dialog, EmptyState, Field, inputCls, Row, Scroll, SkeletonRows, StatusBadge, Table, Toolbar } from '../ui'

export function BroadcastsView() {
    const run = useRun()
    const broadcasts = useQuery(api.broadcasts.list)
    const agents = useQuery(api.agents.list)
    const contacts = useQuery(api.contacts.list)
    const send = useMutation(api.broadcasts.send)
    const remove = useMutation(api.broadcasts.remove)
    const [creating, setCreating] = useState(false)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const tags = [...new Set((contacts ?? []).flatMap((c) => c.tags))].sort()
    const audience = (tag: string) => contacts?.filter((c) => c.tags.includes(tag)).length ?? 0

    return (
        <Content>
            <Toolbar title="Broadcasts">
                <Btn variant="primary" onClick={() => setCreating(true)}>
                    <Plus />
                    New broadcast
                </Btn>
            </Toolbar>
            <Scroll>
                {broadcasts?.length === 0 ? (
                    <EmptyState icon={Megaphone} title="No broadcasts yet" body="Send one message from an agent to everyone with a tag." />
                ) : (
                    <Table head={['Broadcast', 'Agent', 'Audience', 'When', 'Status', '']}>
                        {!broadcasts ? (
                            <SkeletonRows cols={6} />
                        ) : (
                            broadcasts.map((b) => {
                                const agent = agentById.get(b.agentId)
                                return (
                                    <Row key={b._id}>
                                        <Cell>
                                            <p className="font-medium text-neutral-900">{b.title}</p>
                                            <p className="max-w-72 truncate text-[12px] text-neutral-500">{b.body}</p>
                                        </Cell>
                                        <Cell>{agent && <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span>}</Cell>
                                        <Cell>#{b.tag} · {audience(b.tag)} contacts</Cell>
                                        <Cell className="text-neutral-500">{formatWhen(b.scheduledFor)}</Cell>
                                        <Cell><StatusBadge status={b.status} /></Cell>
                                        <Cell className="text-right">
                                            <span className="inline-flex gap-1">
                                                {b.status === 'scheduled' && (
                                                    <Btn onClick={() => run(send({ id: b._id }))}>
                                                        <Send />
                                                        Send now
                                                    </Btn>
                                                )}
                                                <Btn variant="ghost" aria-label={`Delete ${b.title}`} onClick={() => run(remove({ id: b._id }))}>
                                                    <Trash2 />
                                                </Btn>
                                            </span>
                                        </Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {creating && <NewBroadcastDialog agents={agents ?? []} tags={tags} audience={audience} onClose={() => setCreating(false)} />}
        </Content>
    )
}

function NewBroadcastDialog({ agents, tags, audience, onClose }: { agents: Doc<'agents'>[]; tags: string[]; audience: (tag: string) => number; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.broadcasts.create)
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [agentId, setAgentId] = useState<string>(agents[0]?._id ?? '')
    const [tag, setTag] = useState(tags[0] ?? '')
    const [when, setWhen] = useState('')

    const valid = title.trim() && body.trim() && agentId && tag && when
    const save = async () => {
        const res = await run(create({ title, body, agentId: agentId as Id<'agents'>, tag, scheduledFor: new Date(when).getTime() }))
        if (res.ok) onClose()
    }

    return (
        <Dialog title="New broadcast" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!valid} onClick={save}>Schedule</Btn></>}>
            <Field label="Title">
                <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="October check-in" />
            </Field>
            <Field label="From">
                <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
            </Field>
            <Field label="To everyone tagged" hint={tags.length ? `${audience(tag)} contacts` : 'Tag some contacts first.'}>
                <select className={inputCls} value={tag} onChange={(e) => setTag(e.target.value)} disabled={!tags.length}>
                    {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
            </Field>
            <Field label="Message">
                <textarea className={cn(inputCls, 'h-auto min-h-24 py-2')} value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Field label="Send at">
                <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
        </Dialog>
    )
}
