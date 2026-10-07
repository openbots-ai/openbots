import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { BookOpen, FileText, Plus } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { matches } from '../lib/text'
import { relativeTime } from '../lib/time'
import { useRun } from '../use-run'
import { AgentAvatar, Btn, Cell, ConfirmDelete, Content, Dialog, EmptyState, Field, Row, Scroll, SearchInput, Select, SkeletonRows, Table, Toolbar } from '../ui'
import { useNow } from '../use-now'

export function KnowledgeView() {
    const now = useNow()
    const docs = useQuery(api.knowledge.list)
    const agents = useQuery(api.agents.list)
    const [q, setQ] = useState('')
    const [editing, setEditing] = useState<Doc<'knowledge'> | 'new' | null>(null)

    const agentById = new Map(agents?.map((a) => [a._id, a]))
    const shown = docs?.filter((d) => matches(q, d.title, d.body))

    return (
        <Content>
            <Toolbar title="Knowledge">
                <SearchInput value={q} onChange={setQ} />
                <Btn variant="primary" onClick={() => setEditing('new')}>
                    <Plus />
                    Add document
                </Btn>
            </Toolbar>
            <Scroll>
                {shown?.length === 0 ? (
                    <EmptyState icon={BookOpen} title={q ? 'No matching documents' : 'No knowledge yet'} body="Rules, prices and preferences your agents should know." />
                ) : (
                    <Table head={['Title', 'Agent', 'Updated']}>
                        {!shown ? (
                            <SkeletonRows cols={3} />
                        ) : (
                            shown.map((d) => {
                                const agent = d.agentId && agentById.get(d.agentId)
                                return (
                                    <Row key={d._id} onClick={() => setEditing(d)}>
                                        <Cell>
                                            <span className="flex items-center gap-2.5 font-medium text-neutral-900">
                                                <FileText className="size-4 text-neutral-400" />
                                                {d.title}
                                            </span>
                                        </Cell>
                                        <Cell>{agent ? <span className="flex items-center gap-2"><AgentAvatar agent={agent} size={20} />{agent.name}</span> : <span className="text-neutral-400">Shared</span>}</Cell>
                                        <Cell className="text-neutral-500">{relativeTime(d.updatedAt, now)}</Cell>
                                    </Row>
                                )
                            })
                        )}
                    </Table>
                )}
            </Scroll>
            {editing && <DocDialog doc={editing === 'new' ? undefined : editing} agents={agents ?? []} onClose={() => setEditing(null)} />}
        </Content>
    )
}

function DocDialog({ doc, agents, onClose }: { doc?: Doc<'knowledge'>; agents: Doc<'agents'>[]; onClose: () => void }) {
    const run = useRun()
    const create = useMutation(api.knowledge.create)
    const update = useMutation(api.knowledge.update)
    const remove = useMutation(api.knowledge.remove)
    const [title, setTitle] = useState(doc?.title ?? '')
    const [body, setBody] = useState(doc?.body ?? '')
    const [agentId, setAgentId] = useState<string>(doc?.agentId ?? '')

    const save = async () => {
        const fields = { title, body, agentId: agentId ? (agentId as Id<'agents'>) : undefined }
        const res = await run(doc ? update({ id: doc._id, ...fields }) : create(fields))
        if (res.ok) onClose()
    }
    const destroy = async () => {
        if (!doc) return
        const res = await run(remove({ id: doc._id }))
        if (res.ok) onClose()
    }

    return (
        <Dialog
            title={doc ? 'Edit document' : 'Add document'}
            onClose={onClose}
            footer={
                <>
                    {doc && <span className="mr-auto"><ConfirmDelete onConfirm={destroy} what={doc.title} /></span>}
                    <Btn onClick={onClose}>Cancel</Btn>
                    <Btn variant="primary" disabled={!title.trim()} onClick={save}>Save</Btn>
                </>
            }
        >
            <Field label="Title">
                <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Agent" hint="Shared documents are available to every agent.">
                <Select value={agentId} onChange={setAgentId} options={[{ value: '', label: 'Shared' }, ...agents.map((a) => ({ value: a._id, label: a.name }))]} />
            </Field>
            <Field label="Content">
                <Textarea className="min-h-48 leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
        </Dialog>
    )
}
