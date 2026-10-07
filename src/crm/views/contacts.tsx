import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Plus, Users } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { cn } from '@/lib/utils'
import { matches, parseTags } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useRun } from '../toast-context'
import { AgentAvatar, Btn, Cell, ConfirmDelete, Content, Dialog, EmptyState, Field, Initials, inputCls, Row, Scroll, SearchInput, SkeletonRows, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function ContactsView() {
    const now = useNow()
    const contacts = useQuery(api.contacts.list)
    const agents = useQuery(api.agents.list)
    const [q, setQ] = useState('')
    const [editing, setEditing] = useState<Doc<'contacts'> | 'new' | null>(null)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const shown = contacts?.filter((c) => matches(q, c.name, c.handle, ...c.tags))

    return (
        <Content>
            <Toolbar title="Contacts">
                <SearchInput value={q} onChange={setQ} />
                <Btn variant="primary" onClick={() => setEditing('new')}>
                    <Plus />
                    Add contact
                </Btn>
            </Toolbar>
            <Scroll>
                {shown?.length === 0 ? (
                    <EmptyState icon={Users} title={q ? 'No matching contacts' : 'No contacts yet'} body={q ? 'Try a name, handle or tag.' : 'People who text your agents show up here.'} />
                ) : (
                    <Table head={['Name', 'Handle', 'Tags', 'Agent', 'Last seen']}>
                        {!shown ? (
                            <SkeletonRows cols={5} />
                        ) : (
                            shown.map((c) => {
                                const agent = c.agentId && agentById.get(c.agentId)
                                return (
                                    <Row key={c._id} onClick={() => setEditing(c)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5">
                                                <Initials name={c.name} size={26} />
                                                <span className="font-medium text-neutral-900">{c.name}</span>
                                            </span>
                                        </Cell>
                                        <Cell>{c.handle}</Cell>
                                        <Cell>
                                            <span className="flex flex-wrap gap-1">
                                                {c.tags.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">{t}</span>)}
                                            </span>
                                        </Cell>
                                        <Cell>
                                            {agent ? (
                                                <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span>
                                            ) : (
                                                <span className="text-neutral-400">None</span>
                                            )}
                                        </Cell>
                                        <Cell className="text-neutral-500">{c.lastSeenAt ? relativeTime(c.lastSeenAt, now) : 'Never'}</Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {editing && <ContactDialog contact={editing === 'new' ? undefined : editing} agents={agents ?? []} onClose={() => setEditing(null)} />}
        </Content>
    )
}

function ContactDialog({ contact, agents, onClose }: { contact?: Doc<'contacts'>; agents: Doc<'agents'>[]; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.contacts.create)
    const update = useMutation(api.contacts.update)
    const remove = useMutation(api.contacts.remove)
    const [name, setName] = useState(contact?.name ?? '')
    const [handle, setHandle] = useState(contact?.handle ?? '')
    const [tags, setTags] = useState(contact?.tags.join(', ') ?? '')
    const [agentId, setAgentId] = useState<string>(contact?.agentId ?? '')
    const [notes, setNotes] = useState(contact?.notes ?? '')

    const handleOk = handleKind(handle) !== null
    const save = async () => {
        const fields = { name, handle, tags: parseTags(tags), notes, agentId: agentId ? (agentId as Id<'agents'>) : undefined }
        const res = await run(contact ? update({ id: contact._id, ...fields }) : create(fields))
        if (res.ok) onClose()
    }
    const destroy = async () => {
        if (!contact) return
        const res = await run(remove({ id: contact._id }))
        if (res.ok) onClose()
    }

    return (
        <Dialog
            title={contact ? 'Edit contact' : 'Add contact'}
            onClose={onClose}
            footer={
                <>
                    {contact && <span className="mr-auto"><ConfirmDelete onConfirm={destroy} /></span>}
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!name.trim() || !handleOk} onClick={save}>Save</Btn>
                </>
            }
        >
            <Field label="Name">
                <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone or email" hint={handle.trim() && !handleOk ? 'Enter a phone number or an email address.' : undefined}>
                <input className={cn(inputCls, handle.trim() && !handleOk && 'border-red-300')} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+1 (415) 555-0100" />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. client, vip">
                <input className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Agent">
                <select className={inputCls} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    <option value="">None</option>
                    {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                </select>
            </Field>
            <Field label="Notes">
                <textarea className={cn(inputCls, 'h-auto min-h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
        </Dialog>
    )
}
