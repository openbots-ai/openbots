import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Plus, Users } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { handleKind } from '@convex/lib/handles'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { matches, parseTags } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useRun } from '../use-run'
import { AgentAvatar, Btn, Cell, ConfirmDelete, Content, Dialog, EmptyState, Field, Initials, Row, Scroll, SearchInput, Select, SkeletonRows, Table, Toolbar } from '../ui'
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
                                                {c.tags.map((t) => <Badge key={t} variant="secondary" className="rounded px-1.5 text-[11px] font-normal">{t}</Badge>)}
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
    // New contacts start from the workspace defaults in Settings; the dialog only opens once the page has loaded
    const workspace = useQuery(api.workspace.get)
    const [name, setName] = useState(contact?.name ?? '')
    const [handle, setHandle] = useState(contact?.handle ?? '')
    const [tags, setTags] = useState(contact ? contact.tags.join(', ') : (workspace?.newContactTag ?? ''))
    const [agentId, setAgentId] = useState<string>(contact ? (contact.agentId ?? '') : (workspace?.defaultAgentId ?? ''))
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
                    {contact && <span className="mr-auto"><ConfirmDelete onConfirm={destroy} what={contact.name} /></span>}
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!name.trim() || !handleOk} onClick={save}>Save</Btn>
                </>
            }
        >
            <Field label="Name">
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone or email" hint={handle.trim() && !handleOk ? 'Enter a phone number or an email address.' : undefined} error>
                <Input aria-invalid={!!handle.trim() && !handleOk} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="+1 (415) 555-0100" />
            </Field>
            <Field label="Tags" hint="Comma separated, e.g. client, vip">
                <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </Field>
            <Field label="Agent">
                <Select value={agentId} onChange={setAgentId} options={[{ value: '', label: 'None' }, ...agents.map((a) => ({ value: a._id, label: a.name }))]} />
            </Field>
            <Field label="Notes">
                <Textarea className="min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
        </Dialog>
    )
}
